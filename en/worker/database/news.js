// ============================================================
// en/worker/database/news.js
// Enhanced: featured image, excerpt, tags, published_at,
//           ai_generated, search, tag filter, related news
// ============================================================

export async function getNews(db, slug) {
  if (!slug) return null;

  return await db.prepare(`
    SELECT
      n.*,
      m.url            AS featured_image_url,
      m.thumbnail_url   AS featured_image_thumbnail,
      m.alt_text        AS featured_image_alt,
      m.caption         AS featured_image_caption,
      m.width           AS featured_image_width,
      m.height          AS featured_image_height,
      a.name            AS author_name,
      a.slug            AS author_slug,
      a.bio             AS author_bio,
      a.avatar_url      AS author_avatar,
      a.role            AS author_role
    FROM news n
    LEFT JOIN media_library m ON m.id = n.featured_image
    LEFT JOIN authors a       ON a.id = n.author_id
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
      m.url            AS featured_image_url,
      m.thumbnail_url   AS featured_image_thumbnail,
      m.alt_text        AS featured_image_alt,
      a.name            AS author_name,
      a.slug            AS author_slug,
      a.avatar_url      AS author_avatar,
      a.role            AS author_role
    FROM news n
    LEFT JOIN media_library m ON m.id = n.featured_image
    LEFT JOIN authors a       ON a.id = n.author_id
    WHERE n.published = 1
      AND (n.published_at IS NULL OR datetime(n.published_at) <= datetime('now'))
    ORDER BY COALESCE(n.published_at, n.created_at) DESC, n.id DESC
  `).all();

  return result.results || [];
}

export async function getAllNewsAdmin(db) {
  const result = await db.prepare(`
    SELECT
      n.*,
      m.url            AS featured_image_url,
      m.thumbnail_url   AS featured_image_thumbnail,
      m.alt_text        AS featured_image_alt,
      a.name            AS author_name,
      a.slug            AS author_slug,
      a.avatar_url      AS author_avatar
    FROM news n
    LEFT JOIN media_library m ON m.id = n.featured_image
    LEFT JOIN authors a       ON a.id = n.author_id
    ORDER BY COALESCE(n.published_at, n.created_at) DESC, n.id DESC
  `).all();

  return result.results || [];
}

export async function searchNews(db, query, limit = 20) {
  const q = String(query || "").trim();
  if (!q) return [];

  const pattern = `%${q}%`;

  const result = await db.prepare(`
    SELECT
      n.*,
      m.url            AS featured_image_url,
      m.thumbnail_url   AS featured_image_thumbnail,
      m.alt_text        AS featured_image_alt,
      a.name            AS author_name,
      a.slug            AS author_slug,
      a.avatar_url      AS author_avatar,
      a.role            AS author_role
    FROM news n
    LEFT JOIN media_library m ON m.id = n.featured_image
    LEFT JOIN authors a       ON a.id = n.author_id

    WHERE n.published = 1
      AND (n.published_at IS NULL OR datetime(n.published_at) <= datetime('now'))
      AND (
        n.title   LIKE ? OR
        n.excerpt LIKE ? OR
        n.content LIKE ? OR
        n.tags    LIKE ?
      )
    ORDER BY COALESCE(n.published_at, n.created_at) DESC
    LIMIT ?
  `)
  .bind(pattern, pattern, pattern, pattern, limit)
  .all();

  return result.results || [];
}

export async function getNewsByTag(db, tag, limit = 50) {
  const t = String(tag || "").trim();
  if (!t) return [];

  const result = await db.prepare(`
    SELECT
      n.*,
      m.url            AS featured_image_url,
      m.thumbnail_url   AS featured_image_thumbnail,
      m.alt_text        AS featured_image_alt,
      a.name            AS author_name,
      a.slug            AS author_slug,
      a.avatar_url      AS author_avatar,
      a.role            AS author_role
    FROM news n
    LEFT JOIN media_library m ON m.id = n.featured_image
    LEFT JOIN authors a       ON a.id = n.author_id
   WHERE n.published = 1
      AND (n.published_at IS NULL OR datetime(n.published_at) <= datetime('now'))
      AND n.tags LIKE ?
    ORDER BY COALESCE(n.published_at, n.created_at) DESC
    LIMIT ?

  `)
  .bind(`%${t}%`, limit)
  .all();

  return result.results || [];
}

export async function getRelatedNews(db, currentSlug, tags, limit = 3) {
  if (!tags) return [];

  const tagList = String(tags)
    .split(",")
    .map(t => t.trim())
    .filter(Boolean);

  if (tagList.length === 0) return [];

  const conditions = tagList.map(() => "n.tags LIKE ?").join(" OR ");
  const tagParams  = tagList.map(t => `%${t}%`);

  const result = await db.prepare(`
    SELECT
      n.slug,
      n.title,
      n.excerpt,
      n.published_at,
      n.created_at,
      m.url            AS featured_image_url,
      m.thumbnail_url   AS featured_image_thumbnail,
      m.alt_text        AS featured_image_alt,
      a.name            AS author_name,
      a.slug            AS author_slug
    FROM news n
    LEFT JOIN media_library m ON m.id = n.featured_image
    LEFT JOIN authors a       ON a.id = n.author_id
   WHERE n.published = 1
      AND (n.published_at IS NULL OR datetime(n.published_at) <= datetime('now'))
      AND n.slug != ?
      AND (${conditions})
    ORDER BY COALESCE(n.published_at, n.created_at) DESC
    LIMIT ?
  `)
  .bind(currentSlug, ...tagParams, limit)
  .all();

  return result.results || [];
}


export async function createNews(db, data) {
  const slug   = String(data.slug || "").trim();
  const title  = String(data.title || "").trim();
  const content = String(data.content || "");

  if (!slug)   throw new Error("Slug is required.");
  if (!title)  throw new Error("Title is required.");
  if (!content.trim()) throw new Error("Content is required.");

  const published = data.published !== undefined ? (data.published ? 1 : 0) : 1;
  const publishedAt = data.published_at || (published ? new Date().toISOString() : null);

  // If ad_mode is 'disable', inject ADS:DISABLE marker into content
  let finalContent = content;
  if (data.ad_mode === 'disable' && !/<!--\s*ADS:DISABLE\s*-->/i.test(content)) {
    finalContent = '<!--ADS:DISABLE-->\n' + content;
  }

  return await db.prepare(`
    INSERT INTO news (
      slug, title, content, author, author_id,
      ai_generated, seo_title, seo_description,
      published, featured_image, excerpt, tags,
      published_at, ad_mode, created_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  .bind(
    slug,
    title,
    finalContent,
    String(data.author || "Admin").trim(),
    normalizeId(data.author_id),
    data.ai_generated ? 1 : 0,
    normalizeText(data.seo_title),
    normalizeText(data.seo_description),
    published,
    normalizeId(data.featured_image),
    normalizeText(data.excerpt),
    normalizeText(data.tags),
    publishedAt,
    data.ad_mode || 'auto',
    normalizeId(data.created_by)
  )
  .run();
}

export async function createNewsbackup(db, data) {
  const slug   = String(data.slug || "").trim();
  const title  = String(data.title || "").trim();
  const content = String(data.content || "");

  if (!slug)   throw new Error("Slug is required.");
  if (!title)  throw new Error("Title is required.");
  if (!content.trim()) throw new Error("Content is required.");

  const published = data.published !== undefined ? (data.published ? 1 : 0) : 1;
  const publishedAt = data.published_at || (published ? new Date().toISOString() : null);

  return await db.prepare(`
    INSERT INTO news (
      slug, title, content, author, author_id,
      ai_generated, seo_title, seo_description,
      published, featured_image, excerpt, tags,
      published_at, created_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  .bind(
    slug,
    title,
    content,
    String(data.author || "Admin").trim(),
    normalizeId(data.author_id),
    data.ai_generated ? 1 : 0,
    normalizeText(data.seo_title),
    normalizeText(data.seo_description),
    published,
    normalizeId(data.featured_image),
    normalizeText(data.excerpt),
    normalizeText(data.tags),
    publishedAt,
    normalizeId(data.created_by)
  )
  .run();
}

export async function updateNews(db, oldSlug, data) {
  if (!oldSlug) throw new Error("Original slug is required.");

  const slug   = String(data.slug || "").trim();
  const title  = String(data.title || "").trim();
  const content = String(data.content || "");

  if (!slug)   throw new Error("Slug is required.");
  if (!title)  throw new Error("Title is required.");
  if (!content.trim()) throw new Error("Content is required.");

  const published = data.published !== undefined ? (data.published ? 1 : 0) : 1;

  // Handle ad_mode
  let finalContent = content;
  if (data.ad_mode === 'disable') {
    if (!/<!--\s*ADS:DISABLE\s*-->/i.test(content)) {
      finalContent = '<!--ADS:DISABLE-->\n' + content;
    }
  } else {
    // Remove any existing ADS:DISABLE marker if switching to auto
    finalContent = content.replace(/<!--\s*ADS:DISABLE\s*-->\n?/gi, '');
  }

  return await db.prepare(`
    UPDATE news
    SET
      slug          = ?,
      title         = ?,
      content       = ?,
      author        = ?,
      author_id     = ?,
      ai_generated  = ?,
      seo_title     = ?,
      seo_description = ?,
      published     = ?,
      featured_image = ?,
      excerpt       = ?,
      tags          = ?,
      published_at  = ?,
      ad_mode       = ?,
      updated_at    = CURRENT_TIMESTAMP
    WHERE slug = ?
  `)
  .bind(
    slug,
    title,
    finalContent,
    String(data.author || "Admin").trim(),
    normalizeId(data.author_id),
    data.ai_generated ? 1 : 0,
    normalizeText(data.seo_title),
    normalizeText(data.seo_description),
    published,
    normalizeId(data.featured_image),
    normalizeText(data.excerpt),
    normalizeText(data.tags),
    data.published_at || null,
    data.ad_mode || 'auto',
    oldSlug
  )
  .run();
}

export async function updateNewsbackup(db, oldSlug, data) {
  if (!oldSlug) throw new Error("Original slug is required.");

  const slug   = String(data.slug || "").trim();
  const title  = String(data.title || "").trim();
  const content = String(data.content || "");

  if (!slug)   throw new Error("Slug is required.");
  if (!title)  throw new Error("Title is required.");
  if (!content.trim()) throw new Error("Content is required.");

  const published = data.published !== undefined ? (data.published ? 1 : 0) : 1;

  return await db.prepare(`
    UPDATE news
    SET
      slug          = ?,
      title         = ?,
      content       = ?,
      author        = ?,
      author_id     = ?,
      ai_generated  = ?,
      seo_title     = ?,
      seo_description = ?,
      published     = ?,
      featured_image = ?,
      excerpt       = ?,
      tags          = ?,
      published_at  = ?,
      updated_at    = CURRENT_TIMESTAMP
    WHERE slug = ?
  `)
  .bind(
    slug,
    title,
    content,
    String(data.author || "Admin").trim(),
    normalizeId(data.author_id),
    data.ai_generated ? 1 : 0,
    normalizeText(data.seo_title),
    normalizeText(data.seo_description),
    published,
    normalizeId(data.featured_image),
    normalizeText(data.excerpt),
    normalizeText(data.tags),
    data.published_at || null,
    oldSlug
  )
  .run();
}

export async function deleteNews(db, slug) {
  return await db.prepare(`DELETE FROM news WHERE slug = ?`)
    .bind(slug)
    .run();
}

// ── Helpers ──────────────────────────────────────────────

function normalizeText(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s || null;
}

function normalizeId(value) {
  if (value === undefined || value === null || value === "") return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}
