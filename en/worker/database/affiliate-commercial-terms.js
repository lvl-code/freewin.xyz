// Affiliate Commercial Terms — versioned, historically preserved.
//
// Two things this module guarantees that the schema alone cannot
// (see migrations/0023_affiliate_partners_programs.sql for why
// SQLite can't express these as table constraints):
//
//   1. No two ACTIVE terms may share the same scope
//      (program_id, account_id, casino_id, geo_code) with overlapping
//      date ranges — see findOverlappingActiveTerm().
//   2. Resolving "what terms apply right now" for a given
//      program/account/casino/geo context always returns a single,
//      deterministic answer — see resolveApplicableTerms().
//
// SPECIFICITY HIERARCHY (business decision — do not add a manual
// priority column; this order is closed and deterministic):
//   1. Account + Casino + GEO      5. Program + Casino + GEO
//   2. Account + Casino            6. Program + Casino
//   3. Account + GEO               7. Program + GEO
//   4. Account only                8. Program only
// Implemented as a score: has(account)*100 + has(casino)*10 + has(geo)*1.
// Account-scoped always outranks program-only-scoped, regardless of
// how many other dimensions the program-only row matches.

const TERM_TYPES = ['cpa', 'revshare', 'hybrid', 'fixed_fee', 'custom'];

function specificityScore(term) {
  return (
    (term.account_id != null ? 100 : 0) +
    (term.casino_id != null ? 10 : 0) +
    (term.geo_code != null ? 1 : 0)
  );
}

function validateTermFields(term) {
  if (!TERM_TYPES.includes(term.term_type)) {
    throw new Error(`Invalid term_type: ${term.term_type}. Must be one of: ${TERM_TYPES.join(', ')}`);
  }
  if (!term.effective_date) {
    throw new Error('effective_date is required');
  }
  // Don't force every term type into the same required fields (per spec) —
  // only check that the relevant amount for the declared type is present.
  switch (term.term_type) {
    case 'cpa':
      if (term.cpa_amount == null) throw new Error('cpa_amount is required for term_type "cpa"');
      break;
    case 'revshare':
      if (term.revshare_percent == null) throw new Error('revshare_percent is required for term_type "revshare"');
      break;
    case 'hybrid':
      if (term.hybrid_cpa_amount == null && term.hybrid_revshare_percent == null) {
        throw new Error('hybrid_cpa_amount and/or hybrid_revshare_percent required for term_type "hybrid"');
      }
      break;
    case 'fixed_fee':
      if (term.fixed_fee_amount == null) throw new Error('fixed_fee_amount is required for term_type "fixed_fee"');
      break;
    case 'custom':
      if (!term.custom_terms_json) throw new Error('custom_terms_json is required for term_type "custom"');
      break;
  }
}

/**
 * Finds an existing ACTIVE term with the identical scope tuple whose
 * date range overlaps the given range. NULL dimensions are matched
 * via COALESCE-with-sentinel so "program-wide" (NULL) only collides
 * with another "program-wide" row, not with a casino-specific one.
 *
 * expiry_date = NULL means "open-ended" (still in effect); two ranges
 * overlap when each one's start is before the other's end (treating
 * a NULL end as +infinity).
 */
export async function findOverlappingActiveTerm(db, term, excludeId = null) {
  const row = await db
    .prepare(`
      SELECT * FROM affiliate_commercial_terms
      WHERE program_id = ?
        AND status = 'active'
        AND COALESCE(account_id, -1) = COALESCE(?, -1)
        AND COALESCE(casino_id, -1) = COALESCE(?, -1)
        AND COALESCE(geo_code, '') = COALESCE(?, '')
        AND (expiry_date IS NULL OR expiry_date > ?)
        AND (? IS NULL OR ? > effective_date)
        AND (? IS NULL OR id != ?)
      LIMIT 1
    `)
    .bind(
      term.program_id,
      term.account_id ?? null,
      term.casino_id ?? null,
      term.geo_code ?? null,
      term.effective_date,
      term.expiry_date ?? null, term.expiry_date ?? null,
      excludeId, excludeId
    )
    .first();

  return row || null;
}

/**
 * Creates a new commercial term. Throws (does not silently overwrite)
 * if an overlapping active term with the same scope already exists —
 * callers must explicitly supersede the old term first via
 * supersedeTerm(), making the historical transition intentional and
 * auditable rather than implicit.
 */
export async function createCommercialTerm(db, term) {
  validateTermFields(term);

  const overlap = await findOverlappingActiveTerm(db, term);
  if (overlap) {
    throw new Error(
      `An active commercial term (id ${overlap.id}) already covers this exact scope ` +
      `(program ${term.program_id}, account ${term.account_id ?? 'any'}, casino ${term.casino_id ?? 'any'}, ` +
      `geo ${term.geo_code ?? 'any'}) for an overlapping date range. Supersede it first.`
    );
  }

  const result = await db
    .prepare(`
      INSERT INTO affiliate_commercial_terms (
        program_id, account_id, casino_id, geo_code, term_type,
        cpa_amount, revshare_percent, hybrid_cpa_amount, hybrid_revshare_percent,
        fixed_fee_amount, currency, custom_terms_json,
        effective_date, expiry_date, status, notes, created_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      term.program_id,
      term.account_id ?? null,
      term.casino_id ?? null,
      term.geo_code ?? null,
      term.term_type,
      term.cpa_amount ?? null,
      term.revshare_percent ?? null,
      term.hybrid_cpa_amount ?? null,
      term.hybrid_revshare_percent ?? null,
      term.fixed_fee_amount ?? null,
      term.currency || 'USD',
      term.custom_terms_json ?? null,
      term.effective_date,
      term.expiry_date ?? null,
      term.status || 'active',
      term.notes ?? null,
      term.created_by || null
    )
    .run();

  return result.meta.last_row_id;
}

/**
 * Closes out an active term as of a given date (default: today) and
 * marks it superseded, preserving it as history rather than deleting
 * or overwriting it. Call this before creating a replacement term
 * with the same scope.
 */
export async function supersedeTerm(db, id, expiryDate = null) {
  const effectiveExpiry = expiryDate || new Date().toISOString().slice(0, 10);
  return await db
    .prepare(`
      UPDATE affiliate_commercial_terms
      SET status = 'superseded', expiry_date = ?
      WHERE id = ? AND status = 'active'
    `)
    .bind(effectiveExpiry, id)
    .run();
}

/**
 * Returns the single applicable term for a given context and date,
 * per the specificity hierarchy documented at the top of this file.
 * Returns null if nothing matches (caller should fall back to
 * whatever default/legacy behavior makes sense for that call site).
 */
export async function resolveApplicableTerm(db, { programId, accountId = null, casinoId = null, geoCode = null, onDate = null }) {
  const checkDate = onDate || new Date().toISOString().slice(0, 10);

  const result = await db
    .prepare(`
      SELECT * FROM affiliate_commercial_terms
      WHERE program_id = ?
        AND status = 'active'
        AND effective_date <= ?
        AND (expiry_date IS NULL OR expiry_date > ?)
        AND (account_id IS NULL OR account_id = ?)
        AND (casino_id IS NULL OR casino_id = ?)
        AND (geo_code IS NULL OR geo_code = ?)
    `)
    .bind(programId, checkDate, checkDate, accountId, casinoId, geoCode)
    .all();

  const candidates = result.results || [];
  if (!candidates.length) return null;

  candidates.sort((a, b) => specificityScore(b) - specificityScore(a));
  return candidates[0];
}

export async function getTermById(db, id) {
  return await db
    .prepare(`SELECT * FROM affiliate_commercial_terms WHERE id = ? LIMIT 1`)
    .bind(id)
    .first();
}

/**
 * Full history for a program (optionally narrowed to a casino and/or
 * account), most recent first — this is what answers "what were the
 * terms for casino X on date Y" when combined with a date filter by
 * the caller, or shown as-is for a plain audit trail.
 */
export async function getTermHistory(db, { programId, accountId = null, casinoId = null, limit = 100 } = {}) {
  const conditions = ['program_id = ?'];
  const params = [programId];

  if (accountId != null) {
    conditions.push('account_id = ?');
    params.push(accountId);
  }
  if (casinoId != null) {
    conditions.push('casino_id = ?');
    params.push(casinoId);
  }

  params.push(limit);

  const result = await db
    .prepare(`
      SELECT * FROM affiliate_commercial_terms
      WHERE ${conditions.join(' AND ')}
      ORDER BY effective_date DESC, id DESC
      LIMIT ?
    `)
    .bind(...params)
    .all();

  return result.results || [];
}
