// =====================================================
// en/worker/database/seo-pages.js
// Data access for the unified SEO landing page system:
//   country_custom    -> /en/country/:code/:custom_slug
//   category_country   -> /en/category/:category_slug/:code
// See migrations/0019_seo_landing_pages.sql for schema/rationale.
// =====================================================

export async function getSeoPageById(db, id) {
  return db.prepare(`SELECT * FROM seo_pages WHERE id = ?`).bind(id).first();
}

// Public-facing lookup: exactly what the router needs to resolve a
// URL to a page. slug is either the editor-typed custom slug
// (country_custom) or the category's own slug (category_country).
export async function getSeoPageByUrl(db, pageType, countryCode, slug) {
  return db
    .prepare(
      `SELECT * FROM seo_pages WHERE page_type = ? AND country_code = ? AND slug = ?`
    )
    .bind(pageType, countryCode.toUpperCase(), slug)
    .first();
}

export async function getAllSeoPages(db, { pageType = null } = {}) {
  if (pageType) {
    const result = await db
      .prepare(`SELECT * FROM seo_pages WHERE page_type = ? ORDER BY updated_at DESC`)
      .bind(pageType)
      .all();
    return result.results || [];
  }
  const result = await db.prepare(`SELECT * FROM seo_pages ORDER BY updated_at DESC`).all();
  return result.results || [];
}

export async function createSeoPage(db, data) {
  if (!data.page_type || !["country_custom", "category_country"].includes(data.page_type)) {
    throw new Error("page_type must be country_custom or category_country");
  }
  if (!data.slug || !data.country_code || !data.title) {
    throw new Error("slug, country_code, and title are required");
  }

  const result = await db
    .prepare(`
      INSERT INTO seo_pages (
        page_type, slug, country_code, category_id, title, seo_title, seo_description,
        og_image, featured_image, canonical_url, robots, author_id, content_json,
        casino_mode, min_casino_count, status, published, sitemap_enabled,
        auto_generated, created_by, updated_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      data.page_type,
      data.slug,
      data.country_code.toUpperCase(),
      data.category_id || null,
      data.title,
      data.seo_title || null,
      data.seo_description || null,
      data.og_image || null,
      data.featured_image || null,
      data.canonical_url || null,
      data.robots || "index,follow",
      data.author_id || null,
      typeof data.content_json === "string" ? data.content_json : JSON.stringify(data.content_json || {}),
      data.casino_mode || "auto_priority",
      data.min_casino_count ?? 1,
      data.status || "draft",
      data.published ? 1 : 0,
      data.sitemap_enabled === false ? 0 : 1,
      data.auto_generated ? 1 : 0,
      data.created_by || null,
      data.updated_by || null
    )
    .run();

  return result.meta?.last_row_id;
}

export async function updateSeoPage(db, id, data) {
  const existing = await getSeoPageById(db, id);
  if (!existing) throw new Error("SEO page not found");

  await db
    .prepare(`
      UPDATE seo_pages SET
        slug = ?, title = ?, seo_title = ?, seo_description = ?,
        og_image = ?, featured_image = ?, canonical_url = ?, robots = ?,
        author_id = ?, content_json = ?, casino_mode = ?, min_casino_count = ?,
        status = ?, published = ?, sitemap_enabled = ?, updated_by = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .bind(
      data.slug ?? existing.slug,
      data.title ?? existing.title,
      data.seo_title ?? existing.seo_title,
      data.seo_description ?? existing.seo_description,
      data.og_image ?? existing.og_image,
      data.featured_image ?? existing.featured_image,
      data.canonical_url ?? existing.canonical_url,
      data.robots ?? existing.robots,
      data.author_id ?? existing.author_id,
      typeof data.content_json === "string"
        ? data.content_json
        : data.content_json != null
          ? JSON.stringify(data.content_json)
          : existing.content_json,
      data.casino_mode ?? existing.casino_mode,
      data.min_casino_count ?? existing.min_casino_count,
      data.status ?? existing.status,
      data.published != null ? (data.published ? 1 : 0) : existing.published,
      data.sitemap_enabled != null ? (data.sitemap_enabled ? 1 : 0) : existing.sitemap_enabled,
      data.updated_by || null,
      id
    )
    .run();
}

export async function deleteSeoPage(db, id) {
  return db.prepare(`DELETE FROM seo_pages WHERE id = ?`).bind(id).run();
}

// -----------------------------------------------------
// Casino selection
// -----------------------------------------------------

// Editorial selections for a page, joined back to the live casino
// row every time — never a copy of casino facts (spec section 5).
export async function getSeoPageCasinos(db, seoPageId) {
  const result = await db
    .prepare(`
      SELECT spc.id AS selection_id, spc.position, spc.section_key, spc.display_mode,
             spc.custom_label, spc.is_featured, spc.editorial_content,
             c.*
      FROM seo_page_casinos spc
      JOIN casinos c ON c.id = spc.casino_id
      WHERE spc.seo_page_id = ?
      ORDER BY spc.position ASC
    `)
    .bind(seoPageId)
    .all();
  return result.results || [];
}

// Full replace of a page's casino selections — same delete-then-insert
// pattern as setCasinoCategories/setCasinoGeoRules elsewhere in this
// codebase, for consistency.
export async function setSeoPageCasinos(db, seoPageId, selections) {
  await db.prepare(`DELETE FROM seo_page_casinos WHERE seo_page_id = ?`).bind(seoPageId).run();
  if (!Array.isArray(selections) || selections.length === 0) return;

  for (const sel of selections) {
    if (!sel.casino_id) continue;
    await db
      .prepare(`
        INSERT INTO seo_page_casinos (
          seo_page_id, casino_id, position, section_key, display_mode,
          custom_label, is_featured, editorial_content
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        seoPageId,
        sel.casino_id,
        sel.position ?? 0,
        sel.section_key || null,
        sel.display_mode || "card",
        sel.custom_label || null,
        sel.is_featured ? 1 : 0,
        sel.editorial_content || null
      )
      .run();
  }
}

// -----------------------------------------------------
// Country search (code or name) — spec section: "search must
// support both country code and country name: CA / Canada"
// -----------------------------------------------------

export async function searchCountries(db, query, limit = 20) {
  const q = `%${query.trim()}%`;
  const result = await db
    .prepare(`
      SELECT code, name FROM countries
      WHERE code LIKE ? OR name LIKE ?
      ORDER BY name ASC
      LIMIT ?
    `)
    .bind(q.toUpperCase(), q, limit)
    .all();
  return result.results || [];
}

// -----------------------------------------------------
// Category x Country eligibility
// "at minimum: country exists, category exists, at least one casino
// is associated with that country, at least one eligible casino is
// associated with that category" — a casino must satisfy BOTH via
// the actual join tables (casino_categories + geo_rules), not just
// either one independently.
// -----------------------------------------------------

export async function getCategoryCountryCasinoCount(db, categorySlug, countryCode) {
  const row = await db
    .prepare(`
      SELECT COUNT(DISTINCT c.id) AS casino_count
      FROM casino_categories cc
      JOIN categories cat ON cat.id = cc.category_id
      JOIN casinos c ON c.id = cc.casino_id AND c.published = 1 AND c.status = 'published'
      JOIN geo_rules gr ON gr.casino_slug = c.slug
      WHERE cat.slug = ? AND gr.country_code = ? AND gr.status = 'allowed'
    `)
    .bind(categorySlug, countryCode.toUpperCase())
    .first();
  return row?.casino_count || 0;
}

// The actual eligible casino rows for auto/auto_priority casino_mode
// on a category_country page.
export async function getEligibleCasinosForCategoryCountry(db, categorySlug, countryCode) {
  const result = await db
    .prepare(`
      SELECT DISTINCT c.*
      FROM casino_categories cc
      JOIN categories cat ON cat.id = cc.category_id
      JOIN casinos c ON c.id = cc.casino_id AND c.published = 1 AND c.status = 'published'
      JOIN geo_rules gr ON gr.casino_slug = c.slug
      WHERE cat.slug = ? AND gr.country_code = ? AND gr.status = 'allowed'
      ORDER BY c.featured DESC, c.sort_order ASC, c.rating DESC
    `)
    .bind(categorySlug, countryCode.toUpperCase())
    .all();
  return result.results || [];
}

// Discovers every category x country combination that clears
// minCasinoCount, regardless of whether a seo_pages row exists yet —
// this is the "automatically discover eligible combinations" engine
// (spec section 2). The admin layer cross-references this against
// existing seo_pages rows to show eligible/generated/published status.
export async function discoverEligibleCategoryCountryCombos(db, minCasinoCount = 1) {
  const result = await db
    .prepare(`
      SELECT
        cat.id AS category_id, cat.slug AS category_slug, cat.name AS category_name,
        co.code AS country_code, co.name AS country_name,
        COUNT(DISTINCT c.id) AS casino_count
      FROM categories cat
      JOIN casino_categories cc ON cc.category_id = cat.id
      JOIN casinos c ON c.id = cc.casino_id AND c.published = 1 AND c.status = 'published'
      JOIN geo_rules gr ON gr.casino_slug = c.slug AND gr.status = 'allowed'
      JOIN countries co ON co.code = gr.country_code
      GROUP BY cat.id, co.code
      HAVING COUNT(DISTINCT c.id) >= ?
      ORDER BY cat.name ASC, co.name ASC
    `)
    .bind(minCasinoCount)
    .all();
  return result.results || [];
}
