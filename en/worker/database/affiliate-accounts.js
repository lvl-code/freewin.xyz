// Affiliate Account CRUD.
//
// IMPORTANT: this module deliberately has no function that accepts or
// stores a plaintext secret. `credential_reference` is a pointer
// (e.g. a Cloudflare secret binding name or external vault key) that
// callers resolve elsewhere when actually needed — never returned by
// list/get here beyond the reference string itself, never logged.

export async function getAccountById(db, id) {
  return await db
    .prepare(`
      SELECT a.*, p.name AS program_name, p.partner_id, ap.name AS partner_name
      FROM affiliate_accounts a
      JOIN affiliate_programs p ON p.id = a.program_id
      JOIN affiliate_partners ap ON ap.id = p.partner_id
      WHERE a.id = ?
      LIMIT 1
    `)
    .bind(id)
    .first();
}

export async function getAllAccountsAdmin(db, { programId = null, status = null, search = null, limit = 100, offset = 0 } = {}) {
  const conditions = [];
  const params = [];

  if (programId != null) {
    conditions.push('a.program_id = ?');
    params.push(programId);
  }
  if (status) {
    conditions.push('a.status = ?');
    params.push(status);
  }
  if (search) {
    conditions.push('(a.account_name LIKE ? OR a.external_account_id LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);

  const result = await db
    .prepare(`
      SELECT a.*, p.name AS program_name
      FROM affiliate_accounts a
      JOIN affiliate_programs p ON p.id = a.program_id
      ${whereClause}
      ORDER BY a.account_name ASC
      LIMIT ? OFFSET ?
    `)
    .bind(...params)
    .all();

  return result.results || [];
}

export async function createAccount(db, account) {
  const result = await db
    .prepare(`
      INSERT INTO affiliate_accounts (
        program_id, account_name, external_account_id, status,
        portal_url, notes, credential_reference, created_by, updated_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      account.program_id,
      account.account_name,
      account.external_account_id || null,
      account.status || 'active',
      account.portal_url || null,
      account.notes || null,
      account.credential_reference || null,
      account.created_by || null,
      account.created_by || null
    )
    .run();

  return result.meta.last_row_id;
}

export async function updateAccount(db, id, account) {
  return await db
    .prepare(`
      UPDATE affiliate_accounts
      SET
        account_name = ?,
        external_account_id = ?,
        status = ?,
        portal_url = ?,
        notes = ?,
        credential_reference = ?,
        updated_by = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .bind(
      account.account_name,
      account.external_account_id || null,
      account.status || 'active',
      account.portal_url || null,
      account.notes || null,
      account.credential_reference || null,
      account.updated_by || null,
      id
    )
    .run();
}

export async function getAccountDependents(db, id) {
  const terms = await db
    .prepare(`SELECT COUNT(*) AS count FROM affiliate_commercial_terms WHERE account_id = ?`)
    .bind(id)
    .first();

  if (terms.count > 0) {
    return { commercial_terms: terms.count };
  }
  return null;
}

export async function deleteAccount(db, id) {
  return await db
    .prepare(`DELETE FROM affiliate_accounts WHERE id = ?`)
    .bind(id)
    .run();
}

export async function archiveAccount(db, id, updatedBy) {
  return await db
    .prepare(`
      UPDATE affiliate_accounts
      SET status = 'archived', updated_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .bind(updatedBy || null, id)
    .run();
}
