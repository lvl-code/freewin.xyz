-- =====================================================
-- 0027_analytics_events.sql
-- Phase 2: Canonical analytics event model + daily aggregates.
--
-- Purely additive. Does not touch clicks, offers, tracking_links,
-- affiliate_* or any existing table. The pre-existing `clicks` table
-- (baseline schema.sql + tracking_link_id/offer_id added in 0025)
-- remains the System-3 click-redirect log and is NOT replaced --
-- analytics_events is a superset event stream that redirect.js and
-- future public-page instrumentation write to going forward,
-- alongside (not instead of) the existing clicks insert.
--
-- Privacy: no raw IP, no raw user-agent string, no PII columns.
-- visitor_hash is expected to be a salted hash computed by the
-- caller (mirrors the existing ip_hash convention in clicks.js) --
-- this migration does not itself define the hashing, only the column.
--
-- Retention: raw analytics_events rows are pruned per
-- system_settings key 'analytics.retention_days' (see worker/cron.js
-- pruneAnalyticsRetention, Phase 13). analytics_daily rows are
-- long-lived and never pruned by that job.
-- =====================================================

CREATE TABLE IF NOT EXISTS analytics_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    event_type TEXT NOT NULL,              -- PAGE_VIEW | CASINO_VIEW | REVIEW_VIEW | OFFER_VIEW |
                                            -- OFFER_CLICK | TRACKING_LINK_CLICK | AFFILIATE_REDIRECT |
                                            -- OUTBOUND_CLICK | CONTENT_VIEW | CTA_CLICK | BANNER_VIEW |
                                            -- BANNER_CLICK | SEARCH | USER_LOGIN | USER_REGISTRATION
                                            -- Validated in application code (worker/database/analytics.js),
                                            -- not via CHECK constraint, to match this codebase's existing
                                            -- convention of validating status/type strings in JS (see
                                            -- offers.js, tracking-links.js) rather than in SQL.
    occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Content dimensions
    casino_id INTEGER REFERENCES casinos(id),
    review_id INTEGER REFERENCES reviews(id),
    page_id INTEGER REFERENCES pages(id),
    news_id INTEGER REFERENCES news(id),

    -- Affiliate dimensions (all nullable -- most event types touch none of these)
    offer_id INTEGER REFERENCES offers(id),
    offer_version_id INTEGER REFERENCES offer_versions(id),
    tracking_link_id INTEGER REFERENCES tracking_links(id),
    partner_id INTEGER REFERENCES affiliate_partners(id),
    program_id INTEGER REFERENCES affiliate_programs(id),
    account_id INTEGER REFERENCES affiliate_accounts(id),
    campaign_id INTEGER,                   -- FK added in 0029_campaigns.sql once that table exists

    -- Geo / device / traffic-source dimensions
    country_code TEXT,
    region TEXT,
    city TEXT,
    device_type TEXT,                      -- desktop | mobile | tablet | bot | unknown
    browser TEXT,
    os TEXT,
    referrer TEXT,
    landing_page TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_term TEXT,
    utm_content TEXT,

    -- Identity / correlation (anonymous only)
    session_id TEXT,
    visitor_hash TEXT,
    click_id TEXT,                         -- generated at click time; carried forward so a later
                                            -- conversion (analytics_conversions.click_id) can attribute
                                            -- back to this exact event without guessing
    user_id INTEGER REFERENCES users(id),  -- only set for USER_LOGIN/USER_REGISTRATION or logged-in actions

    -- Value (only meaningful for a small subset of event types)
    value REAL,
    currency TEXT,

    metadata TEXT,                         -- JSON escape hatch, same convention as audit_logs.metadata

    is_bot INTEGER DEFAULT 0,
    is_duplicate INTEGER DEFAULT 0
);

-- Indexes chosen for the read patterns in the analytics/reporting brief:
-- per-dimension time-series, and click_id lookup for attribution.
CREATE INDEX IF NOT EXISTS idx_analytics_events_type_time ON analytics_events(event_type, occurred_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_tracking_link ON analytics_events(tracking_link_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_offer ON analytics_events(offer_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_casino ON analytics_events(casino_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_partner ON analytics_events(partner_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_country ON analytics_events(country_code, occurred_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_click_id ON analytics_events(click_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session ON analytics_events(session_id, occurred_at);

-- ── Daily aggregates ────────────────────────────────
-- One row per (date, dimension_type, dimension_id, currency).
-- Populated by the scheduled aggregation job (Phase 4), never
-- written to directly from request handlers. Dashboard/report
-- queries for any range wider than "today" read this table, never
-- analytics_events, to keep D1 query cost bounded (see audit §8).
CREATE TABLE IF NOT EXISTS analytics_daily (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,                    -- YYYY-MM-DD, tenant-local timezone per
                                            -- system_settings key 'analytics.timezone'
    dimension_type TEXT NOT NULL,          -- casino | offer | tracking_link | partner | program |
                                            -- account | country | campaign | content | overall
    dimension_id INTEGER,                  -- NULL when dimension_type = 'overall'

    page_views INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    unique_clicks INTEGER DEFAULT 0,
    conversions INTEGER DEFAULT 0,
    revenue REAL DEFAULT 0,
    commission REAL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',

    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(date, dimension_type, dimension_id, currency)
);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_lookup ON analytics_daily(dimension_type, dimension_id, date);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_date ON analytics_daily(date);

-- ── Permissions (role-level) ────────────────────────
-- Same allow-editor-read/write-deny-editor-delete convention as
-- 0023_affiliate_partners_programs.sql. Admin bypasses this table
-- entirely per permissions.js. Analytics is read-mostly for editors;
-- editors should not be able to delete raw event history.
INSERT OR IGNORE INTO permissions (role, resource, action, allowed) VALUES
    ('editor', 'analytics',              'read',   1),
    ('editor', 'analytics',              'create', 0),
    ('editor', 'analytics',              'update', 0),
    ('editor', 'analytics',              'delete', 0);
