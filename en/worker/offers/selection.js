// Offer Selection Service — the single reusable place that decides
// "what bonus does this visitor see for this casino right now."
//
// Per the brief: this logic must NOT be duplicated inside page
// templates, controllers, or the redirect route -- everything that
// needs an offer calls resolveOfferForCasino() from here.
//
// Resolution flow (matches the brief's diagram exactly):
//   Visitor Context -> Casino -> Eligibility -> GEO Rules ->
//   Offer Status -> Offer Priority -> Active Offer
//
// Fallback chain when no offer is eligible (see migration 0021's
// header comment for why this order, not a new one invented here):
//   1. An active, GEO-eligible Offer for this casino
//   2. geo_rules.bonus_override for the visitor's country (pre-existing)
//   3. casinos.bonus_title / casinos.bonus_value (pre-existing, legacy)
// This service returns null for "no offer" at rung 1 so the caller
// (which already has the casino row and calls getGeoRule itself, per
// the existing controllers.js pattern) can apply rungs 2 and 3
// without this service needing to know about legacy casino fields.
//
// GEO composition: casino-level blocking (geo_rules.status === 'blocked')
// always wins first and is checked via the EXISTING geoEngine, not a
// parallel system. Offer-level allowed_geos/blocked_geos are then
// applied as an additional filter on top -- an offer can never appear
// somewhere the casino itself is blocked, but a casino being allowed
// doesn't mean every offer applies everywhere.

import { geoEngine } from "../geo.js";
import { getGeoRule } from "../database/geo.js";
import { getCasinoIdBySlug } from "../database/casinos.js";

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

function isOfferGeoEligible(offer, countryCode) {
  const blocked = parseGeoList(offer.blocked_geos);
  if (blocked && blocked.includes(countryCode)) return false;

  const allowed = parseGeoList(offer.allowed_geos);
  if (allowed && allowed.length && !allowed.includes(countryCode)) return false;

  return true;
}

function isOfferDateEligible(offer, now) {
  if (offer.start_date && new Date(offer.start_date) > now) return false;
  if (offer.expiry_date && new Date(offer.expiry_date) <= now) return false;
  return true;
}

/**
 * Fetches every 'active' offer for a casino, already ordered by
 * priority so the caller doesn't need to re-sort. Separated from
 * resolveOfferForCasino() so admin tooling (e.g. an eligibility
 * preview screen) can list ALL candidates, not just the winner.
 */
export async function getCandidateOffers(db, casinoId) {
  const result = await db.prepare(`
    SELECT * FROM offers
    WHERE casino_id = ? AND status = 'active'
    ORDER BY priority DESC, id ASC
  `).bind(casinoId).all();
  return result.results || [];
}

/**
 * The single entry point every call site should use. Returns:
 *   { offer, geoBlocked: false }                — an eligible offer won
 *   { offer: null, geoBlocked: true }            — casino itself is GEO-blocked; caller should show nothing, not fall back
 *   { offer: null, geoBlocked: false, geoRule }  — casino allowed, but no offer qualifies; caller applies the legacy fallback chain using geoRule.bonus_override
 *
 * casinoRef: { casinoId } or { casinoSlug } -- either works.
 */
export async function resolveOfferForCasino(db, { casinoId = null, casinoSlug = null, countryCode, now = new Date() } = {}) {
  if (!casinoId && !casinoSlug) {
    throw new Error('resolveOfferForCasino requires casinoId or casinoSlug');
  }
  if (!casinoId) {
    casinoId = await getCasinoIdBySlug(db, casinoSlug);
  }
  if (!casinoId) {
    return { offer: null, geoBlocked: false, geoRule: null };
  }

  // Casino-level GEO check FIRST, via the existing geo_rules table --
  // this always wins, per the brief ("do not automatically expose...
  // GEO-ineligible offers") and the migration's documented precedence.
  const slugForGeo = casinoSlug || (await db.prepare(`SELECT slug FROM casinos WHERE id = ?`).bind(casinoId).first())?.slug;
  const geoRule = slugForGeo ? await getGeoRule(db, slugForGeo, countryCode) : null;
  const geoAccess = geoEngine.evaluateAccess(geoRule ? [{ country: geoRule.country_code, status: geoRule.status, bonus_override: geoRule.bonus_override, notes: geoRule.notes }] : [], countryCode);

  if (geoAccess.status === 'blocked') {
    return { offer: null, geoBlocked: true, geoRule };
  }

  const candidates = await getCandidateOffers(db, casinoId);
  const eligible = candidates.filter(o => isOfferDateEligible(o, now) && isOfferGeoEligible(o, countryCode));

  if (eligible.length) {
    return { offer: eligible[0], geoBlocked: false, geoRule };
  }

  return { offer: null, geoBlocked: false, geoRule };
}
