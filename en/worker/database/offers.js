// Offer & Bonus Management — CRUD, append-only versioning, and
// pre-publish validation. Mirrors the conventions in
// worker/database/casinos.js and worker/database/affiliate-commercial-terms.js.

const OFFER_TYPES = ['welcome', 'deposit', 'no_deposit', 'free_spins', 'cashback', 'reload', 'vip', 'tournament', 'custom'];
const OFFER_STATUSES = ['draft', 'scheduled', 'active', 'expired', 'disabled'];

// Explicit status state machine (brief requirement: "status transition
// is allowed" must be validated, not left implicit). 'expired' is
// terminal by design -- an expired offer is republished as a new
// offer or reactivated via 'disabled', never silently revived, so
// that offer_versions history stays an honest record of what expired
// and when.
const ALLOWED_TRANSITIONS = {
  draft: ['scheduled', 'active', 'disabled'],
  scheduled: ['active', 'disabled', 'draft'],
  active: ['expired', 'disabled'],
  disabled: ['draft', 'scheduled', 'active'],
  expired: [],
};

function parseGeoList(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Deliberately lightweight per the brief ("do not force every offer
 * type into identical required fields"). Only checks what's needed
 * to keep the record internally coherent, not commercial completeness
 * -- that's what validateForPublish() is for, applied only when an
 * offer is about to go live.
 */
function validateOfferFields(offer) {
  if (!OFFER_TYPES.includes(offer.offer_type)) {
    throw new Error(`Invalid offer_type: ${offer.offer_type}. Must be one of: ${OFFER_TYPES.join(', ')}`);
  }
  if (!offer.internal_name) {
    throw new Error('internal_name is required');
  }
  if (offer.status && !OFFER_STATUSES.includes(offer.status)) {
    throw new Error(`Invalid status: ${offer.status}. Must be one of: ${OFFER_STATUSES.join(', ')}`);
  }
  if (offer.start_date && offer.expiry_date && new Date(offer.start_date) >= new Date(offer.expiry_date)) {
    throw new Error('start_date must be before expiry_date');
  }
  const allowed = parseGeoList(offer.allowed_geos);
  const blocked = parseGeoList(offer.blocked_geos);
  if (allowed && blocked) {
    const overlap = allowed.filter(g => blocked.includes(g));
    if (overlap.length) {
      throw new Error(`GEO(s) ${overlap.join(', ')} cannot be in both allowed_geos and blocked_geos`);
    }
  }
}

export function assertValidTransition(fromStatus, toStatus) {
  if (fromStatus === toStatus) return; // no-op update, always fine
  const allowed = ALLOWED_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    throw new Error(`Cannot transition offer from "${fromStatus}" to "${toStatus}". Allowed: ${allowed.join(', ') || '(none — terminal state)'}`);
  }
}

/**
 * Pre-publish validation, run whenever an offer is transitioning INTO
 * 'active' (not on every save — a draft can be incomplete). Checks
 * the items from the brief that are actually checkable at this phase;
 * "at least one valid tracking destination exists" is deferred to
 * System 3 (tracking_links doesn't exist yet) and intentionally left
 * out rather than stubbed with a fake check.
 */
export async function validateForPublish(db, offer) {
  const casino = await db.prepare(`SELECT id, published FROM casinos WHERE id = ?`).bind(offer.casino_id).first();
  if (!casino) throw new Error('Cannot publish: casino does not exist');
  if (!casino.published) throw new Error('Cannot publish: casino is not published');

  if (offer.program_id != null) {
    const program = await db.prepare(`SELECT id, status FROM affiliate_programs WHERE id = ?`).bind(offer.program_id).first();
    if (!program) throw new Error('Cannot publish: linked affiliate program does not exist');
    if (program.status === 'archived' || program.status === 'ended') {
      throw new Error(`Cannot publish: linked affiliate program status is "${program.status}"`);
    }
  }

  if (!offer.public_headline) throw new Error('Cannot publish: public_headline is required for a live offer');

  validateOfferFields(offer);
}

export async function getOfferById(db, id) {
  return await db.prepare(`SELECT * FROM offers WHERE id = ? LIMIT 1`).bind(id).first();
}

export async function getAllOffersAdmin(db, { casinoId = null, programId = null, status = null, search = null, limit = 100, offset = 0 } = {}) {
  const conditions = [];
  const params = [];

  if (casinoId != null) { conditions.push('o.casino_id = ?'); params.push(casinoId); }
  if (programId != null) { conditions.push('o.program_id = ?'); params.push(programId); }
  if (status) { conditions.push('o.status = ?'); params.push(status); }
  if (search) { conditions.push('(o.internal_name LIKE ? OR o.public_headline LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);

  const result = await db.prepare(`
    SELECT o.*, c.name AS casino_name, c.slug AS casino_slug
    FROM offers o
    JOIN casinos c ON c.id = o.casino_id
    ${whereClause}
    ORDER BY o.updated_at DESC
    LIMIT ? OFFSET ?
  `).bind(...params).all();

  return result.results || [];
}

export async function createOffer(db, offer) {
  validateOfferFields(offer);
  if (offer.status === 'active') {
    await validateForPublish(db, offer);
  }

  const result = await db.prepare(`
    INSERT INTO offers (
      casino_id, program_id, offer_type, internal_name, public_headline, public_description,
      bonus_amount, bonus_percent, currency, free_spins_qty, min_deposit, max_bonus,
      wagering_multiplier, max_bet, eligible_games, terms_and_conditions,
      start_date, expiry_date, status, priority, allowed_geos, blocked_geos,
      created_by, updated_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    offer.casino_id,
    offer.program_id ?? null,
    offer.offer_type,
    offer.internal_name,
    offer.public_headline ?? null,
    offer.public_description ?? null,
    offer.bonus_amount ?? null,
    offer.bonus_percent ?? null,
    offer.currency ?? null,
    offer.free_spins_qty ?? null,
    offer.min_deposit ?? null,
    offer.max_bonus ?? null,
    offer.wagering_multiplier ?? null,
    offer.max_bet ?? null,
    offer.eligible_games ?? null,
    offer.terms_and_conditions ?? null,
    offer.start_date ?? null,
    offer.expiry_date ?? null,
    offer.status || 'draft',
    offer.priority ?? 0,
    offer.allowed_geos ? JSON.stringify(parseGeoList(offer.allowed_geos)) : null,
    offer.blocked_geos ? JSON.stringify(parseGeoList(offer.blocked_geos)) : null,
    offer.created_by ?? null,
    offer.created_by ?? null
  ).run();

  return result.meta.last_row_id;
}

async function getLatestVersionValidTo(db, offerId) {
  const row = await db.prepare(
    `SELECT valid_to FROM offer_versions WHERE offer_id = ? ORDER BY version_number DESC LIMIT 1`
  ).bind(offerId).first();
  return row ? row.valid_to : null;
}

async function versionCount(db, offerId) {
  const row = await db.prepare(`SELECT COUNT(*) AS c FROM offer_versions WHERE offer_id = ?`).bind(offerId).first();
  return row.c;
}

/**
 * Snapshots the CURRENT (pre-update) row into offer_versions if it's
 * ever been live -- see migration 0021's comment for the draft-only
 * exemption. Returns nothing; callers apply the actual update after.
 */
async function snapshotIfNeeded(db, existing, changedBy, changeReason) {
  const priorVersions = await versionCount(db, existing.id);
  const needsVersion = existing.status !== 'draft' || priorVersions > 0;
  if (!needsVersion) return;

  const nextVersionNumber = priorVersions + 1;
  const priorValidTo = nextVersionNumber > 1 ? await getLatestVersionValidTo(db, existing.id) : null;
  const validFrom = priorValidTo || existing.updated_at || existing.created_at;
  const now = new Date().toISOString();

  await db.prepare(`
    INSERT INTO offer_versions (offer_id, version_number, snapshot_json, changed_by, change_reason, valid_from, valid_to)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(existing.id, nextVersionNumber, JSON.stringify(existing), changedBy ?? null, changeReason ?? null, validFrom, now).run();
}

export async function updateOffer(db, id, updates, { changedBy = null, changeReason = null } = {}) {
  const existing = await getOfferById(db, id);
  if (!existing) throw new Error('Offer not found');

  const merged = { ...existing, ...updates };
  validateOfferFields(merged);

  if (updates.status && updates.status !== existing.status) {
    assertValidTransition(existing.status, updates.status);
  }
  if (merged.status === 'active') {
    await validateForPublish(db, merged);
  }

  await snapshotIfNeeded(db, existing, changedBy, changeReason);

  await db.prepare(`
    UPDATE offers SET
      program_id = ?, offer_type = ?, internal_name = ?, public_headline = ?, public_description = ?,
      bonus_amount = ?, bonus_percent = ?, currency = ?, free_spins_qty = ?, min_deposit = ?, max_bonus = ?,
      wagering_multiplier = ?, max_bet = ?, eligible_games = ?, terms_and_conditions = ?,
      start_date = ?, expiry_date = ?, status = ?, priority = ?, allowed_geos = ?, blocked_geos = ?,
      updated_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    merged.program_id ?? null,
    merged.offer_type,
    merged.internal_name,
    merged.public_headline ?? null,
    merged.public_description ?? null,
    merged.bonus_amount ?? null,
    merged.bonus_percent ?? null,
    merged.currency ?? null,
    merged.free_spins_qty ?? null,
    merged.min_deposit ?? null,
    merged.max_bonus ?? null,
    merged.wagering_multiplier ?? null,
    merged.max_bet ?? null,
    merged.eligible_games ?? null,
    merged.terms_and_conditions ?? null,
    merged.start_date ?? null,
    merged.expiry_date ?? null,
    merged.status,
    merged.priority ?? 0,
    merged.allowed_geos ? JSON.stringify(parseGeoList(merged.allowed_geos)) : null,
    merged.blocked_geos ? JSON.stringify(parseGeoList(merged.blocked_geos)) : null,
    changedBy ?? existing.updated_by,
    id
  ).run();
}

export async function transitionOfferStatus(db, id, newStatus, { changedBy = null, changeReason = null } = {}) {
  return await updateOffer(db, id, { status: newStatus }, { changedBy, changeReason });
}

export async function getOfferVersionHistory(db, offerId) {
  const result = await db.prepare(
    `SELECT * FROM offer_versions WHERE offer_id = ? ORDER BY version_number DESC`
  ).bind(offerId).all();
  return result.results || [];
}

/**
 * Answers "what did this offer look like on date X" by checking
 * offer_versions first (historical snapshots), falling back to the
 * live row if the date falls in the still-current window, and
 * returning null if the date predates the offer's own history.
 */
export async function getOfferAsOfDate(db, offerId, atDate) {
  const version = await db.prepare(`
    SELECT * FROM offer_versions
    WHERE offer_id = ? AND valid_from <= ? AND (valid_to IS NULL OR valid_to > ?)
  `).bind(offerId, atDate, atDate).first();

  if (version) {
    return { ...JSON.parse(version.snapshot_json), _asOf: 'historical_version', _versionNumber: version.version_number };
  }

  const current = await getOfferById(db, offerId);
  if (!current) return null;

  const latestBoundary = await getLatestVersionValidTo(db, offerId) || current.created_at;
  if (new Date(atDate) >= new Date(latestBoundary)) {
    return { ...current, _asOf: 'current' };
  }

  return null; // the date predates this offer's existence
}

/**
 * Dependent-record check used before allowing a casino to be
 * hard-deleted (migration 0021 deliberately does NOT cascade offers
 * away when their casino is deleted -- see that file's comments).
 */
/**
 * Dependent-record check used before allowing a program to be
 * hard-deleted (affiliate-programs.js's own getProgramDependents()
 * predates this system and doesn't know about offers -- this fills
 * that gap the same way getCasinoOfferDependents() does for casinos).
 */
export async function getProgramOfferDependents(db, programId) {
  const row = await db.prepare(`SELECT COUNT(*) AS c FROM offers WHERE program_id = ?`).bind(programId).first();
  return row.c > 0 ? { offers: row.c } : null;
}

export async function getCasinoOfferDependents(db, casinoId) {
  const row = await db.prepare(`SELECT COUNT(*) AS c FROM offers WHERE casino_id = ?`).bind(casinoId).first();
  return row.c > 0 ? { offers: row.c } : null;
}
