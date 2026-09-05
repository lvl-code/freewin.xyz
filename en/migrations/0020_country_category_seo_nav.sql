-- =====================================================
-- 0020_country_category_seo_nav.sql
-- Extends the BASE country hub pages (/en/country/:code) and
-- BASE category hub pages (/en/category/:slug) with the same
-- editorial/SEO fields already used by the seo_pages system
-- (migration 0019) for their *sub*-pages — content_json,
-- robots (index/follow), and a draft/published lifecycle.
--
-- Also adds automatic-navigation support to nav_items: a
-- country or category page can now automatically get a nav
-- link when it's published, while remaining a completely
-- normal, admin-editable nav_items row (rename, reorder,
-- disable, or delete it like any manual entry) in both the
-- tenant's own dashboard and the Lummet control plane, since
-- both already share the same nav_items CRUD.
--
-- Purely additive: no existing column is altered or dropped,
-- no existing row's data is changed by this migration. New
-- columns default to values that preserve today's behavior
-- (status defaults to 'published' / published=1, robots
-- defaults to 'index,follow') so every existing country and
-- category keeps rendering exactly as it does today.
-- =====================================================

-- ── countries ───────────────────────────────────────────
ALTER TABLE countries ADD COLUMN content_json TEXT;
ALTER TABLE countries ADD COLUMN robots TEXT DEFAULT 'index,follow';
ALTER TABLE countries ADD COLUMN status TEXT DEFAULT 'published';
ALTER TABLE countries ADD COLUMN published INTEGER DEFAULT 1;

-- ── categories ──────────────────────────────────────────
ALTER TABLE categories ADD COLUMN content_json TEXT;
ALTER TABLE categories ADD COLUMN robots TEXT DEFAULT 'index,follow';
ALTER TABLE categories ADD COLUMN status TEXT DEFAULT 'published';
ALTER TABLE categories ADD COLUMN published INTEGER DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_countries_published ON countries(published);
CREATE INDEX IF NOT EXISTS idx_categories_published ON categories(published);

-- ── nav_items: auto-link bookkeeping ───────────────────
-- source_type/source_ref identify the country/category a nav
-- row was generated from ('country'/code or 'category'/slug).
-- NULL for every ordinary, fully-manual nav item (unchanged
-- behavior). auto_generated is a display/bookkeeping flag only
-- — it never restricts what an admin can edit on the row.
ALTER TABLE nav_items ADD COLUMN auto_generated INTEGER DEFAULT 0;
ALTER TABLE nav_items ADD COLUMN source_type TEXT;
ALTER TABLE nav_items ADD COLUMN source_ref TEXT;

-- Prevents creating two auto-links for the same country/category.
-- Partial index: only applies to rows that are actually auto-linked,
-- so it has zero effect on existing/manual nav_items rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_nav_items_source
ON nav_items(source_type, source_ref)
WHERE source_type IS NOT NULL;
