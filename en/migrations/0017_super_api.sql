-- =====================================================
-- SUPER API (Lummet control-plane <-> tenant channel)
-- Additive only. No existing table is modified.
-- =====================================================

PRAGMA foreign_keys = ON;

-- Replay protection: one row per (credential_id, nonce) seen.
CREATE TABLE IF NOT EXISTS super_api_nonces (
    nonce TEXT NOT NULL,
    credential_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (credential_id, nonce)
);

CREATE INDEX IF NOT EXISTS idx_super_nonces_created
ON super_api_nonces(created_at);

-- Sliding-window rate limiting, keyed by credential_id
-- (same pattern as auth_attempts).
CREATE TABLE IF NOT EXISTS super_api_rate_limits (
    credential_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (credential_id, created_at)
);

-- Audit log of every Super API request (success and failure).
-- Never store credentials/secrets here.
CREATE TABLE IF NOT EXISTS super_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    credential_id TEXT,
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,
    resource TEXT,
    resource_id TEXT,
    action TEXT,
    success INTEGER NOT NULL,
    status_code INTEGER,
    request_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_super_audit_created
ON super_audit_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_super_audit_credential
ON super_audit_logs(credential_id);
