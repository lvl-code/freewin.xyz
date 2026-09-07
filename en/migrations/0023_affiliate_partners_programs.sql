-- =====================================================
-- 0023_affiliate_partners_programs.sql
-- System 1: Affiliate Partner & Program Management.
--
-- Deployment model reminder: this codebase runs as six independent
-- environments (freewin, lummet, levelcasino, clustercasino,
-- neuroodds, brilliantodds), each with its own D1 database. There is
-- no shared tenant DB, so no tenant_id column is added anywhere in
-- this migration. Lummet reaches this data only through the existing
-- authenticated Super API (worker/super/*) -- never direct DB access.
--
-- Relationship model (per architectural correction):
--   Affiliate Partner -> Affiliate Program -> Affiliate Program Casino -> Casino
-- A partner is never linked to a casino directly. A program can cover
-- multiple casinos; a casino can sit under multiple programs at once
-- (or none). Commercial terms can attach at the program, account,
-- casino, and/or GEO level simultaneously -- see the precedence note
-- on affiliate_commercial_terms below.
--
-- Deletion policy: affiliate/program/account/terms rows are
-- commercially significant history. None of the foreign keys below
-- use ON DELETE CASCADE for that reason -- see per-table notes.
-- Application code (Phase 3C) must check for dependents and offer
-- archival (status change) before allowing a hard delete.
--
-- Purely additive: no existing table is dropped or altered in a
-- breaking way. The one exception is `audit_logs`, which gains a new
-- nullable `metadata` column (see bottom of file) -- additive only,
-- every existing row and every existing reader of that table is
-- unaffected.
-- =====================================================

-- ── Affiliate Partner ──────────────────────────────
-- The external company/network you have a relationship with.
CREATE TABLE IF NOT EXISTS affiliate_partners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    website TEXT,
    description TEXT,
    partner_type TEXT DEFAULT 'network',      -- 'network' | 'direct' | 'agency' | 'other'
    status TEXT DEFAULT 'active',             -- 'active' | 'inactive' | 'archived'
    contact_name TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    notes TEXT,
    external_reference TEXT,                  -- optional ID in the partner's own system
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_affiliate_partners_status ON affiliate_partners(status);
CREATE INDEX IF NOT EXISTS idx_affiliate_partners_slug ON affiliate_partners(slug);

-- Additional contacts beyond the single primary contact on the partner row.
-- ON DELETE CASCADE is fine here: contacts have no independent
-- commercial meaning once their partner is gone.
CREATE TABLE IF NOT EXISTS affiliate_partner_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_id INTEGER NOT NULL REFERENCES affiliate_partners(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT,
    email TEXT,
    phone TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_partner_contacts_partner ON affiliate_partner_contacts(partner_id);

-- ── Affiliate Program ──────────────────────────────
-- A specific program run by a partner. A partner may run several
-- programs (e.g. different brands, different deal structures).
-- ON DELETE RESTRICT: a partner with live programs cannot be hard-deleted;
-- the API must require archiving the programs first (or archive the
-- partner instead of deleting it).
CREATE TABLE IF NOT EXISTS affiliate_programs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_id INTEGER NOT NULL REFERENCES affiliate_partners(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'active',             -- 'active' | 'paused' | 'ended' | 'archived'
    portal_url TEXT,
    supported_geos TEXT,                      -- JSON array of ISO country codes; NULL = no restriction
    reporting_notes TEXT,
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_affiliate_programs_partner ON affiliate_programs(partner_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_programs_status ON affiliate_programs(status);

-- ── Affiliate Program <-> Casino (many-to-many) ────
-- This is the ONLY link between the partner/program domain and
-- casinos. A casino can appear under multiple programs at once
-- (multiple programs competing for the same casino is expected and
-- supported); a casino with no rows here simply has no affiliate
-- program attached yet.
-- ON DELETE CASCADE from the program side is fine (the join row has
-- no meaning without the program); CASCADE from the casino side is
-- also fine for the same reason -- neither loses commercially
-- significant data, since the terms/history live on
-- affiliate_commercial_terms, not on this join table.
CREATE TABLE IF NOT EXISTS affiliate_program_casinos (
    program_id INTEGER NOT NULL REFERENCES affiliate_programs(id) ON DELETE CASCADE,
    casino_id INTEGER NOT NULL REFERENCES casinos(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'active',             -- 'active' | 'inactive'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (program_id, casino_id)
);
CREATE INDEX IF NOT EXISTS idx_program_casinos_casino ON affiliate_program_casinos(casino_id);

-- ── Affiliate Account ──────────────────────────────
-- A login/account within a program. One program can have several
-- accounts (e.g. different sub-affiliate IDs with different
-- negotiated rates -- see affiliate_commercial_terms.account_id).
-- Metadata only: `credential_reference` points at a secret-store key
-- name; it is never the secret itself. No password/token/API-secret
-- column exists on this table by design.
-- ON DELETE RESTRICT: an account with commercial terms attached to it
-- must not disappear silently.
CREATE TABLE IF NOT EXISTS affiliate_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    program_id INTEGER NOT NULL REFERENCES affiliate_programs(id) ON DELETE RESTRICT,
    account_name TEXT NOT NULL,
    external_account_id TEXT,
    status TEXT DEFAULT 'active',             -- 'active' | 'inactive' | 'archived'
    portal_url TEXT,
    notes TEXT,
    credential_reference TEXT,                -- pointer into secret store; NEVER the secret itself
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_affiliate_accounts_program ON affiliate_accounts(program_id);

-- ── Commercial Terms ───────────────────────────────
-- Versioned, historically preserved. A row is never overwritten in
-- place once it has been active: changing terms means closing the
-- old row (setting expiry_date) and inserting a new one, so
-- "what were the terms for casino X on date Y" is always answerable.
--
-- SPECIFICITY / PRECEDENCE (resolved in application code, Phase 3C --
-- deliberately NOT a stored priority column, per business decision:
-- manual priorities become unmaintainable across six independent
-- deployments and future Lummet-level management; the hierarchy
-- below is closed and deterministic):
--
--   1. account_id + casino_id + geo_code   (most specific)
--   2. account_id + casino_id
--   3. account_id + geo_code
--   4. account_id only
--   5. program_id + casino_id + geo_code
--   6. program_id + casino_id
--   7. program_id + geo_code
--   8. program_id only                     (least specific / fallback)
--
-- More matching non-null dimensions always outrank fewer, regardless
-- of which dimensions they are; account-scoped outranks
-- program-only-scoped at the same dimension count because an account
-- is a more specific commercial relationship than the program at
-- large.
--
-- AMBIGUITY GUARD: SQLite has no range-overlap exclusion constraint
-- (no equivalent of Postgres EXCLUDE USING gist), so "no two active
-- terms with identical scope and overlapping date ranges" cannot be
-- expressed as a table constraint here. This MUST be enforced in
-- application code before a term is inserted or activated (Phase 3C):
-- query existing rows with status = 'active' and the same
-- (program_id, account_id, casino_id, geo_code) tuple whose
-- [effective_date, expiry_date) range overlaps the new row's range,
-- and reject the write if any are found. Do not skip this check.
--
-- ON DELETE CASCADE from program_id: acceptable ONLY because terms
-- are also protected transitively -- a program cannot be hard-deleted
-- while it has casinos attached (RESTRICT above) or, going forward,
-- application code should additionally block program deletion when
-- historical commercial_terms rows exist, preferring archival. This
-- is enforced in Phase 3C, not by the schema.
CREATE TABLE IF NOT EXISTS affiliate_commercial_terms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    program_id INTEGER NOT NULL REFERENCES affiliate_programs(id) ON DELETE RESTRICT,
    account_id INTEGER REFERENCES affiliate_accounts(id) ON DELETE RESTRICT,  -- NULL = program-level terms
    casino_id INTEGER REFERENCES casinos(id),   -- NULL = applies to all casinos under this scope
    geo_code TEXT,                                -- NULL = applies to all GEOs
    term_type TEXT NOT NULL,                      -- 'cpa' | 'revshare' | 'hybrid' | 'fixed_fee' | 'custom'
    cpa_amount REAL,
    revshare_percent REAL,
    hybrid_cpa_amount REAL,
    hybrid_revshare_percent REAL,
    fixed_fee_amount REAL,
    currency TEXT DEFAULT 'USD',
    custom_terms_json TEXT,                       -- structured escape hatch for term_type = 'custom'
    effective_date DATE NOT NULL,
    expiry_date DATE,                             -- NULL = currently in effect
    status TEXT DEFAULT 'active',                 -- 'active' | 'superseded' | 'draft'
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_commercial_terms_program ON affiliate_commercial_terms(program_id);
CREATE INDEX IF NOT EXISTS idx_commercial_terms_account ON affiliate_commercial_terms(account_id);
CREATE INDEX IF NOT EXISTS idx_commercial_terms_casino ON affiliate_commercial_terms(casino_id);
CREATE INDEX IF NOT EXISTS idx_commercial_terms_lookup
    ON affiliate_commercial_terms(program_id, account_id, casino_id, geo_code, effective_date, expiry_date);

-- ── Permissions (role-level) ───────────────────────
-- Registers the new resources with the existing role/resource/action
-- permission table. Mirrors the existing 'admin gets everything
-- implicitly' behavior (permissions.js: admin role bypasses this
-- table entirely) -- these rows govern non-admin roles only, and
-- follow the same allow-by-default-for-editor convention already
-- used for comparable content resources (casinos, reviews). Adjust
-- per-role via the existing /en/dashboard/permissions UI same as any
-- other resource -- no new UI needed for this part.
INSERT OR IGNORE INTO permissions (role, resource, action, allowed) VALUES
    ('editor', 'affiliate_partners', 'read',   1),
    ('editor', 'affiliate_partners', 'create', 1),
    ('editor', 'affiliate_partners', 'update', 1),
    ('editor', 'affiliate_partners', 'delete', 0),
    ('editor', 'affiliate_programs', 'read',   1),
    ('editor', 'affiliate_programs', 'create', 1),
    ('editor', 'affiliate_programs', 'update', 1),
    ('editor', 'affiliate_programs', 'delete', 0),
    ('editor', 'affiliate_accounts', 'read',   1),
    ('editor', 'affiliate_accounts', 'create', 1),
    ('editor', 'affiliate_accounts', 'update', 1),
    ('editor', 'affiliate_accounts', 'delete', 0),
    ('editor', 'commercial_terms',   'read',   1),
    ('editor', 'commercial_terms',   'create', 1),
    ('editor', 'commercial_terms',   'update', 1),
    ('editor', 'commercial_terms',   'delete', 0);

-- ── audit_logs: additive column only ───────────────
-- audit_logs currently has no column for "what changed" (only
-- user_id/action/entity_type/entity_id). It has zero existing call
-- sites in the app today (confirmed by code search), so this is safe
-- to extend without touching any existing writer or reader. Nullable,
-- no default-breaking effect on any pre-existing row.
ALTER TABLE audit_logs ADD COLUMN metadata TEXT;
