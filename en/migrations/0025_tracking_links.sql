-- =====================================================
-- 0025_tracking_links.sql
-- System 3: Central Tracking Link Management & Link Health Monitoring.
--
-- Deletion policy: tracking_links are never hard-deleted (mirrors the
-- offers policy from migration 0021) -- status transitions
-- ('active' -> 'disabled'/'archived') are the intended lifecycle, and
-- there is deliberately no DELETE endpoint planned for them (Phase 5E).
-- All of a tracking link's own foreign keys (casino/partner/program/
-- offer) use plain REFERENCES with no ON DELETE clause, so SQLite's
-- default NO ACTION (enforced, since PRAGMA foreign_keys=ON) blocks
-- deleting any of those while a tracking link still points at them --
-- consistent with System 1 and System 2's "prefer RESTRICT over
-- silent history loss" approach.
--
-- tracking_link_geo_destinations and tracking_link_health_checks DO
-- cascade from tracking_link_id: the first is live configuration with
-- no independent historical value once its parent link is gone, and
-- the second's cascade is defensive-only in practice, since tracking
-- links themselves are never hard-deleted (same reasoning as
-- offer_versions cascading from offers in migration 0021).
--
-- clicks table: extended additively with tracking_link_id and
-- offer_id (nullable, both proper FKs). Note the PRE-EXISTING
-- casino_slug column on this table has no FK at all -- that's
-- pre-existing looseness from before this project and is left
-- untouched; the new columns get real foreign keys since D1/SQLite
-- supports them and the newer systems in this project hold a higher
-- bar.
-- =====================================================

CREATE TABLE IF NOT EXISTS tracking_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    internal_name TEXT NOT NULL,
    tracking_code TEXT UNIQUE NOT NULL,       -- the /en/go/:tracking_code slug -- see worker/tracking/redirect.js (Phase 5C) for resolution order against legacy casino.slug links
    destination_url TEXT NOT NULL,            -- validated at write time (Phase 5C/5E) -- absolute https URL, not this site's own domain (open-redirect guard)
    casino_id INTEGER REFERENCES casinos(id),
    partner_id INTEGER REFERENCES affiliate_partners(id),
    program_id INTEGER REFERENCES affiliate_programs(id),
    offer_id INTEGER REFERENCES offers(id),
    campaign TEXT,
    source TEXT,
    medium TEXT,
    content TEXT,
    allowed_geos TEXT,                        -- JSON array of ISO country codes; NULL = no extra restriction beyond casino-level geo_rules
    blocked_geos TEXT,
    priority INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',             -- 'active' | 'disabled' | 'archived'
    health_status TEXT DEFAULT 'unknown',     -- 'unknown' | 'healthy' | 'warning' | 'broken' | 'restricted' | 'timeout' | 'disabled'
    health_checked_at DATETIME,
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tracking_links_code ON tracking_links(tracking_code);
CREATE INDEX IF NOT EXISTS idx_tracking_links_casino ON tracking_links(casino_id);
CREATE INDEX IF NOT EXISTS idx_tracking_links_offer ON tracking_links(offer_id);
CREATE INDEX IF NOT EXISTS idx_tracking_links_status ON tracking_links(status);
CREATE INDEX IF NOT EXISTS idx_tracking_links_health ON tracking_links(health_status);
-- Composite index for the hot path: "give me the active, healthy candidate links for casino X"
CREATE INDEX IF NOT EXISTS idx_tracking_links_selection ON tracking_links(casino_id, status, priority);

-- GEO-specific destination overrides for a single tracking link
-- (e.g. Canada -> Destination A, Germany -> Destination B, default ->
-- destination_url). Validated the same way as destination_url --
-- no open-redirect surface here either.
CREATE TABLE IF NOT EXISTS tracking_link_geo_destinations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tracking_link_id INTEGER NOT NULL REFERENCES tracking_links(id) ON DELETE CASCADE,
    country_code TEXT NOT NULL,
    destination_url TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tracking_link_id, country_code)
);
CREATE INDEX IF NOT EXISTS idx_tl_geo_dest_link ON tracking_link_geo_destinations(tracking_link_id);

-- Historical health-check results. health_status here uses the same
-- 7-state vocabulary as tracking_links.health_status (kept in sync by
-- the health-check service, Phase 5C) plus structured failure detail
-- so a 403 from bot-detection is never conflated with a genuinely
-- dead destination -- see error_type below.
CREATE TABLE IF NOT EXISTS tracking_link_health_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tracking_link_id INTEGER NOT NULL REFERENCES tracking_links(id) ON DELETE CASCADE,
    checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    http_status INTEGER,
    final_url TEXT,
    redirect_count INTEGER,
    response_time_ms INTEGER,
    error_type TEXT,                          -- 'network_error' | 'timeout' | 'invalid_url' | 'too_many_redirects' | 'http_error' | 'geo_restricted' | 'bot_restricted'
    error_message TEXT,
    health_status TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tl_health_link ON tracking_link_health_checks(tracking_link_id, checked_at);
-- Retention: this table is pruned by the health-check service itself
-- (Phase 5C), not by this migration -- keep the last N checks per
-- link rather than growing unbounded, mirroring the auth_attempts
-- sliding-window pattern already used elsewhere in this codebase.

-- Extend the existing clicks table non-destructively.
ALTER TABLE clicks ADD COLUMN tracking_link_id INTEGER REFERENCES tracking_links(id);
ALTER TABLE clicks ADD COLUMN offer_id INTEGER REFERENCES offers(id);

-- Feature-flag gate for scheduled health checks (see this file's
-- header and Phase 5C/5G) -- defaults OFF. Enabling the actual
-- Cloudflare cron trigger in wrangler.jsonc is a separate, deliberate
-- infra step outside this migration's scope; this flag only controls
-- whether the scheduled() handler's health-check task is a no-op when
-- that trigger does eventually fire.
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('tracking_link_health_cron_enabled', 'false');

-- ── Permissions (role-level) ───────────────────────
INSERT OR IGNORE INTO permissions (role, resource, action, allowed) VALUES
    ('editor', 'tracking_links', 'read',   1),
    ('editor', 'tracking_links', 'create', 1),
    ('editor', 'tracking_links', 'update', 1),
    ('editor', 'tracking_links', 'delete', 0);
