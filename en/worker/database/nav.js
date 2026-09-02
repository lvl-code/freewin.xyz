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

export async function createNavItem(db, data) {
  const result = await db.prepare(`
    INSERT INTO nav_items (label, url, parent_id, position, location, is_external, icon, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    data.label,
    data.url,
    data.parent_id || null,
    data.position || 0,
    data.location || "header",
    data.is_external ? 1 : 0,
    data.icon || null,
    data.enabled !== undefined ? (data.enabled ? 1 : 0) : 1
  ).run();
  return result.meta.last_row_id;
}

export async function updateNavItem(db, id, data) {
  return await db.prepare(`
    UPDATE nav_items SET
      label = ?, url = ?, parent_id = ?, position = ?,
      location = ?, is_external = ?, icon = ?, enabled = ?
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
