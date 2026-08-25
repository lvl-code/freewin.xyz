export async function getAuthor(db, slug) {
  return await db.prepare(`SELECT * FROM authors WHERE slug = ? LIMIT 1`).bind(slug).first();
}

export async function getAuthorById(db, id) {
  return await db.prepare(`SELECT * FROM authors WHERE id = ? LIMIT 1`).bind(id).first();
}

export async function getAllAuthors(db) {
  const result = await db.prepare(`SELECT * FROM authors WHERE published = 1 ORDER BY name`).all();
  return result.results || [];
}

export async function getAllAuthorsAdmin(db) {
  const result = await db.prepare(`SELECT * FROM authors ORDER BY name`).all();
  return result.results || [];
}

export async function createAuthor(db, data) {
  const result = await db.prepare(`
    INSERT INTO authors (slug, name, bio, avatar_url, role, email, social_links, seo_title, seo_description, published)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    data.slug,
    data.name,
    data.bio || null,
    data.avatar_url || null,
    data.role || "editor",
    data.email || null,
    data.social_links || null,
    data.seo_title || null,
    data.seo_description || null,
    data.published !== undefined ? (data.published ? 1 : 0) : 1
  ).run();
  return result.meta.last_row_id;
}

export async function updateAuthor(db, id, data) {
  return await db.prepare(`
    UPDATE authors SET
      slug = ?, name = ?, bio = ?, avatar_url = ?, role = ?, email = ?,
      social_links = ?, seo_title = ?, seo_description = ?, published = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    data.slug,
    data.name,
    data.bio || null,
    data.avatar_url || null,
    data.role || "editor",
    data.email || null,
    data.social_links || null,
    data.seo_title || null,
    data.seo_description || null,
    data.published !== undefined ? (data.published ? 1 : 0) : 1,
    id
  ).run();
}

export async function deleteAuthor(db, id) {
  // Unlink author from all content
  await db.prepare(`UPDATE reviews SET author_id = NULL WHERE author_id = ?`).bind(id).run();
  await db.prepare(`UPDATE news SET author_id = NULL WHERE author_id = ?`).bind(id).run();
  await db.prepare(`UPDATE pages SET author_id = NULL WHERE author_id = ?`).bind(id).run();
  return await db.prepare(`DELETE FROM authors WHERE id = ?`).bind(id).run();
}

export async function getAuthorContent(db, authorId) {
  const reviews = await db.prepare(`
    SELECT slug, title, rating, casino_slug, created_at, updated_at FROM reviews
    WHERE author_id = ? AND published = 1 ORDER BY created_at DESC
  `).bind(authorId).all();

  const news = await db.prepare(`
    SELECT
      n.slug, n.title, n.excerpt, n.created_at, n.updated_at,
      m.url AS featured_image_url,
      m.thumbnail_url AS featured_image_thumbnail,
      m.alt_text AS featured_image_alt
    FROM news n
    LEFT JOIN media_library m ON m.id = n.featured_image
    WHERE n.author_id = ? AND n.published = 1
    ORDER BY n.created_at DESC
  `).bind(authorId).all();

  const pages = await db.prepare(`
    SELECT slug, title, created_at, updated_at FROM pages
    WHERE author_id = ? AND published = 1 ORDER BY created_at DESC
  `).bind(authorId).all();

  return {
    reviews: reviews.results || [],
    news: news.results || [],
    pages: pages.results || []
  };
}

export async function getAuthorContentbackup(db, authorId) {
  const reviews = await db.prepare(`
    SELECT slug, title, rating, created_at, updated_at FROM reviews
    WHERE author_id = ? AND published = 1 ORDER BY created_at DESC
  `).bind(authorId).all();

  const news = await db.prepare(`
    SELECT slug, title, created_at, updated_at FROM news
    WHERE author_id = ? AND published = 1 ORDER BY created_at DESC
  `).bind(authorId).all();

  const pages = await db.prepare(`
    SELECT slug, title, created_at, updated_at FROM pages
    WHERE author_id = ? AND published = 1 ORDER BY created_at DESC
  `).bind(authorId).all();

  return {
    reviews: reviews.results || [],
    news: news.results || [],
    pages: pages.results || []
  };
}

export async function getAuthorStats(db, authorId) {
  const reviews = await db.prepare(`SELECT COUNT(*) c FROM reviews WHERE author_id = ?`).bind(authorId).first();
  const news = await db.prepare(`SELECT COUNT(*) c FROM news WHERE author_id = ?`).bind(authorId).first();
  const pages = await db.prepare(`SELECT COUNT(*) c FROM pages WHERE author_id = ?`).bind(authorId).first();
  return {
    reviews: reviews.c,
    news: news.c,
    pages: pages.c
  };
}
