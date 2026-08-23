// ============================================================
// en/worker/database/ad-rules.js
// Full Ad Rules CRUD with all targeting fields
// ============================================================

const VALID_PLACEMENTS = [
  'after_paragraph',
  'before_paragraph',
  'end_of_article',
  'before_article',
  'after_heading',
  'before_heading',
  'after_first_image',
  'middle_of_article'
];

const VALID_DEVICES = ['all', 'desktop', 'mobile', 'tablet'];
const VALID_PAGE_TYPES = ['all', 'news', 'review', 'casino', 'category', 'page'];

export async function getAllAdRules(db) {
  const result = await db.prepare(`
    SELECT r.*, c.name AS component_name, c.slug AS component_slug,
           c.status AS component_status, c.content AS component_html
    FROM ad_rules r
    LEFT JOIN components c ON c.id = r.component_id
    ORDER BY r.priority ASC, r.id ASC
  `).all();
  return result.results || [];
}

export async function getEnabledAdRules(db, pageType = 'all') {
  let query = `
    SELECT r.*, c.name AS component_name, c.slug AS component_slug,
           c.content AS component_html, c.status AS component_status
    FROM ad_rules r
    LEFT JOIN components c ON c.id = r.component_id
    WHERE r.enabled = 1 AND c.status = 'active'
  `;
  let params = [];

  if (pageType && pageType !== 'all') {
    query += ` AND (r.page_type = 'all' OR r.page_type = ?)`;
    params.push(pageType);
  }

  query += ` ORDER BY r.priority ASC, r.id ASC`;

  const result = await db.prepare(query).bind(...params).all();
  return result.results || [];
}

export async function createAdRule(db, data) {
  const errors = validateRule(data, false);
  if (errors.length > 0) throw new Error(errors.join('; '));

  return await db.prepare(`
    INSERT INTO ad_rules (
      component_id, enabled, placement, position_value,
      repeat_interval, max_appearances, devices, countries,
      page_type, priority, start_date, end_date
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    parseInt(data.component_id, 10),
    data.enabled !== false ? 1 : 0,
    data.placement || 'after_paragraph',
    parseInt(data.position_value, 10) || 3,
    parseInt(data.repeat_interval, 10) || 0,
    parseInt(data.max_appearances, 10) || 1,
    data.devices || 'all',
    data.countries || 'all',
    data.page_type || 'all',
    parseInt(data.priority, 10) || 100,
    data.start_date || null,
    data.end_date || null
  ).run();
}

export async function updateAdRule(db, id, data) {
  if (!id) throw new Error('Rule ID is required');
  const errors = validateRule(data, true);
  if (errors.length > 0) throw new Error(errors.join('; '));

  return await db.prepare(`
    UPDATE ad_rules SET
      component_id = ?,
      enabled = ?,
      placement = ?,
      position_value = ?,
      repeat_interval = ?,
      max_appearances = ?,
      devices = ?,
      countries = ?,
      page_type = ?,
      priority = ?,
      start_date = ?,
      end_date = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    parseInt(data.component_id, 10),
    data.enabled !== undefined ? (data.enabled ? 1 : 0) : 1,
    data.placement || 'after_paragraph',
    parseInt(data.position_value, 10) || 3,
    parseInt(data.repeat_interval, 10) || 0,
    parseInt(data.max_appearances, 10) || 1,
    data.devices || 'all',
    data.countries || 'all',
    data.page_type || 'all',
    parseInt(data.priority, 10) || 100,
    data.start_date || null,
    data.end_date || null,
    parseInt(id, 10)
  ).run();
}

export async function deleteAdRule(db, id) {
  if (!id) throw new Error('Rule ID is required');
  return await db.prepare(`DELETE FROM ad_rules WHERE id = ?`)
    .bind(parseInt(id, 10)).run();
}

// ── Validation ──────────────────────────────────────────

function validateRule(data, isUpdate) {
  const errors = [];

  if (!data.component_id || isNaN(parseInt(data.component_id, 10))) {
    errors.push('Component ID is required and must be numeric');
  }

  if (data.placement && !VALID_PLACEMENTS.includes(data.placement)) {
    errors.push(`Invalid placement. Must be one of: ${VALID_PLACEMENTS.join(', ')}`);
  }

  if (data.devices && !VALID_DEVICES.includes(data.devices)) {
    errors.push(`Invalid device. Must be one of: ${VALID_DEVICES.join(', ')}`);
  }

  if (data.page_type && !VALID_PAGE_TYPES.includes(data.page_type)) {
    errors.push(`Invalid page type. Must be one of: ${VALID_PAGE_TYPES.join(', ')}`);
  }

  if (data.position_value !== undefined) {
    const pv = parseInt(data.position_value, 10);
    if (isNaN(pv) || pv < 1) {
      errors.push('Position value must be a positive integer');
    }
  }

  if (data.max_appearances !== undefined) {
    const ma = parseInt(data.max_appearances, 10);
    if (isNaN(ma) || ma < 1) {
      errors.push('Max appearances must be a positive integer');
    }
  }

  if (data.priority !== undefined) {
    const p = parseInt(data.priority, 10);
    if (isNaN(p) || p < 1) {
      errors.push('Priority must be a positive integer');
    }
  }

  if (data.start_date && data.end_date) {
    if (new Date(data.start_date) > new Date(data.end_date)) {
      errors.push('Start date cannot be after end date');
    }
  }

  return errors;
}

export { VALID_PLACEMENTS, VALID_DEVICES, VALID_PAGE_TYPES };
