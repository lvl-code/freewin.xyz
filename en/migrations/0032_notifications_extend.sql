-- =====================================================
-- 0032_notifications_extend.sql
-- Phase 14: Extend the EXISTING user_notifications table
-- (0006_phase_ae.sql) rather than creating a parallel notifications
-- system, per the audit finding that notifications is already real
-- and working.
--
-- Verified actual current columns before writing this (not assumed):
--   id, user_id, title, message, link, is_read, created_at
-- `is_read` already exists -- this migration does NOT add a
-- redundant read-state column, only what's genuinely missing:
-- severity, category, a generic related-resource pointer, and
-- expiration.
-- =====================================================

ALTER TABLE user_notifications ADD COLUMN severity TEXT DEFAULT 'info';        -- info | warning | critical
ALTER TABLE user_notifications ADD COLUMN category TEXT;                       -- analytics | tracking | offers |
                                                                                -- affiliate | system | security | reports
ALTER TABLE user_notifications ADD COLUMN related_resource TEXT;               -- e.g. 'tracking_link', 'report_run'
ALTER TABLE user_notifications ADD COLUMN related_id INTEGER;
ALTER TABLE user_notifications ADD COLUMN expires_at DATETIME;

CREATE INDEX IF NOT EXISTS idx_notifications_category ON user_notifications(category, is_read);
