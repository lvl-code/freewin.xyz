export async function getCasino(db, slug) {
  return await db
    .prepare(`
      SELECT * FROM casinos
      WHERE slug = ? AND published = 1 AND status = 'published'
      LIMIT 1
    `)
    .bind(slug)
    .first();
}

// Admin-safe variant — no published/status filter, so drafts and
// unpublished casinos are visible to admin tooling. Mirrors the
// existing getAllNewsAdmin/getAllAuthorsAdmin convention.
export async function getCasinoAdmin(db, slug) {
  return await db
    .prepare(`
      SELECT * FROM casinos
      WHERE slug = ?
      LIMIT 1
    `)
    .bind(slug)
    .first();
}

export async function getAllCasinos(db) {
  const result = await db
    .prepare(`
      SELECT * FROM casinos
      WHERE published = 1 AND status = 'published'
      ORDER BY featured DESC, sort_order ASC, rating DESC
    `)
    .all();
  return result.results;
}

export async function getAllCasinosAdmin(db) {
  const result = await db
    .prepare(`
      SELECT * FROM casinos
      ORDER BY created_at DESC
    `)
    .all();
  return result.results || [];
}


export async function createCasino(db, casino) {
  const result = await db
    .prepare(`
      INSERT INTO casinos (
        slug,
        name,
        logo,
        website_url,
        affiliate_url,
        rating,
        bonus_title,
        bonus_value,
        features,
        seo_title,
        seo_description,
        featured,
        sort_order,
        status,
        logo_media_id,
        hero_image_media_id,
        created_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      casino.slug,
      casino.name,
      casino.logo,
      casino.website_url,
      casino.affiliate_url,
      casino.rating || 0,
      casino.bonus_title,
      casino.bonus_value,
      JSON.stringify(casino.features || []),
      casino.seo_title,
      casino.seo_description,
      casino.featured || 0,
      casino.sort_order || 0,
      casino.status || "draft",
      casino.logo_media_id || null,
      casino.hero_image_media_id || null,
      casino.created_by || null
    )
    .run();

  return result.meta.last_row_id;
}

export async function updateCasino(db, oldSlug, casino) {
  return await db
    .prepare(`
      UPDATE casinos
      SET
        slug= ?,
        name = ?,
        logo = ?,
        website_url = ?,
        affiliate_url = ?,
        rating = ?,
        bonus_title = ?,
        bonus_value = ?,
        features = ?,
        seo_title = ?,
        seo_description = ?,
        featured = ?,
        sort_order = ?,
        status = ?,
        logo_media_id = ?,
        hero_image_media_id = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE slug = ?
    `)
    .bind(
      casino.slug,
      casino.name,
      casino.logo,
      casino.website_url,
      casino.affiliate_url,
      casino.rating,
      casino.bonus_title,
      casino.bonus_value,
      JSON.stringify(casino.features || []),
      casino.seo_title,
      casino.seo_description,
      casino.featured || 0,
      casino.sort_order || 0,
      casino.status || "draft",
      casino.logo_media_id || null,
      casino.hero_image_media_id || null,
      oldSlug
    )
    .run();
}

export async function deleteCasino(db, slug) {
  return await db
    .prepare(`
      DELETE FROM casinos
      WHERE slug = ?
    `)
    .bind(slug)
    .run();
}

export async function setCasinoCategories(db, casino_id, category_ids) {
  await db.prepare(`
    DELETE FROM casino_categories
    WHERE casino_id = ?
  `)
  .bind(casino_id)
  .run();

  if (!category_ids.length) {
    return;
  }

  for (const category_id of category_ids) {
    await db.prepare(`
      INSERT INTO casino_categories (
        casino_id,
        category_id
      )
      VALUES (?, ?)
    `)
    .bind(casino_id, category_id)
    .run();
  }
}
export async function getCasinoCategories(db, casino_id) {
  const result = await db.prepare(`
    SELECT category_id
    FROM casino_categories
    WHERE casino_id = ?
  `)
  .bind(casino_id)
  .all();

  return result.results.map(r => r.category_id);
}

export async function getCasinoIdBySlug(db, slug) {
  const row = await db.prepare(`
    SELECT id
    FROM casinos
    WHERE slug = ?
    LIMIT 1
  `)
  .bind(slug)
  .first();

  return row?.id ?? null;
}


export async function getCasinosByCountry(db, countryCode) {
  const result = await db
    .prepare(`
      SELECT c.* FROM casinos c
      WHERE c.published = 1 AND c.status = 'published'
      AND (
        c.supported_countries LIKE ?
        OR c.supported_countries IS NULL
        OR c.supported_countries = ''
      )
      AND (
        c.restricted_countries IS NULL
        OR c.restricted_countries = ''
        OR c.restricted_countries NOT LIKE ?
      )
      ORDER BY c.featured DESC, c.sort_order ASC, c.rating DESC
    `)
    .bind(`%${countryCode}%`, `%${countryCode}%`)
    .all();
  return result.results;
}


export async function getCasinosByGeoRules(db, countryCode) {
  const result = await db
    .prepare(`
      SELECT c.* FROM casinos c
      WHERE c.published = 1 AND c.status = 'published'
      AND c.slug NOT IN (
        SELECT casino_slug FROM geo_rules
        WHERE country_code = ? AND status = 'blocked'
      )
      ORDER BY c.featured DESC, c.sort_order ASC, c.rating DESC
    `)
    .bind(countryCode)
    .all();
  return result.results;
}


export async function getCasinosByCountryAllowlist(db, countryCode) {
  const result = await db
    .prepare(`
      SELECT c.* FROM casinos c
      WHERE c.published = 1 AND c.status = 'published'
      AND c.slug IN (
        SELECT casino_slug FROM geo_rules
        WHERE country_code = ? AND status = 'allowed'
      )
      ORDER BY c.featured DESC, c.sort_order ASC, c.rating DESC
    `)
    .bind(countryCode)
    .all();
  return result.results;
}

