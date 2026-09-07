// Central audit log helper.
//
// audit_logs had zero call sites anywhere in this codebase before this
// file (confirmed by search) — this is the first reusable writer for
// it, modeled on the existing Super API equivalent
// (worker/super/auth.js: logSuperApiRequest), which follows the same
// "never let logging break the actual request" try/catch shape.
//
// Usage:
//   await logAudit(db, {
//     userId: user.user_id,
//     action: 'create',
//     entityType: 'affiliate_partner',
//     entityId: partnerId,
//     metadata: { name: body.name, status: body.status }
//   });
//
// NEVER pass credentials, passwords, tokens, or API secrets in
// `metadata` — it is stored as plain JSON text in the database.

export async function logAudit(db, { userId, action, entityType, entityId, metadata = null }) {
  try {
    await db
      .prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata)
        VALUES (?, ?, ?, ?, ?)
      `)
      .bind(
        userId ?? null,
        action,
        entityType,
        entityId != null ? String(entityId) : null,
        metadata != null ? JSON.stringify(metadata) : null
      )
      .run();
  } catch (_) {
    // Audit logging must never break the response.
  }
}

export async function getAuditLog(db, { entityType = null, entityId = null, limit = 50 } = {}) {
  const conditions = [];
  const params = [];

  if (entityType) {
    conditions.push('entity_type = ?');
    params.push(entityType);
  }
  if (entityId != null) {
    conditions.push('entity_id = ?');
    params.push(String(entityId));
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);

  const result = await db
    .prepare(`
      SELECT * FROM audit_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ?
    `)
    .bind(...params)
    .all();

  return result.results || [];
}
