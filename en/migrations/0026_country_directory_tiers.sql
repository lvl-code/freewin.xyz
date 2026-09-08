-- =====================================================
-- 0026_country_directory_tiers.sql
--
-- Backs the redesigned /en/country directory page: a
-- "Featured Gambling Markets" section (admin-controlled,
-- reorderable, not hardcoded to any fixed count) above a full
-- alphabetical directory of every published country, plus a
-- `tier` field so editorial/commercial investment decisions
-- (which countries get deep hub sub-pages, section-builder
-- content, etc.) are tracked separately from directory
-- prominence — a country can be featured without being Tier 1,
-- and vice versa. `tier` is a planning/labeling signal only in
-- this phase; it does not gate or auto-generate any content.
--
-- Purely additive: no existing column altered or dropped, no
-- existing row's data changed. New columns default to values
-- that preserve today's behavior (is_featured=0, tier=3) so no
-- country appears in the Featured section until an admin
-- explicitly puts it there.
-- =====================================================

ALTER TABLE countries ADD COLUMN is_featured INTEGER DEFAULT 0;
ALTER TABLE countries ADD COLUMN featured_position INTEGER DEFAULT 0;
ALTER TABLE countries ADD COLUMN tier INTEGER DEFAULT 3;

CREATE INDEX IF NOT EXISTS idx_countries_featured ON countries(is_featured, featured_position);
