-- =====================================================
-- 0019_seo_landing_pages.sql
-- Unified SEO landing page system supporting two page types:
--   country_custom    -> /en/country/:code/:custom_slug
--   category_country   -> /en/category/:category_slug/:code
--
-- One table backs both (see chat discussion) rather than two
-- parallel CMS systems: a category_country row is identified by
-- category_id + country_code (its "slug" is always the category's
-- own slug, so the URL segment is derived, not editor-typed); a
-- country_custom row has category_id NULL and an editor-typed slug.
--
-- Purely additive: no existing table is touched, no existing data
-- is modified. countries/categories/casinos/geo_rules/casino_categories
-- remain the sources of truth; this migration does not duplicate
-- any of that data.
-- =====================================================

CREATE TABLE IF NOT EXISTS seo_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    page_type TEXT NOT NULL CHECK (page_type IN ('country_custom', 'category_country')),

    -- For country_custom: editor-typed custom slug (e.g. "best-easy-to-use-casinos").
    -- For category_country: always equal to the category's own slug —
    -- stored (not just joined) so URL generation/lookup stays a single
    -- indexed equality query, same pattern as every other content table here.
    slug TEXT NOT NULL,

    country_code TEXT NOT NULL REFERENCES countries(code),
    category_id INTEGER REFERENCES categories(id), -- NULL for country_custom

    title TEXT NOT NULL,
    seo_title TEXT,
    seo_description TEXT,
    og_image TEXT,
    featured_image TEXT,
    canonical_url TEXT,
    robots TEXT DEFAULT 'index,follow',

    author_id INTEGER REFERENCES authors(id),

    -- { "intro": "<p>...</p>", "sections": [ {id,type,title,...}, ... ] }
    content_json TEXT,

    -- How casino selection is populated for this page.
    --   manual         -> only seo_page_casinos rows, editor-curated
    --   auto           -> fully derived from country/category eligibility
    --   auto_priority  -> derived, but seo_page_casinos rows override order/inclusion
    casino_mode TEXT NOT NULL DEFAULT 'auto_priority'
        CHECK (casino_mode IN ('manual', 'auto', 'auto_priority')),

    -- Quality gate for category_country pages (section 9 of the spec):
    -- a page shouldn't be published/indexable if it doesn't clear this.
    min_casino_count INTEGER NOT NULL DEFAULT 1,

    -- Lifecycle: draft -> reviewed -> published. `published`/`sitemap_enabled`
    -- are the actual gates the renderer/sitemap check; `status` is the
    -- editorial workflow label shown in the admin.
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'reviewed', 'published')),
    published INTEGER NOT NULL DEFAULT 0,
    sitemap_enabled INTEGER NOT NULL DEFAULT 1,

    -- True for category_country rows the system discovered from real
    -- eligibility rather than an editor manually creating them.
    auto_generated INTEGER NOT NULL DEFAULT 0,

    created_by INTEGER,
    updated_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Covers both page types: for country_custom, (country_code, slug)
    -- must be unique per the spec ("do not create duplicate equivalent
    -- URLs"); for category_country, slug is always the category slug,
    -- so (country_code, slug) is naturally unique per category+country too.
    UNIQUE (page_type, country_code, slug)
);

CREATE INDEX IF NOT EXISTS idx_seo_pages_lookup
ON seo_pages(page_type, country_code, slug);

CREATE INDEX IF NOT EXISTS idx_seo_pages_category_country
ON seo_pages(category_id, country_code);

CREATE INDEX IF NOT EXISTS idx_seo_pages_status
ON seo_pages(published, sitemap_enabled);

-- Editorial casino selections for a landing page. This is metadata
-- ONLY (position, labeling, editorial copy) — never a copy of casino
-- facts. Rendering always joins back to `casinos` for logo/rating/
-- bonus/url/etc, so a casino DB update instantly reflects everywhere
-- (spec section 5).
CREATE TABLE IF NOT EXISTS seo_page_casinos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    seo_page_id INTEGER NOT NULL REFERENCES seo_pages(id) ON DELETE CASCADE,
    casino_id INTEGER NOT NULL REFERENCES casinos(id) ON DELETE CASCADE,

    position INTEGER NOT NULL DEFAULT 0,

    -- Optional: ties this casino to a specific content_json section
    -- id (e.g. a "casino_editorial" section about this one casino).
    -- NULL means "the page's main casino list/grid".
    section_key TEXT,

    display_mode TEXT NOT NULL DEFAULT 'card'
        CHECK (display_mode IN ('card', 'editorial', 'comparison')),

    custom_label TEXT,
    is_featured INTEGER NOT NULL DEFAULT 0,

    -- Rich HTML editorial copy for this casino on this page
    -- ("why we picked it" / pros-cons narrative / per-casino FAQ).
    -- Only used when display_mode = 'editorial'.
    editorial_content TEXT,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (seo_page_id, casino_id, section_key)
);

CREATE INDEX IF NOT EXISTS idx_seo_page_casinos_page
ON seo_page_casinos(seo_page_id, position);
