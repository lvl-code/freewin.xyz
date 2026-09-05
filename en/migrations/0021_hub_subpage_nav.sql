-- =====================================================
-- 0021_hub_subpage_nav.sql
-- Adds a CONTEXTUAL, scrollable sub-page nav bar to country
-- and category hub pages (/en/country/:code, /en/category/:slug),
-- listing that specific hub's published seo_pages sub-pages
-- (country_custom / category_country — migration 0019):
--   country_custom  sub-pages -> shown on their own /en/country/:code
--   category_country sub-pages -> shown on their own /en/category/:slug
--
-- Reuses the exact same nav_items auto-link mechanism added in
-- 0020_country_category_seo_nav.sql (auto_generated/source_type/
-- source_ref) for the automatic side. The only new capability
-- needed is SCOPING — a nav_items row can now say "only show me
-- on this one specific country/category hub page" instead of
-- "show me in the global site-wide Page Navigation". This is a
-- separate, contextual nav — never merged into the existing
-- global 'page' location's rendering.
--
-- Purely additive: no existing column/row is altered.
-- =====================================================

ALTER TABLE nav_items ADD COLUMN scope_type TEXT;
ALTER TABLE nav_items ADD COLUMN scope_ref TEXT;

CREATE INDEX IF NOT EXISTS idx_nav_items_scope
ON nav_items(location, scope_type, scope_ref, enabled, position);
