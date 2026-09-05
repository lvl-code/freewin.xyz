export async function getNavItems(db, location) {
  const result = await db.prepare(`
    SELECT * FROM nav_items
    WHERE location = ? AND enabled = 1
    ORDER BY position ASC
  `).bind(location).all();
  return result.results || [];
}

export async function getAllNavItems(db) {
  const result = await db.prepare(`
    SELECT * FROM nav_items ORDER BY location, position ASC
  `).all();
  return result.results || [];
}

export async function getNavItem(db, id) {
  return await db.prepare(`SELECT * FROM nav_items WHERE id = ?`).bind(id).first();
}

export async function createNavItem(db, data) {
  const result = await db.prepare(`
    INSERT INTO nav_items (label, url, parent_id, position, location, is_external, icon, enabled, scope_type, scope_ref)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    data.label,
    data.url,
    data.parent_id || null,
    data.position || 0,
    data.location || "header",
    data.is_external ? 1 : 0,
    data.icon || null,
    data.enabled !== undefined ? (data.enabled ? 1 : 0) : 1,
    data.scope_type || null,
    data.scope_ref || null
  ).run();
  return result.meta.last_row_id;
}

export async function updateNavItem(db, id, data) {
  return await db.prepare(`
    UPDATE nav_items SET
      label = ?, url = ?, parent_id = ?, position = ?,
      location = ?, is_external = ?, icon = ?, enabled = ?,
      scope_type = ?, scope_ref = ?
    WHERE id = ?
  `).bind(
    data.label,
    data.url,
    data.parent_id || null,
    data.position || 0,
    data.location || "header",
    data.is_external ? 1 : 0,
    data.icon || null,
    data.enabled !== undefined ? (data.enabled ? 1 : 0) : 1,
    data.scope_type || null,
    data.scope_ref || null,
    id
  ).run();
}

export async function deleteNavItem(db, id) {
  return await db.prepare(`DELETE FROM nav_items WHERE id = ?`).bind(id).run();
}

// =====================================================
// PAGE NAV (location = 'page') — GEO-aware retrieval
// =====================================================
// Added in migration 0017_page_nav_geo.sql. Reuses the
// existing nav_items "location" mechanism (no schema change
// to nav_items) plus a new page_nav_geo_rules table that
// mirrors the semantic model of the existing casino
// geo_rules table (status: allowed | blocked | restricted).
//
// GEO semantics (matches evaluateCasinoGeo/prepareGeoData in
// controllers.js):
//   - No GEO rules at all for an item      -> visible everywhere
//   - Only 'allowed' rules exist for an item -> allowlist mode:
//       item is visible ONLY in listed countries
//   - Only 'blocked'/'restricted' rules exist -> blocklist mode:
//       item is visible everywhere EXCEPT listed countries
//   - Mixed rules with no exact match for the current country
//       -> excluded (safe default, matches the existing
//          "mixed or unclear -> blocked" convention)
//   - An exact rule for the current country always wins,
//       and 'restricted' is treated the same as 'blocked'
//       (nav items are binary include/exclude — there is no
//       "shown but marked unavailable" state like casino cards).
// =====================================================

/**
 * Retrieve enabled PageNav items (location = 'page'), ordered
 * by position, optionally filtered by GEO eligibility for the
 * given country code. Uses a single batched query for GEO
 * rules (no N+1) regardless of how many nav items exist.
 *
 * If countryCode is falsy, GEO filtering is skipped and all
 * enabled PageNav items are returned in position order.
 */
export async function getPageNavItems(db, countryCode) {
  const itemsResult = await db.prepare(`
    SELECT * FROM nav_items
    WHERE location = 'page' AND enabled = 1
    ORDER BY position ASC
  `).all();

  const navItems = itemsResult.results || [];
  if (navItems.length === 0) return [];
  if (!countryCode) return navItems;

  return await filterPageNavItemsByGeo(db, navItems, countryCode);
}

/**
 * Apply GEO eligibility filtering to an already-fetched list of
 * PageNav items for a given country code. Extracted from
 * getPageNavItems() so the renderer can KV-cache the raw,
 * ungeofiltered item list under the existing "nav:page" cache
 * key (same shape/convention as every other nav location) while
 * still applying GEO filtering fresh on every request — GEO
 * eligibility varies per visitor country, so it must not be
 * baked into a single shared cache entry.
 *
 * Uses a single batched query for GEO rules (no N+1) regardless
 * of how many items are passed in. If countryCode is falsy, the
 * input list is returned unchanged.
 */
export async function filterPageNavItemsByGeo(db, navItems, countryCode) {
  if (!navItems || navItems.length === 0) return [];
  if (!countryCode) return navItems;

  const ids = navItems.map(item => item.id);
  const placeholders = ids.map(() => "?").join(",");

  const rulesResult = await db.prepare(`
    SELECT nav_item_id, country_code, status
    FROM page_nav_geo_rules
    WHERE nav_item_id IN (${placeholders})
  `).bind(...ids).all();

  const rulesByItem = {};
  for (const row of (rulesResult.results || [])) {
    if (!rulesByItem[row.nav_item_id]) rulesByItem[row.nav_item_id] = [];
    rulesByItem[row.nav_item_id].push(row);
  }

  return navItems.filter(item => {
    const rules = rulesByItem[item.id] || [];

    // No GEO rules at all -> visible everywhere
    if (rules.length === 0) return true;

    const countryRule = rules.find(r => r.country_code === countryCode);
    if (countryRule) {
      return countryRule.status === "allowed";
    }

    const hasAllowed = rules.some(r => r.status === "allowed");
    const hasBlocked = rules.some(r => r.status === "blocked" || r.status === "restricted");

    if (hasAllowed && !hasBlocked) {
      // Allowlist mode — countries not explicitly listed are excluded
      return false;
    }
    if (hasBlocked && !hasAllowed) {
      // Blocklist mode — countries not explicitly listed are included
      return true;
    }
    // Mixed or unclear rules with no exact match -> exclude (safe default)
    return false;
  });
}

/**
 * Retrieve all GEO rules configured for a single PageNav item,
 * ordered by country code. Used by future admin editing UI.
 */
export async function getPageNavGeoRules(db, navItemId) {
  const result = await db.prepare(`
    SELECT * FROM page_nav_geo_rules
    WHERE nav_item_id = ?
    ORDER BY country_code
  `).bind(navItemId).all();
  return result.results || [];
}

/**
 * Create a single GEO rule for a PageNav item.
 * rule = { nav_item_id, country_code, status }
 */
export async function createPageNavGeoRule(db, rule) {
  const result = await db.prepare(`
    INSERT INTO page_nav_geo_rules (nav_item_id, country_code, status)
    VALUES (?, ?, ?)
  `).bind(
    rule.nav_item_id,
    rule.country_code,
    rule.status
  ).run();
  return result.meta.last_row_id;
}

/**
 * Delete a single GEO rule by its own id.
 */
export async function deletePageNavGeoRule(db, id) {
  return await db.prepare(`
    DELETE FROM page_nav_geo_rules WHERE id = ?
  `).bind(id).run();
}

/**
 * Delete all GEO rules for a given PageNav item. Intended as a
 * defensive cleanup call from future admin nav-item deletion
 * code, in case D1's SQLite foreign key enforcement (and the
 * table's ON DELETE CASCADE) is not active in a given
 * environment. Not wired into deleteNavItem() in this phase —
 * deleteNavItem() is shared by every nav location and must not
 * change behavior here.
 */
export async function deletePageNavGeoRulesForItem(db, navItemId) {
  return await db.prepare(`
    DELETE FROM page_nav_geo_rules WHERE nav_item_id = ?
  `).bind(navItemId).run();
}

// =====================================================
// AUTO-LINKED NAV ITEMS (countries / categories)
// Added in migration 0020_country_category_seo_nav.sql.
//
// Every function here operates on completely ordinary
// nav_items rows — the only thing that makes a row "auto"
// is that source_type/source_ref are set. Once created, an
// admin can rename, move, disable, or delete it through the
// exact same nav CRUD used for manual items (in either the
// tenant dashboard or the Lummet control plane) — syncing
// only ever creates the row once, and afterwards only
// flips `enabled` to track the country/category's own
// published state. It never overwrites a label/url an admin
// has since edited.
// =====================================================

/**
 * Create-or-enable the auto nav link for a published country
 * or category. If a row for this (source_type, source_ref)
 * already exists (e.g. it was previously unpublished, or an
 * admin has since edited it), it is simply re-enabled — its
 * label/url/location are left exactly as they are, so admin
 * edits are never clobbered. Only a brand-new link gets the
 * default label/url/location below.
 */
export async function syncAutoNavItem(db, { sourceType, sourceRef, label, url, location = "page", scopeType = null, scopeRef = null }) {
  const existing = await db.prepare(`
    SELECT id FROM nav_items WHERE source_type = ? AND source_ref = ?
  `).bind(sourceType, sourceRef).first();

  if (existing) {
    return await db.prepare(`
      UPDATE nav_items SET enabled = 1 WHERE id = ?
    `).bind(existing.id).run();
  }

  const posRow = await db.prepare(`
    SELECT COALESCE(MAX(position), 0) AS maxPos FROM nav_items WHERE location = ?
  `).bind(location).first();

  return await db.prepare(`
    INSERT INTO nav_items
      (label, url, parent_id, position, location, is_external, icon, enabled, auto_generated, source_type, source_ref, scope_type, scope_ref)
    VALUES (?, ?, NULL, ?, ?, 0, NULL, 1, 1, ?, ?, ?, ?)
  `).bind(
    label,
    url,
    (posRow?.maxPos || 0) + 1,
    location,
    sourceType,
    sourceRef,
    scopeType,
    scopeRef
  ).run();
}

/**
 * Disable (never delete) the auto nav link for a country or
 * category that has moved out of "published" state. Leaves the
 * row in place so re-publishing can simply re-enable it via
 * syncAutoNavItem, and so an admin who has since customized the
 * row doesn't lose that customization.
 */
export async function disableAutoNavItem(db, sourceType, sourceRef) {
  return await db.prepare(`
    UPDATE nav_items SET enabled = 0 WHERE source_type = ? AND source_ref = ?
  `).bind(sourceType, sourceRef).run();
}

/**
 * Remove the auto nav link entirely. Called when the underlying
 * country/category itself is deleted (not merely unpublished) —
 * at that point the target page no longer exists, so keeping a
 * disabled link around would only be dead weight.
 */
export async function deleteAutoNavItemsForSource(db, sourceType, sourceRef) {
  return await db.prepare(`
    DELETE FROM nav_items WHERE source_type = ? AND source_ref = ?
  `).bind(sourceType, sourceRef).run();
}

/**
 * Enabled nav_items scoped to one specific hub page — e.g. the
 * sub-page nav bar on /en/country/CA (location='country_subnav',
 * scopeType='country', scopeRef='CA') or /en/category/crypto
 * (location='category_subnav', scopeType='category',
 * scopeRef='crypto'). Distinct from getNavItems()/getPageNavItems(),
 * which serve the global, site-wide header/footer/PageNav — a
 * scoped item here is only ever relevant on its one matching hub
 * page, auto-linked (via syncAutoNavItem) or added manually by an
 * admin with the same scope.
 */
export async function getScopedNavItems(db, location, scopeType, scopeRef) {
  const result = await db.prepare(`
    SELECT * FROM nav_items
    WHERE location = ? AND scope_type = ? AND scope_ref = ? AND enabled = 1
    ORDER BY position ASC
  `).bind(location, scopeType, scopeRef).all();
  return result.results || [];
}
