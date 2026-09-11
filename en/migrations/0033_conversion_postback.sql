-- =====================================================
-- 0033_conversion_postback.sql
-- Universal S2S conversion postback ingestion (brief §4-6, §14, §25).
--
-- Purely additive. Does not touch analytics_conversions, tracking_links,
-- or affiliate_accounts -- this migration only adds the configuration
-- and logging tables needed to let an external network/operator call
-- INTO this platform, on top of the conversion model that already
-- exists (0028_analytics_conversions.sql).
--
-- Design decisions:
--
-- 1. One postback_configs row = one integration for one affiliate
--    account. account_id is who the postback is FROM -- it is NOT
--    derived from click attribution (tracking_links has no account_id
--    column at all; accounts are a program-level commercial concept,
--    see 0023). The endpoint_token in the URL is what identifies which
--    config/account a given request belongs to.
--
-- 2. credential_reference follows the EXACT same pointer convention as
--    affiliate_accounts.credential_reference (see worker/database/
--    affiliate-accounts.js header comment) -- a Cloudflare secret
--    binding name / vault key, resolved at request time in
--    worker/postback/auth.js. This table never has a column capable of
--    holding a plaintext secret.
--
-- 3. field_mapping_json lets one program's "clickid" become another's
--    "sub_id" without a code change per network (brief §4) -- see
--    worker/postback/field-mapping.js DEFAULT_ALIASES for the
--    built-in fallback used when a config supplies no mapping.
--
-- 4. postback_logs is intentionally separate from tracking_link_health_
--    checks (0025) -- brief §14 is explicit that "does the link work"
--    and "is affiliate attribution actually working" are different
--    questions with different failure modes. This table answers the
--    second one. It stores a normalized/sanitized snapshot only, never
--    the raw request body or any signature/secret value (never log
--    secrets -- brief §5).
-- =====================================================

CREATE TABLE IF NOT EXISTS postback_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES affiliate_accounts(id) ON DELETE RESTRICT,

    label TEXT NOT NULL,                      -- human name, e.g. "GG.BET production postback"
    endpoint_token TEXT UNIQUE NOT NULL,       -- unguessable path segment: /api/v1/conversions/postback/:endpoint_token

    auth_method TEXT NOT NULL,                 -- 'hmac_sha256' | 'shared_secret' | 'api_key' | 'signed_query'
    credential_reference TEXT NOT NULL,        -- pointer only -- resolved via env at request time, never stored plaintext
    signature_param TEXT,                      -- which param/header carries the signature (auth-method dependent)
    timestamp_param TEXT,                      -- which param carries the request timestamp, for replay-window validation
    timestamp_tolerance_seconds INTEGER DEFAULT 300,

    allowed_ips TEXT,                          -- JSON array of IPs/CIDRs, NULL = no IP restriction

    field_mapping_json TEXT,                   -- JSON: { click_id: "subid", status: "event", ... } + value maps.
                                                -- NULL = use DEFAULT_ALIASES in worker/postback/field-mapping.js

    status TEXT DEFAULT 'active',              -- 'active' | 'disabled'

    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_postback_configs_account ON postback_configs(account_id);
CREATE INDEX IF NOT EXISTS idx_postback_configs_status ON postback_configs(status);
-- endpoint_token already has an implicit UNIQUE index from the column constraint.

CREATE TABLE IF NOT EXISTS postback_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    postback_config_id INTEGER REFERENCES postback_configs(id) ON DELETE SET NULL,

    received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    source_ip TEXT,

    outcome TEXT NOT NULL,                     -- 'accepted' | 'duplicate' | 'unattributed' | 'rejected_auth' |
                                                -- 'rejected_validation' | 'rejected_rate_limit' | 'error'
    reason TEXT,                               -- short machine-readable detail, e.g. 'signature_mismatch', 'program_mismatch'

    click_id TEXT,
    external_reference TEXT,
    conversion_id INTEGER REFERENCES analytics_conversions(id) ON DELETE SET NULL,

    -- Sanitized normalized payload only (conversion_type/status/amount/
    -- currency/country) -- never the raw body, never a signature or
    -- credential value. See worker/postback/handler.js.
    normalized_payload_json TEXT,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_postback_logs_config ON postback_logs(postback_config_id, received_at);
CREATE INDEX IF NOT EXISTS idx_postback_logs_outcome ON postback_logs(outcome, received_at);

-- ── Permissions (role-level) ───────────────────────
-- Deliberately NO editor rows: postback_configs holds
-- credential_reference pointers, so only admin (which bypasses this
-- table entirely per permissions.js) may read or write them. This
-- mirrors the "never expose affiliate credentials through dashboard
-- responses" requirement (brief §21/§23) at the coarsest, safest
-- level -- no role-based read access to configure around.
