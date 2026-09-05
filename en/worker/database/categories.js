import * as nav from "./nav.js";

export async function getCategory(
  db,
  slug
){

  return db.prepare(`
    SELECT *
    FROM categories
    WHERE slug=?
    LIMIT 1
  `)
  .bind(slug)
  .first();

}

export async function getAllCategories(
  db
){

  const result =
    await db.prepare(`
      SELECT *
      FROM categories
      ORDER BY name
    `)
    .all();

  return result.results || [];

}

/**
 * Categories eligible to appear on the public site: published=1
 * AND status != 'draft'. Used for auto-nav / sitemap-style
 * listings where drafts must never leak out.
 */
export async function getPublishedCategories(db) {
  const result = await db.prepare(`
    SELECT *
    FROM categories
    WHERE published = 1 AND (status IS NULL OR status != 'draft')
    ORDER BY name
  `).all();

  return result.results || [];
}

export async function getCategoryCasinos(
  db,
  slug
){

  const result =
    await db.prepare(`
      SELECT c.*
      FROM casino_categories cc
      JOIN casinos c
      ON c.id = cc.casino_id
      JOIN categories cat
      ON cat.id = cc.category_id
      WHERE cat.slug = ?
      ORDER BY
        c.featured DESC,
        c.sort_order ASC,
        c.rating DESC
    `)
    .bind(slug)
    .all();

  return result.results || [];

}

// Resolves the auto nav link's enabled/disabled state to match a
// category's current publish state. Never throws — nav sync is a
// side effect of saving a category, not something that should
// ever fail the actual save.
async function syncCategoryNav(db, slug, data) {
  try {
    const isPublished = data.published !== undefined
      ? !!data.published
      : true;
    const isDraft = data.status === "draft";

    if (isPublished && !isDraft) {
      await nav.syncAutoNavItem(db, {
        sourceType: "category",
        sourceRef: slug,
        label: data.name,
        url: `/en/category/${slug}`,
        location: "page"
      });
    } else {
      await nav.disableAutoNavItem(db, "category", slug);
    }
  } catch (e) {
    console.error("Category nav sync failed:", e.message);
  }
}

export async function createCategory(
  db,
  data
){

  const result = await db.prepare(`
    INSERT INTO categories(
      slug,
      name,
      description,
      seo_title,
      seo_description,
      content_json,
      robots,
      status,
      published
    )
    VALUES(
      ?,?,?,?,?,?,?,?,?
    )
  `)
  .bind(
    data.slug,
    data.name,
    data.description,
    data.seo_title,
    data.seo_description,
    typeof data.content_json === "string" ? data.content_json : JSON.stringify(data.content_json || {}),
    data.robots || "index,follow",
    data.status || "published",
    data.published !== undefined ? (data.published ? 1 : 0) : 1
  )
  .run();

  await syncCategoryNav(db, data.slug, data);
  return result;

}

export async function updateCategory(db, slug, data) {
  const result = await db.prepare(`
    UPDATE categories SET
      name=?, description=?, seo_title=?, seo_description=?,
      content_json=?, robots=?, status=?, published=?
    WHERE slug=?
  `)
  .bind(
    data.name, data.description, data.seo_title, data.seo_description,
    typeof data.content_json === "string" ? data.content_json : JSON.stringify(data.content_json || {}),
    data.robots || "index,follow",
    data.status || "published",
    data.published !== undefined ? (data.published ? 1 : 0) : 1,
    slug
  )
  .run();

  await syncCategoryNav(db, slug, data);
  return result;
}


export async function deleteCategory(db, slug) {
  const result = await db.prepare(`
    DELETE FROM categories WHERE slug=?
  `)
  .bind(slug)
  .run();

  try {
    await nav.deleteAutoNavItemsForSource(db, "category", slug);
  } catch (e) {
    console.error("Category nav cleanup failed:", e.message);
  }

  return result;
}


export async function getCategoryById(db, id) {
  return await db.prepare(`SELECT * FROM categories WHERE id = ? LIMIT 1`).bind(id).first();
}
