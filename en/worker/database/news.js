export async function getNews(db, slug) {
  if (!slug) return null;

  return db.prepare(`
    SELECT
      n.*,

      m.url AS featured_image_url,
      m.thumbnail_url AS featured_image_thumbnail,
      m.alt_text AS featured_image_alt,
      m.caption AS featured_image_caption,
      m.width AS featured_image_width,
      m.height AS featured_image_height,

      a.name AS author_name,
      a.slug AS author_slug,
      a.bio AS author_bio,
      a.avatar_url AS author_avatar,
      a.role AS author_role,
      a.social_links AS author_social_links

    FROM news n

    LEFT JOIN media_library m
      ON m.id = n.featured_image

    LEFT JOIN authors a
      ON a.id = n.author_id

    WHERE n.slug = ?

    LIMIT 1
  `)
    .bind(slug)
    .first();
}


export async function getAllNews(db) {
  const result = await db.prepare(`
    SELECT
      n.*,

      m.url AS featured_image_url,
      m.thumbnail_url AS featured_image_thumbnail,
      m.alt_text AS featured_image_alt,
      m.caption AS featured_image_caption,
      m.width AS featured_image_width,
      m.height AS featured_image_height,

      a.name AS author_name,
      a.slug AS author_slug,
      a.avatar_url AS author_avatar,
      a.role AS author_role

    FROM news n

    LEFT JOIN media_library m
      ON m.id = n.featured_image

    LEFT JOIN authors a
      ON a.id = n.author_id

    WHERE n.published = 1

    ORDER BY
      COALESCE(
        n.published_at,
        n.created_at
      ) DESC,

      n.id DESC
  `).all();

  return result.results || [];
}


/*
 * Legacy backup function.
 * Keep this for rollback compatibility.
 */
export async function getAllNewsbackup(db) {
  const result = await db.prepare(`
    SELECT *
    FROM news
    WHERE published = 1
    ORDER BY created_at DESC
  `).all();

  return result.results || [];
}


export async function createNews(db, data) {
  return db.prepare(`
    INSERT INTO news (
      slug,
      title,
      content,
      author,
      author_id,
      seo_title,
      seo_description,
      published,
      featured_image,
      excerpt,
      published_at,
      created_by
    )

    VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `)
    .bind(
      data.slug,
      data.title,
      data.content,

      data.author || "Admin",

      data.author_id || null,

      data.seo_title || null,

      data.seo_description || null,

      data.published !== undefined
        ? Number(data.published)
        : 1,

      data.featured_image
        ? Number(data.featured_image)
        : null,

      data.excerpt || null,

      data.published_at || null,

      data.created_by || null
    )
    .run();
}


export async function updateNews(
  db,
  oldslug,
  data
) {
  return db.prepare(`
    UPDATE news

    SET
      slug = ?,
      title = ?,
      content = ?,
      author = ?,
      author_id = ?,
      seo_title = ?,
      seo_description = ?,
      published = ?,
      featured_image = ?,
      excerpt = ?,
      published_at = ?,
      updated_at = CURRENT_TIMESTAMP

    WHERE slug = ?
  `)
    .bind(
      data.slug,

      data.title,

      data.content,

      data.author || "Admin",

      data.author_id || null,

      data.seo_title || null,

      data.seo_description || null,

      data.published !== undefined
        ? Number(data.published)
        : 1,

      data.featured_image
        ? Number(data.featured_image)
        : null,

      data.excerpt || null,

      data.published_at || null,

      oldslug
    )
    .run();
}


export async function deleteNews(db, slug) {
  return db.prepare(`
    DELETE FROM news
    WHERE slug = ?
  `)
    .bind(slug)
    .run();
}
