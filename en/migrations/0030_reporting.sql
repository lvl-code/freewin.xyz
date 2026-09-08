-- =====================================================
-- 0030_reporting.sql
-- Phase 7-9: Reporting engine -- definitions, schedules, runs,
-- recipients. Exports are NOT a stored table (see docs/analytics.md,
-- Phase 8 note) -- export files stream on demand from a report_run's
-- underlying query and are never buffered fully into memory or
-- persisted in D1; report_runs.row_count + status is the audit trail.
--
-- IMPORTANT: filters_json on report_definitions is a saved
-- convenience only. It is never trusted as an authorization boundary
-- -- every report RUN re-resolves the requesting user's accessible
-- resource IDs via database/item-access.js at execution time, so a
-- saved report cannot be used to read data the runner no longer has
-- access to (e.g. an admin later downgraded to editor, or item-access
-- revoked after the report was saved).
-- =====================================================

CREATE TABLE IF NOT EXISTS report_definitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    report_type TEXT NOT NULL,          -- executive_performance | affiliate_performance |
                                         -- partner_performance | program_performance |
                                         -- account_performance | offer_performance |
                                         -- tracking_link_performance | casino_performance |
                                         -- geo_performance | content_performance |
                                         -- traffic_performance | conversion_funnel |
                                         -- revenue_commission | seo_performance | operational_health
    filters_json TEXT,                  -- date range + dimension filters (advisory, re-checked at run time)
    columns_json TEXT,
    grouping_json TEXT,
    sort_json TEXT,
    owner_id INTEGER NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'active',   -- active | archived
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_report_definitions_owner ON report_definitions(owner_id);
CREATE INDEX IF NOT EXISTS idx_report_definitions_type ON report_definitions(report_type);

CREATE TABLE IF NOT EXISTS report_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL REFERENCES report_definitions(id) ON DELETE CASCADE,
    frequency TEXT NOT NULL,            -- daily | weekly | monthly | custom
    timezone TEXT NOT NULL DEFAULT 'UTC',
    next_run_at DATETIME,
    enabled INTEGER NOT NULL DEFAULT 1,
    output_format TEXT NOT NULL DEFAULT 'csv',  -- csv | json | html
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_report_schedules_due ON report_schedules(enabled, next_run_at);
CREATE INDEX IF NOT EXISTS idx_report_schedules_report ON report_schedules(report_id);

CREATE TABLE IF NOT EXISTS report_recipients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id INTEGER NOT NULL REFERENCES report_schedules(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),   -- preferred: in-app notification via user_notifications
    email TEXT,                             -- fallback only; no email provider is wired yet (see
                                             -- worker/reports/delivery.js abstraction, Phase 9)
    CHECK (user_id IS NOT NULL OR email IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_report_recipients_schedule ON report_recipients(schedule_id);

CREATE TABLE IF NOT EXISTS report_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL REFERENCES report_definitions(id) ON DELETE CASCADE,
    schedule_id INTEGER REFERENCES report_schedules(id),   -- NULL = ad-hoc/manual run
    status TEXT NOT NULL DEFAULT 'running',   -- running | success | failed
    row_count INTEGER,
    output_format TEXT,
    error_message TEXT,
    triggered_by INTEGER REFERENCES users(id),   -- NULL when triggered by the scheduler
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_report_runs_report ON report_runs(report_id, started_at);
CREATE INDEX IF NOT EXISTS idx_report_runs_status ON report_runs(status);

INSERT OR IGNORE INTO permissions (role, resource, action, allowed) VALUES
    ('editor', 'reports', 'read',   1),
    ('editor', 'reports', 'create', 1),
    ('editor', 'reports', 'update', 1),
    ('editor', 'reports', 'delete', 0);
