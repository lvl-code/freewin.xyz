// Affiliate Program CRUD + Program<->Casino relationship management.
// A program belongs to exactly one partner; a program can cover many
// casinos, and a casino can sit under many programs (see
// migrations/0023_affiliate_partners_programs.sql for the full
// relationship rationale).

export async function getProgramById(db, id) {
  return await db
    .prepare(`
      SELECT p.*, ap.name AS partner_name, ap.slug AS partner_slug
      FROM affiliate_programs p
      JOIN affiliate_partners ap ON ap.id = p.partner_id
      WHERE p.id = ?
      LIMIT 1
    `)
    .bind(id)
    .first();
}

export async function getAllProgramsAdmin(db, { partnerId = null, status = null, search = null, limit = 100, offset = 0 } = {}) {
  const conditions = [];
  const params = [];

  if (partnerId != null) {
    conditions.push('p.partner_id = ?');
    params.push(partnerId);
  }
  if (status) {
    conditions.push('p.status = ?');
    params.push(status);
  }
  if (search) {
    conditions.push('(p.name LIKE ? OR ap.name LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);

  const result = await db
    .prepare(`
      SELECT p.*, ap.name AS partner_name, ap.slug AS partner_slug
      FROM affiliate_programs p
      JOIN affiliate_partners ap ON ap.id = p.partner_id
      ${whereClause}
      ORDER BY ap.name ASC, p.name ASC
      LIMIT ? OFFSET ?
    `)
    .bind(...params)
    .all();

  return result.results || [];
}

export async function createProgram(db, program) {
  const result = await db
    .prepare(`
      INSERT INTO affiliate_programs (
        partner_id, name, status, portal_url, supported_geos,
        reporting_notes, notes, created_by, updated_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      program.partner_id,
      program.name,
      program.status || 'active',
      program.portal_url || null,
      program.supported_geos ? JSON.stringify(program.supported_geos) : null,
      program.reporting_notes || null,
      program.notes || null,
      program.created_by || null,
      program.created_by || null
    )
    .run();

  return result.meta.last_row_id;
}

export async function updateProgram(db, id, program) {
  return await db
    .prepare(`
      UPDATE affiliate_programs
      SET
        name = ?,
        status = ?,
        portal_url = ?,
        supported_geos = ?,
        reporting_notes = ?,
        notes = ?,
        updated_by = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .bind(
      program.name,
      program.status || 'active',
      program.portal_url || null,
      program.supported_geos ? JSON.stringify(program.supported_geos) : null,
      program.reporting_notes || null,
      program.notes || null,
      program.updated_by || null,
      id
    )
    .run();
}

/**
 * Dependent-record summary used to block/inform hard deletes.
 * A program can only be deleted once it has no casinos, no accounts,
 * and no commercial terms attached — archival (status = 'ended' /
 * 'archived') is the intended path otherwise.
 */
export async function getProgramDependents(db, id) {
  const [casinos, accounts, terms] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS count FROM affiliate_program_casinos WHERE program_id = ?`).bind(id).first(),
    db.prepare(`SELECT COUNT(*) AS count FROM affiliate_accounts WHERE program_id = ?`).bind(id).first(),
    db.prepare(`SELECT COUNT(*) AS count FROM affiliate_commercial_terms WHERE program_id = ?`).bind(id).first(),
  ]);

  const dependents = {};
  if (casinos.count > 0) dependents.casinos = casinos.count;
  if (accounts.count > 0) dependents.accounts = accounts.count;
  if (terms.count > 0) dependents.commercial_terms = terms.count;

  return Object.keys(dependents).length ? dependents : null;
}

export async function deleteProgram(db, id) {
  return await db
    .prepare(`DELETE FROM affiliate_programs WHERE id = ?`)
    .bind(id)
    .run();
}

export async function archiveProgram(db, id, updatedBy) {
  return await db
    .prepare(`
      UPDATE affiliate_programs
      SET status = 'archived', updated_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .bind(updatedBy || null, id)
    .run();
}

// ── Program <-> Casino relationship ────────────────

/**
 * Replaces the full set of casinos a program covers. Mirrors the
 * setCasinoCategories() pattern in casinos.js (delete-then-reinsert),
 * which is safe here because the join table carries no independent
 * history — commercial terms (which DO carry history) reference
 * casino_id directly and are untouched by this.
 */
export async function setProgramCasinos(db, programId, casinoIds) {
  await db
    .prepare(`DELETE FROM affiliate_program_casinos WHERE program_id = ?`)
    .bind(programId)
    .run();

  if (!casinoIds || !casinoIds.length) return;

  for (const casinoId of casinoIds) {
    await db
      .prepare(`
        INSERT INTO affiliate_program_casinos (program_id, casino_id)
        VALUES (?, ?)
      `)
      .bind(programId, casinoId)
      .run();
  }
}

export async function getProgramCasinos(db, programId) {
  const result = await db
    .prepare(`
      SELECT c.id, c.slug, c.name, apc.status
      FROM affiliate_program_casinos apc
      JOIN casinos c ON c.id = apc.casino_id
      WHERE apc.program_id = ?
      ORDER BY c.name ASC
    `)
    .bind(programId)
    .all();
  return result.results || [];
}

/**
 * Reverse lookup: every program (and its partner) covering a given
 * casino. Used by the Offer admin UI to populate the program picker
 * scoped to the casino being edited, and by the eligibility service
 * (Phase 4+) to enumerate candidate programs for a casino.
 */
export async function getCasinoPrograms(db, casinoId) {
  const result = await db
    .prepare(`
      SELECT p.*, ap.name AS partner_name, ap.slug AS partner_slug
      FROM affiliate_program_casinos apc
      JOIN affiliate_programs p ON p.id = apc.program_id
      JOIN affiliate_partners ap ON ap.id = p.partner_id
      WHERE apc.casino_id = ? AND apc.status = 'active'
      ORDER BY ap.name ASC, p.name ASC
    `)
    .bind(casinoId)
    .all();
  return result.results || [];
}
