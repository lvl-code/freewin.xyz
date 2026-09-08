-- =====================================================
-- 0029_campaigns.sql
-- Phase 10: Campaign management.
--
-- tracking_links already carries campaign/source/medium/content
-- columns (0025_tracking_links.sql) -- this migration does NOT
-- duplicate UTM storage on campaigns. Instead, campaigns is a
-- first-class entity that a tracking link can optionally be linked
-- to (many tracking links -> one campaign), so campaign-level
-- reporting can group by campaign_id instead of re-parsing free-text
-- UTM strings. A tracking link with no campaign_id keeps working
-- exactly as it does today -- this is fully backward compatible.
-- =====================================================

CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,

    -- Defaults only -- an individual tracking_link's own
    -- campaign/source/medium/content columns still win if set,
    -- consistent with existing System 3 precedence conventions
    -- (see tracking_links vs geo_rules layering).
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_term TEXT,
    utm_content TEXT,

    status TEXT NOT NULL DEFAULT 'active',  -- active | paused | ended | archived
    start_date DATE,
    end_date DATE,
    notes TEXT,

    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_dates ON campaigns(start_date, end_date);

-- Additive FK on the existing tables (nullable -- no backfill required).
ALTER TABLE tracking_links ADD COLUMN campaign_id INTEGER REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_tracking_links_campaign ON tracking_links(campaign_id);

-- These two tables were created in 0027/0028 with a plain (unreferenced)
-- campaign_id INTEGER column, since campaigns did not exist yet at that
-- point in migration order. D1/SQLite does not support adding a REFERENCES
-- constraint to an existing column via ALTER TABLE, so the FK relationship
-- from this point forward is enforced at the application layer
-- (worker/database/analytics.js validates campaign_id against campaigns
-- before insert) rather than by a retroactive schema constraint. This
-- mirrors the existing codebase's own note in 0025 about the pre-existing
-- unconstrained casino_slug column on `clicks`.
CREATE INDEX IF NOT EXISTS idx_analytics_events_campaign ON analytics_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_conversions_campaign ON analytics_conversions(campaign_id);

INSERT OR IGNORE INTO permissions (role, resource, action, allowed) VALUES
    ('editor', 'campaigns', 'read',   1),
    ('editor', 'campaigns', 'create', 1),
    ('editor', 'campaigns', 'update', 1),
    ('editor', 'campaigns', 'delete', 0);
