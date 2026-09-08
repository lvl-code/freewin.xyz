-- =====================================================
-- 0028_analytics_conversions.sql
-- Phase 3: Conversion / revenue / commission model.
--
-- Purely additive. Reuses affiliate_commercial_terms (0023) as the
-- source of truth for CPA/RevShare/Hybrid rates -- this migration
-- does NOT hardcode any commission math or duplicate that table.
-- commercial_term_id records exactly which rule was applied so every
-- calculated_commission value is auditable/reproducible later, even
-- if the underlying term is superseded afterward.
--
-- Attribution policy (confirmed default, see audit open question 4):
-- exact click_id match only. A conversion with no matching click_id
-- is stored with click_id = NULL and must be surfaced in reporting
-- as "unattributed" -- never guessed via time-window or last-touch
-- heuristics. If a broader model is wanted later this table's shape
-- does not need to change, only the matching logic in
-- worker/database/analytics.js.
--
-- Currency policy (confirmed default, see audit open question 5):
-- stored per-row, never auto-converted. Aggregation (analytics_daily)
-- keys on (date, dimension, currency) specifically so amounts in
-- different currencies are never summed together.
-- =====================================================

CREATE TABLE IF NOT EXISTS analytics_conversions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    click_id TEXT,                          -- NULL = unattributed; matched against
                                             -- analytics_events.click_id, never inferred

    tracking_link_id INTEGER REFERENCES tracking_links(id),
    offer_id INTEGER REFERENCES offers(id),
    casino_id INTEGER REFERENCES casinos(id),
    partner_id INTEGER REFERENCES affiliate_partners(id),
    program_id INTEGER REFERENCES affiliate_programs(id),
    account_id INTEGER REFERENCES affiliate_accounts(id),
    commercial_term_id INTEGER REFERENCES affiliate_commercial_terms(id),
    campaign_id INTEGER,                    -- FK added in 0029_campaigns.sql

    conversion_type TEXT NOT NULL,          -- registration | qualified_lead | ftd | deposit |
                                             -- cpa_conversion | revshare | hybrid | adjustment |
                                             -- refund | chargeback
    status TEXT NOT NULL DEFAULT 'pending', -- pending | confirmed | rejected

    reported_value REAL,                    -- as received from partner/postback feed -- never invented
    calculated_commission REAL,             -- derived at calc time via commercial_term_id
    currency TEXT NOT NULL DEFAULT 'USD',

    country_code TEXT,

    external_reference TEXT,                -- partner's own conversion/transaction id, for postback dedupe
    occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_conversions_click ON analytics_conversions(click_id);
CREATE INDEX IF NOT EXISTS idx_conversions_link ON analytics_conversions(tracking_link_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_conversions_account ON analytics_conversions(account_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_conversions_status ON analytics_conversions(status);
CREATE INDEX IF NOT EXISTS idx_conversions_type ON analytics_conversions(conversion_type, occurred_at);
-- Dedupe guard: the same partner-side conversion should not be recorded twice.
-- NULL external_reference rows are exempt (SQLite UNIQUE ignores NULLs), which
-- is intentional -- not every conversion source provides one.
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversions_external_ref
    ON analytics_conversions(account_id, external_reference);

INSERT OR IGNORE INTO permissions (role, resource, action, allowed) VALUES
    ('editor', 'analytics_conversions', 'read',   1),
    ('editor', 'analytics_conversions', 'create', 1),
    ('editor', 'analytics_conversions', 'update', 1),
    ('editor', 'analytics_conversions', 'delete', 0);
