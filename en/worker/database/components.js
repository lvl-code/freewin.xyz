// =====================================================
// COMPONENTS DATABASE MODULE
// =====================================================

// ── CRUD ──

export async function createComponent(db, data) {
  const result = await db.prepare(`
    INSERT INTO components (name, slug, type, title, content, settings_json, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    data.name,
    data.slug || slugify(data.name),
    data.type,
    data.title || null,
    data.content || null,
    data.settings_json || null,
    data.status || "active"
  ).run();
  return result.meta.last_row_id;
}

export async function updateComponent(db, id, data) {
  return await db.prepare(`
    UPDATE components SET
      name = ?,
      slug = ?,
      type = ?,
      title = ?,
      content = ?,
      settings_json = ?,
      status = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    data.name,
    data.slug,
    data.type,
    data.title || null,
    data.content || null,
    data.settings_json || null,
    data.status || "active",
    id
  ).run();
}

export async function deleteComponent(db, id) {
  return await db.prepare(`DELETE FROM components WHERE id = ?`).bind(id).run();
}

export async function getComponent(db, id) {
  return await db.prepare(`SELECT * FROM components WHERE id = ?`).bind(id).first();
}

export async function getComponentBySlug(db, slug) {
  return await db.prepare(`SELECT * FROM components WHERE slug = ?`).bind(slug).first();
}

export async function getAllComponents(db, type = null) {
  if (type) {
    const result = await db.prepare(
      `SELECT * FROM components WHERE type = ? ORDER BY created_at DESC`
    ).bind(type).all();
    return result.results || [];
  }
  const result = await db.prepare(
    `SELECT * FROM components ORDER BY created_at DESC`
  ).all();
  return result.results || [];
}

// ── Page-Component Assignment ──


export async function assignComponentToPage(db, data) {
  return await db.prepare(`
    INSERT INTO page_components (page_type, page_slug, component_id, position, enabled, injection_point)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    data.page_type,
    data.page_slug,
    data.component_id,
    data.position || 0,
    data.enabled !== undefined ? (data.enabled ? 1 : 0) : 1,
    data.injection_point || "content_bottom"
  ).run();
}



export async function updatePageComponentPosition(db, id, position) {
  return await db.prepare(`
    UPDATE page_components SET position = ? WHERE id = ?
  `).bind(position, id).run();
}

export async function togglePageComponent(db, id, enabled) {
  return await db.prepare(`
    UPDATE page_components SET enabled = ? WHERE id = ?
  `).bind(enabled ? 1 : 0, id).run();
}

export async function removePageComponent(db, id) {
  return await db.prepare(`DELETE FROM page_components WHERE id = ?`).bind(id).run();
}


export async function getPageComponents(db, pageType, pageSlug, injectionPoint = null) {
  let query = `
    SELECT pc.*, c.name, c.slug, c.type, c.title, c.content, c.settings_json, c.status
    FROM page_components pc
    JOIN components c ON c.id = pc.component_id
    WHERE pc.page_type = ? AND pc.enabled = 1
    AND (pc.page_slug = ? OR pc.page_slug = '*')
  `;
  const binds = [pageType, pageSlug];

  if (injectionPoint) {
    query += ` AND pc.injection_point = ?`;
    binds.push(injectionPoint);
  }

  query += ` ORDER BY pc.position ASC`;

  const result = await db.prepare(query).bind(...binds).all();
  return result.results || [];
}

export async function getPageAssignmentById(db, id) {
  return await db
    .prepare(`
      SELECT pc.*, c.name, c.type, c.title
      FROM page_components pc
      JOIN components c ON c.id = pc.component_id
      WHERE pc.id = ?
      LIMIT 1
    `)
    .bind(id)
    .first();
}

export async function getAllPageAssignments(db, pageType = null, pageSlug = null) {
  if (pageType && pageSlug) {
    const result = await db.prepare(`
      SELECT pc.*, c.name, c.type, c.title
      FROM page_components pc
      JOIN components c ON c.id = pc.component_id
      WHERE pc.page_type = ? AND (pc.page_slug = ? OR pc.page_slug = '*')
      ORDER BY pc.injection_point, pc.position ASC
    `).bind(pageType, pageSlug).all();
    return result.results || [];
  }
  const result = await db.prepare(`
    SELECT pc.*, c.name, c.type, c.title
    FROM page_components pc
    JOIN components c ON c.id = pc.component_id
    ORDER BY pc.page_type, pc.page_slug, pc.injection_point, pc.position ASC
  `).all();
  return result.results || [];
}

export async function bulkAssignComponent(db, data) {
  // page_slugs is an array of slugs, or ["*"] for all
  const slugs = data.page_slugs || ["*"];
  for (const slug of slugs) {
    await db.prepare(`
      INSERT INTO page_components (page_type, page_slug, component_id, position, enabled, injection_point)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      data.page_type,
      slug,
      data.component_id,
      data.position || 0,
      1,
      data.injection_point || "content_bottom"
    ).run();
  }
  return true;
}

// ── Helper ──

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}


export async function updatePageComponentAssignment(db, id, data) {
  return await db.prepare(`
    UPDATE page_components SET
      position = ?,
      injection_point = ?
    WHERE id = ?
  `).bind(
    data.position || 0,
    data.injection_point || "content_bottom",
    id
  ).run();
}
