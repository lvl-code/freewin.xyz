-- =====================================================
-- 0035_provider_adapters.sql
-- Outbound provider/API adapter framework (brief §10) -- distinct from
-- postback_configs (0033, inbound push) and CSV/JSON imports (0034,
-- manual pull). This is the AUTOMATED pull side: this platform calling
-- OUT to a network's own reporting API on a schedule.
--
-- Reuses import_batches (0034) for sync history instead of a new
-- table -- an API sync and a manually uploaded statement are the same
-- kind of event for reconciliation/history purposes (format='api' vs
-- 'csv'/'json' distinguishes them where it matters).
-- =====================================================

CREATE TABLE IF NOT EXISTS provider_adapter_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES affiliate_accounts(id) ON DELETE RESTRICT,

    label TEXT NOT NULL,
    provider_key TEXT NOT NULL,                -- must match a key registered in worker/adapters/registry.js
    api_base_url TEXT NOT NULL,
    credential_reference TEXT NOT NULL,        -- same pointer-only convention as postback_configs/affiliate_accounts

    -- GenericRestAdapter-specific knobs (ignored by other adapter
    -- kinds, which is why these live in the config row rather than
    -- fixed columns -- see worker/adapters/base.js for why the
    -- interface is deliberately loose here).
    auth_header_name TEXT,
    auth_scheme TEXT,
    conversions_path TEXT,
    date_param_since TEXT,
    date_param_until TEXT,
    response_array_path TEXT,
    field_mapping_json TEXT,

    sync_frequency_minutes INTEGER NOT NULL DEFAULT 60,
    last_sync_at DATETIME,
    last_sync_status TEXT,                     -- 'ok' | 'error' | NULL (never synced yet)
    last_sync_error TEXT,

    status TEXT DEFAULT 'active',              -- 'active' | 'disabled'

    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_provider_adapter_configs_account ON provider_adapter_configs(account_id);
CREATE INDEX IF NOT EXISTS idx_provider_adapter_configs_status ON provider_adapter_configs(status);

-- Cron feature flag -- same default-off convention as
-- alert_rules_cron_enabled (0031) and report_schedules_cron_enabled:
-- shipping code that could start making outbound network calls on a
-- schedule must never do so until an operator explicitly turns it on,
-- since turning it on implies real credentials have been configured.
INSERT OR IGNORE INTO system_settings (key, value)
VALUES ('provider_sync_cron_enabled', 'false');

-- Admin-only, same reasoning as postback_configs (0033): this table
-- holds a credential_reference pointer. No editor permission rows.
