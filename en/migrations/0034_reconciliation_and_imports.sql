-- =====================================================
-- 0034_reconciliation_and_imports.sql
-- Import pipeline (brief §11) + commission reconciliation (brief §12-13).
--
-- Key design decision: reconciliation compares TWO CHANNELS of the
-- SAME analytics_conversions table rather than a parallel table --
-- brief's explicit instruction ("do not create a parallel analytics
-- system if an existing system can be extended", "do not create
-- duplicate tables when an existing table can be extended safely").
--
--   source = 'postback' | 'manual'  -- what THIS platform received/
--            recorded in real time (the "INTERNAL EXPECTED" side of
--            brief §12), commission always our own calculated_commission.
--   source = 'import'               -- a later batch statement from
--            the network (the "EXTERNAL REPORTED" side), carrying the
--            network's OWN reported_commission figure for comparison.
--
-- Both can legitimately exist for the SAME external_reference (e.g.
-- GG.BET posts an FTD in real time, then their monthly statement
-- lists the same transaction with their own commission number) --
-- that overlap is exactly what reconciliation needs to compare. The
-- OLD 2-column unique index (account_id, external_reference) would
-- have blocked that by treating the statement row as a duplicate of
-- the postback row, so it's replaced with a 3-column index that scopes
-- dedup to within a single source -- a postback replay is still
-- rejected as a duplicate exactly as before; a statement import is not
-- confused with the postback that preceded it.
-- =====================================================

ALTER TABLE analytics_conversions ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
-- 'postback' | 'manual' | 'import' -- validated in application code
-- (worker/database/analytics.js), same convention as conversion_type/
-- status already established in 0027/0028.

ALTER TABLE analytics_conversions ADD COLUMN reported_commission REAL;
-- Only ever populated on source='import' rows -- the network's OWN
-- stated commission figure, kept separate from calculated_commission
-- (which this platform always computes itself, never trusts from a
-- caller) so reconciliation can show both side by side rather than
-- one value silently overwriting the other.

DROP INDEX IF EXISTS idx_conversions_external_ref;
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversions_external_ref_source
    ON analytics_conversions(account_id, external_reference, source);

CREATE INDEX IF NOT EXISTS idx_conversions_source ON analytics_conversions(source, occurred_at);

-- ── Import batches (brief §11: "show import errors clearly") ──────
CREATE TABLE IF NOT EXISTS import_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES affiliate_accounts(id) ON DELETE RESTRICT,
    label TEXT,
    format TEXT NOT NULL,                    -- 'csv' | 'json'
    total_rows INTEGER NOT NULL DEFAULT 0,
    imported_count INTEGER NOT NULL DEFAULT 0,
    duplicate_count INTEGER NOT NULL DEFAULT 0,
    unattributed_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    errors_json TEXT,                        -- capped array of { row, message } -- never raw PII, never a secret
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_import_batches_account ON import_batches(account_id, created_at);

-- ── Permissions ─────────────────────────────────────
-- import_batches: same tier as tracking_links/offers -- editors may
-- run imports, not just admins (unlike postback_configs, this holds
-- no credentials). Reconciliation itself needs no new permission row
-- at all: it runs through the EXISTING /api/v1/report/run endpoint,
-- gated by the existing 'reports' resource, scoped per-row by the
-- existing affiliate_accounts item-access registry (see
-- worker/database/reports.js handleReconciliation).
INSERT OR IGNORE INTO permissions (role, resource, action, allowed) VALUES
    ('editor', 'import_batches', 'read',   1),
    ('editor', 'import_batches', 'create', 1),
    ('editor', 'import_batches', 'update', 0),
    ('editor', 'import_batches', 'delete', 0);
