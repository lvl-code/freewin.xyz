-- =====================================================
-- Migration 0018: PageNav GEO Rules + PageNav Seed Data
-- =====================================================
-- Extends the existing nav_items architecture to support a
-- new "page" location (in-page/contextual PageNav) and adds
-- GEO targeting for individual nav items.
--
-- This migration does NOT alter the nav_items table schema.
-- nav_items.location is a free-text column with no CHECK
-- constraint, so the new location value 'page' requires no
-- structural change — it is a data/convention addition only.
--
-- Existing locations (header, footer_casinos, footer_company,
-- footer_support, footer_legal, mobile) and all existing rows
-- are untouched by this migration. No existing nav CRUD,
-- rendering, or caching behavior is altered.
-- =====================================================

-- ── PageNav GEO rules ──────────────────────────────────
-- Mirrors the semantic model of the existing casino
-- "geo_rules" table (status: allowed | blocked | restricted),
-- scoped to nav_items instead of casinos.
--
-- Unlike casino geo_rules (which references casinos by slug,
-- with no foreign key declared), nav_item_id is a stable
-- surrogate key, so a real foreign key with ON DELETE CASCADE
-- is used here to prevent orphaned GEO rules if a nav item is
-- ever deleted. (CASCADE behavior depends on D1 enforcing
-- SQLite foreign keys; a defensive cleanup helper is also
-- provided in nav.js for explicit use by future admin code.)
CREATE TABLE IF NOT EXISTS page_nav_geo_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    nav_item_id INTEGER NOT NULL,

    country_code TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'allowed',

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (nav_item_id) REFERENCES nav_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_page_nav_geo_item
ON page_nav_geo_rules(nav_item_id);

CREATE INDEX IF NOT EXISTS idx_page_nav_geo_country
ON page_nav_geo_rules(country_code);

CREATE INDEX IF NOT EXISTS idx_page_nav_geo_lookup
ON page_nav_geo_rules(nav_item_id, country_code);

-- ── Seed default PageNav items ─────────────────────────
-- Uses the existing nav_items "location" mechanism with the
-- new 'page' value. Only destinations confirmed against
-- routes.js as real, existing routes are seeded — see the
-- Phase 2 report for destinations that were intentionally
-- skipped and why.
--
-- Note: as with the existing header/footer seeds in
-- 0006_phase_ae.sql, nav_items has no UNIQUE constraint, so
-- INSERT OR IGNORE does not prevent duplicate rows if this
-- migration is applied more than once. This matches the
-- pre-existing behavior of prior nav seeds and is not
-- something this migration changes or fixes.
INSERT OR IGNORE INTO nav_items (label, url, position, location, is_external, icon, enabled) VALUES
    ('All Casinos', '/en/casino', 1, 'page', 0, NULL, 1),
    ('Reviews', '/en/review', 2, 'page', 0, NULL, 1),
    ('Categories', '/en/category', 3, 'page', 0, NULL, 1),
    ('Countries', '/en/country', 4, 'page', 0, NULL, 1),
    ('News', '/en/news', 5, 'page', 0, NULL, 1);
