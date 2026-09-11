// worker/database/campaigns.js
//
// Campaign CRUD previously lived only inline in worker/api.js (the
// tenant admin endpoints). Extracted here as reusable, UNSCOPED
// functions -- same purpose as e.g. casinosDB.getAllCasinosAdmin() --
// so the Super API can call the same underlying operations without
// duplicating SQL or touching the existing tenant api.js endpoints at
// all (those keep their own inline queries, unmodified, working
// exactly as before this file existed).
//
// "Unscoped" here means no item-access filtering, matching how every
// OTHER Super API-exposed resource in this codebase already works
// (Super API is a single tenant-wide credential, not a per-user
// session -- see handlers-analytics.js header comment for the fuller
// explanation of why that's consistent, not a new weaker path).

export async function getAllCampaigns(db, { status = null } = {}) {
  const statusClause = status ? 'WHERE status = ?' : '';
  const result = await db.prepare(`
    SELECT * FROM campaigns ${statusClause} ORDER BY created_at DESC
  `).bind(...(status ? [status] : [])).all();
  return result.results || [];
}

export async function getCampaignById(db, id) {
  return await db.prepare(`SELECT * FROM campaigns WHERE id = ?`).bind(id).first();
}

export async function createCampaign(db, { name, utmSource, utmMedium, utmCampaign, utmTerm, utmContent, status, startDate, endDate, notes, createdBy }) {
  const result = await db.prepare(`
    INSERT INTO campaigns (name, utm_source, utm_medium, utm_campaign, utm_term, utm_content, status, start_date, end_date, notes, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    name, utmSource ?? null, utmMedium ?? null, utmCampaign ?? null,
    utmTerm ?? null, utmContent ?? null, status || 'active',
    startDate ?? null, endDate ?? null, notes ?? null,
    createdBy ?? null, createdBy ?? null
  ).run();
  return result.meta.last_row_id;
}

export async function updateCampaign(db, id, updates) {
  const existing = await getCampaignById(db, id);
  if (!existing) return null;

  await db.prepare(`
    UPDATE campaigns SET
      name = ?, utm_source = ?, utm_medium = ?, utm_campaign = ?, utm_term = ?, utm_content = ?,
      status = ?, start_date = ?, end_date = ?, notes = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    updates.name ?? existing.name,
    updates.utmSource ?? existing.utm_source,
    updates.utmMedium ?? existing.utm_medium,
    updates.utmCampaign ?? existing.utm_campaign,
    updates.utmTerm ?? existing.utm_term,
    updates.utmContent ?? existing.utm_content,
    updates.status ?? existing.status,
    updates.startDate ?? existing.start_date,
    updates.endDate ?? existing.end_date,
    updates.notes ?? existing.notes,
    updates.updatedBy ?? null,
    id
  ).run();
  return true;
}
