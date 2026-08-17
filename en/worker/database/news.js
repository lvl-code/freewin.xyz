export async function getNews(
  db,
  slug
){

  return db.prepare(`
    SELECT *
    FROM news
    WHERE slug=?
    LIMIT 1
  `)
  .bind(slug)
  .first();

}


export async function getAllNews(db) {
  const result = await db.prepare(`
    SELECT *
    FROM news
    WHERE published = 1
    ORDER BY created_at DESC
  `).all();

  return result.results || [];
}
export async function getAllNewsbackup(
  db
){

  const result =
    await db.prepare(`
      SELECT *
      FROM news
      WHERE published=1
      ORDER BY created_at DESC
    `)
    .all();

  return result.results || [];

}


export async function createNews(db, data) {
  return db.prepare(`
    INSERT INTO news(
      slug, title, content, author, author_id, seo_title, seo_description, published, created_by
    )
    VALUES(?,?,?,?,?,?,?,1,?)
  `)
  .bind(
    data.slug,
    data.title,
    data.content,
    data.author || "Admin",
    data.author_id || null,
    data.seo_title,
    data.seo_description,
    data.created_by || null
  )
  .run();
}

export async function updateNews(db, oldslug, data) {
  return db.prepare(`
    UPDATE news
    SET
      slug=?,
      title=?, content=?, seo_title=?, seo_description=?, author_id=?,
      updated_at=CURRENT_TIMESTAMP
    WHERE slug=?
  `)
  .bind(
    data.slug,
    data.title,
    data.content,
    data.seo_title,
    data.seo_description,
    data.author_id || null,
    oldslug
  )
  .run();
}


export async function deleteNews(
  db,
  slug
){

  return db.prepare(`
    DELETE FROM news
    WHERE slug=?
  `)
  .bind(slug)
  .run();

}
