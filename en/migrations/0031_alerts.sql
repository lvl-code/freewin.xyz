-- =====================================================
-- 0031_alerts.sql
-- Phase 13: Lightweight anomaly/alert system.
--
-- Alerts are generated only from real analytics_daily comparisons
-- (today vs. trailing baseline) or real tracking_link_health_checks
-- rows (already written by System 3, worker/tracking/health-check.js)
-- -- never synthetic. evaluateAlertRules() (Phase 13 cron job) is the
-- only writer of analytics_alerts.
-- =====================================================

CREATE TABLE IF NOT EXISTS analytics_alert_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    metric TEXT NOT NULL,               -- clicks | conversions | revenue | commission |
                                         -- tracking_link_health | zero_conversion
    scope_type TEXT NOT NULL DEFAULT 'global',  -- global | casino | offer | tracking_link | partner
    scope_id INTEGER,                   -- NULL when scope_type = 'global'
    threshold_type TEXT NOT NULL,       -- percent_drop | absolute_drop | zero_conversion | health_failure
    threshold_value REAL,
    comparison_window_days INTEGER NOT NULL DEFAULT 7,  -- trailing baseline window
    enabled INTEGER NOT NULL DEFAULT 1,
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled ON analytics_alert_rules(enabled);
CREATE INDEX IF NOT EXISTS idx_alert_rules_scope ON analytics_alert_rules(scope_type, scope_id);

CREATE TABLE IF NOT EXISTS analytics_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id INTEGER REFERENCES analytics_alert_rules(id),
    triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    details_json TEXT,                  -- observed value, baseline value, % change -- for display
    status TEXT NOT NULL DEFAULT 'open', -- open | acknowledged | resolved
    acknowledged_by INTEGER REFERENCES users(id),
    acknowledged_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON analytics_alerts(status, triggered_at);
CREATE INDEX IF NOT EXISTS idx_alerts_rule ON analytics_alerts(rule_id);

INSERT OR IGNORE INTO permissions (role, resource, action, allowed) VALUES
    ('editor', 'analytics_alerts', 'read',   1),
    ('editor', 'analytics_alerts', 'create', 0),
    ('editor', 'analytics_alerts', 'update', 1),
    ('editor', 'analytics_alerts', 'delete', 0);
