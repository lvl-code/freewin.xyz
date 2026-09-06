-- Optional short label for a country_custom/category_country page's
-- auto-generated sub-nav entry. Falls back to the page's (often long,
-- SEO-oriented) title when not set — see syncSeoPageNav in
-- worker/database/seo-pages.js.
ALTER TABLE seo_pages ADD COLUMN nav_label TEXT;
