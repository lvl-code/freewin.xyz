import * as nav from "./nav.js";

export async function getCountry(db, code) {
  return await db
    .prepare(`
      SELECT *
      FROM countries
      WHERE code = ?
      LIMIT 1
    `)
    .bind(code)
    .first();
}
export async function getAllCountries(
  db
) {

  const result =
    await db.prepare(`
      SELECT *
      FROM countries
      ORDER BY name
    `).all();

  return result.results;
}

/**
 * Countries eligible to appear on the public site: published=1
 * AND status != 'draft'. Used for auto-nav / sitemap-style
 * listings where drafts must never leak out.
 */
export async function getPublishedCountries(db) {
  const result = await db.prepare(`
    SELECT *
    FROM countries
    WHERE published = 1 AND (status IS NULL OR status != 'draft')
    ORDER BY name
  `).all();

  return result.results || [];
}

// Resolves the auto nav link's enabled/disabled state to match
// a country's current publish state. Never throws — nav sync is
// a side effect of saving a country, not something that should
// ever fail the actual save.
async function syncCountryNav(db, code, data) {
  try {
    const isPublished = data.published !== undefined
      ? !!data.published
      : true;
    const isDraft = data.status === "draft";

    if (isPublished && !isDraft) {
      await nav.syncAutoNavItem(db, {
        sourceType: "country",
        sourceRef: code,
        label: data.name,
        url: `/en/country/${code.toLowerCase()}`,
        location: "page"
      });
    } else {
      await nav.disableAutoNavItem(db, "country", code);
    }
  } catch (e) {
    console.error("Country nav sync failed:", e.message);
  }
}

export async function createCountry(db, data) {
  const code = data.code.toUpperCase();
  const result = await db.prepare(`
    INSERT INTO countries (
      code, name, currency, language, legal_status, seo_title, seo_description,
      content_json, robots, status, published
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  .bind(
    code, data.name, data.currency, data.language,
    data.legal_status, data.seo_title, data.seo_description,
    typeof data.content_json === "string" ? data.content_json : JSON.stringify(data.content_json || {}),
    data.robots || "index,follow",
    data.status || "published",
    data.published !== undefined ? (data.published ? 1 : 0) : 1
  )
  .run();

  await syncCountryNav(db, code, data);
  return result;
}
export async function updateCountry(db, code, data) {
  const upperCode = code.toUpperCase();
  const result = await db.prepare(`
    UPDATE countries SET
      name=?, currency=?, language=?, legal_status=?, seo_title=?, seo_description=?,
      content_json=?, robots=?, status=?, published=?
    WHERE code=?
  `)
  .bind(
    data.name, data.currency, data.language, data.legal_status, data.seo_title, data.seo_description,
    typeof data.content_json === "string" ? data.content_json : JSON.stringify(data.content_json || {}),
    data.robots || "index,follow",
    data.status || "published",
    data.published !== undefined ? (data.published ? 1 : 0) : 1,
    upperCode
  )
  .run();

  await syncCountryNav(db, upperCode, data);
  return result;
}



export async function deleteCountry(db, code) {
  const upperCode = code.toUpperCase();
  const result = await db.prepare(`
    DELETE FROM countries WHERE code=?
  `)
  .bind(upperCode)
  .run();

  try {
    await nav.deleteAutoNavItemsForSource(db, "country", upperCode);
  } catch (e) {
    console.error("Country nav cleanup failed:", e.message);
  }

  return result;
}


export async function getCountryById(db, id) {
  return await db.prepare(`SELECT * FROM countries WHERE id = ? LIMIT 1`).bind(id).first();
}
