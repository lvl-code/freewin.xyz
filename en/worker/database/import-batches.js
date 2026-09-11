export async function createImportBatch(db, { accountId, label = null, format, createdBy = null }) {
  const result = await db.prepare(`
    INSERT INTO import_batches (account_id, label, format, created_by)
    VALUES (?, ?, ?, ?)
  `).bind(accountId, label, format, createdBy).run();
  return result.meta.last_row_id;
}

export async function finalizeImportBatch(db, id, { totalRows, importedCount, duplicateCount, unattributedCount, errors }) {
  // Cap the stored error list -- brief §11 "show import errors
  // clearly" doesn't mean storing an unbounded blob for a
  // 100k-row file with 40k bad rows.
  const cappedErrors = (errors || []).slice(0, 200);
  await db.prepare(`
    UPDATE import_batches
    SET total_rows = ?, imported_count = ?, duplicate_count = ?, unattributed_count = ?,
        error_count = ?, errors_json = ?
    WHERE id = ?
  `).bind(
    totalRows, importedCount, duplicateCount, unattributedCount,
    errors.length, cappedErrors.length ? JSON.stringify(cappedErrors) : null,
    id
  ).run();
}

export async function getImportBatchById(db, id) {
  return await db.prepare(`
    SELECT ib.*, a.account_name
    FROM import_batches ib
    JOIN affiliate_accounts a ON a.id = ib.account_id
    WHERE ib.id = ?
    LIMIT 1
  `).bind(id).first();
}

export async function listImportBatches(db, { accountId = null, limit = 50 } = {}) {
  const conditions = [];
  const params = [];
  if (accountId != null) { conditions.push('ib.account_id = ?'); params.push(accountId); }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);

  const result = await db.prepare(`
    SELECT ib.*, a.account_name
    FROM import_batches ib
    JOIN affiliate_accounts a ON a.id = ib.account_id
    ${whereClause}
    ORDER BY ib.created_at DESC
    LIMIT ?
  `).bind(...params).all();

  return result.results || [];
}
