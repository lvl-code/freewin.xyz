-- ============================================================
-- 0016_ad_rules.sql
-- Full Ad Management Engine
-- ============================================================

CREATE TABLE IF NOT EXISTS ad_rules (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  component_id    INTEGER NOT NULL,
  enabled         INTEGER DEFAULT 1,
  placement       TEXT NOT NULL DEFAULT 'after_paragraph',
  position_value  INTEGER DEFAULT 3,
  repeat_interval INTEGER DEFAULT 0,
  max_appearances INTEGER DEFAULT 1,
  devices         TEXT DEFAULT 'all',
  countries       TEXT DEFAULT 'all',
  page_type       TEXT DEFAULT 'all',
  priority        INTEGER DEFAULT 100,
  start_date      TEXT,
  end_date        TEXT,
  created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at      TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ad_rules_enabled ON ad_rules(enabled);
CREATE INDEX IF NOT EXISTS idx_ad_rules_priority ON ad_rules(priority);
CREATE INDEX IF NOT EXISTS idx_ad_rules_page_type ON ad_rules(page_type);

-- Article-level ad settings columns
ALTER TABLE news ADD COLUMN ad_mode TEXT DEFAULT 'auto';
ALTER TABLE news ADD COLUMN ad_override_rules TEXT;
