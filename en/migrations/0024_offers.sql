-- =====================================================
-- 0024_offers.sql
-- System 2: Offer & Bonus Management.
--
-- Relationship to casinos.bonus_title/bonus_value: those two legacy
-- columns are read directly by public templates today
-- (templates/components/casino_grid.html, templates/pages/casino.html,
-- via client-side JS reading casino.bonus_title/bonus_value from the
-- API response). This migration does NOT touch or remove them --
-- they remain the final fallback in a three-rung chain that the
-- offer-selection service (Phase 4C) will implement:
--
--   1. Active, GEO-eligible Offer for this casino  (this migration)
--   2. geo_rules.bonus_override for the visitor's country  (pre-existing)
--   3. casinos.bonus_title / casinos.bonus_value  (pre-existing, legacy)
--
-- geo_rules.bonus_override is a pre-existing, more primitive
-- precursor to this system, already applied on the live casino page
-- render path (worker/controllers.js, via getGeoRule()). Offers
-- supersede it when an eligible offer exists; casinos with no offers
-- yet keep working exactly as they do today, unmodified.
--
-- GEO integration: per the architectural instruction not to duplicate
-- the GEO engine, this migration does NOT add a parallel per-country
-- rules table. allowed_geos/blocked_geos on `offers` are a simple
-- JSON allow/block list, evaluated by the offer-selection service
-- (Phase 4C) alongside (not instead of) the existing geo_rules casino
-- eligibility check (geoEngine.evaluateAccess) -- the service composes
-- both; casino-level GEO blocking already handled by geo_rules always
-- wins first (a GEO-blocked casino shows no offer regardless of what
-- the offer itself allows).
--
-- Deletion policy: offers are commercially significant and are never
-- hard-deleted by this schema's design -- status transitions to
-- 'expired'/'disabled' are the intended lifecycle. No DELETE endpoint
-- is planned for offers in the API (Phase 4E), only status changes.
-- offer_versions is intentionally append-only with no update/delete
-- path at all.
--
-- IMPORTANT: casinos.id is referenced WITHOUT "ON DELETE CASCADE"
-- (deliberately -- see below). This codebase's deleteCasino() does a
-- genuine hard DELETE with no existing dependent-check today, so a
-- naive CASCADE here would let deleting a casino silently destroy all
-- of its offer history -- exactly what the "do not permanently delete
-- commercially important historical records" principle rules out.
-- With no ON DELETE clause, SQLite's default (NO ACTION, enforced
-- because PRAGMA foreign_keys=ON everywhere in this codebase) blocks
-- the casino delete outright while offers reference it. Phase 4C must
-- add a getCasinoOfferDependents()-style check (mirroring
-- getPartnerDependents() from System 1) so the admin gets a clear
-- "archive the casino or its offers first" message instead of a raw
-- FK error -- this is an application-layer follow-up, not something
-- this migration can enforce by itself.
-- =====================================================

CREATE TABLE IF NOT EXISTS offers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    casino_id INTEGER NOT NULL REFERENCES casinos(id),
    program_id INTEGER REFERENCES affiliate_programs(id),  -- which program this offer is commercially tied to; NULL = not yet linked to a program
    offer_type TEXT NOT NULL,                 -- 'welcome' | 'deposit' | 'no_deposit' | 'free_spins' |
                                               -- 'cashback' | 'reload' | 'vip' | 'tournament' | 'custom'
    internal_name TEXT NOT NULL,
    public_headline TEXT,
    public_description TEXT,
    bonus_amount REAL,
    bonus_percent REAL,
    currency TEXT,
    free_spins_qty INTEGER,
    min_deposit REAL,
    max_bonus REAL,
    wagering_multiplier REAL,
    max_bet REAL,
    eligible_games TEXT,                      -- JSON array of game names/categories, or free text
    terms_and_conditions TEXT,
    start_date DATETIME,
    expiry_date DATETIME,
    status TEXT DEFAULT 'draft',              -- 'draft' | 'scheduled' | 'active' | 'expired' | 'disabled'
    priority INTEGER DEFAULT 0,               -- tie-breaker when multiple active offers qualify for one casino+GEO
    allowed_geos TEXT,                        -- JSON array of ISO country codes; NULL = inherit casino-level geo_rules only
    blocked_geos TEXT,                        -- JSON array of ISO country codes
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_offers_casino ON offers(casino_id);
CREATE INDEX IF NOT EXISTS idx_offers_program ON offers(program_id);
CREATE INDEX IF NOT EXISTS idx_offers_status ON offers(status);
CREATE INDEX IF NOT EXISTS idx_offers_dates ON offers(start_date, expiry_date);
-- Composite index for the hot path: "give me the active offers for casino X, ranked by priority"
CREATE INDEX IF NOT EXISTS idx_offers_selection ON offers(casino_id, status, priority);

-- Append-only history. Every update to a PUBLISHED offer (status was
-- or is 'active'/'scheduled'/'expired' -- i.e. it was ever live)
-- writes the full previous row here as a JSON snapshot before
-- applying the change, so "what was active for casino X on date Y"
-- is answerable without guesswork. Draft-to-draft edits (an offer
-- that has never gone live) do not need a version row -- there is no
-- history to preserve yet. This distinction is enforced in
-- application code (Phase 4C), not by this schema.
CREATE TABLE IF NOT EXISTS offer_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    offer_id INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    snapshot_json TEXT NOT NULL,              -- full serialized offer row at time of change
    changed_by INTEGER REFERENCES users(id),
    change_reason TEXT,
    valid_from DATETIME NOT NULL,
    valid_to DATETIME,                        -- NULL = this snapshot was current until superseded/now
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(offer_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_offer_versions_offer ON offer_versions(offer_id);
CREATE INDEX IF NOT EXISTS idx_offer_versions_lookup ON offer_versions(offer_id, valid_from, valid_to);

-- ── Permissions (role-level) ───────────────────────
INSERT OR IGNORE INTO permissions (role, resource, action, allowed) VALUES
    ('editor', 'offers', 'read',   1),
    ('editor', 'offers', 'create', 1),
    ('editor', 'offers', 'update', 1),
    ('editor', 'offers', 'delete', 0);
