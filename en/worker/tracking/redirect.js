// Tracking Link Redirect Resolution Service — the single reusable
// place that decides what /en/go/:identifier actually does.
//
// Deliberately separated from the actual HTTP Response construction
// (that stays in worker/controllers.js, Phase 5D) so this logic is
// unit-testable and so the resolution decision is never duplicated
// between the live route and any admin "test this link" tool.
//
// Resolution order (brief §6, corrected order — tracking_code first,
// THEN legacy casino.slug, never the reverse):
//   STEP 1: active tracking_link where tracking_code = identifier
//   STEP 2: if not found, casino where casino.slug = identifier
//   STEP 3: if that casino exists, legacy affiliate_url behavior
//   STEP 4: neither exists -> not_found
//
// GEO evaluation composes with the EXISTING geoEngine (worker/geo.js)
// and geo_rules table -- casino-level blocking always wins first, per
// the same precedence already established in worker/offers/selection.js.
//
// Broken-link protection: a tracking link whose health_status is
// 'broken' does not redirect through it -- but falls back to the
// casino's own legacy affiliate_url when available (a RELATED
// fallback, not the "unrelated fallback casino" the brief warns
// against), or 'unavailable' if there's nothing to fall back to.
// Other health states (warning/restricted/timeout/unknown/healthy)
// never block a redirect -- per brief §8, an automated check hitting
// a 403 must not disable a commercially important link.

import { geoEngine } from "../geo.js";
import { getGeoRule } from "../database/geo.js";
import { getTrackingLinkByCode, getGeoDestinations } from "../database/tracking-links.js";

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

function isLinkGeoEligible(link, countryCode) {
  const blocked = parseGeoList(link.blocked_geos);
  if (blocked && blocked.includes(countryCode)) return false;

  const allowed = parseGeoList(link.allowed_geos);
  if (allowed && allowed.length && !allowed.includes(countryCode)) return false;

  return true;
}

async function evaluateCasinoGeo(db, casinoSlug, countryCode) {
  if (!casinoSlug) return { status: 'allowed', bonusOverride: null, notes: 'No casino associated' };
  const geoRule = await getGeoRule(db, casinoSlug, countryCode);
  return geoEngine.evaluateAccess(
    geoRule ? [{ country: geoRule.country_code, status: geoRule.status, bonus_override: geoRule.bonus_override, notes: geoRule.notes }] : [],
    countryCode
  );
}

/**
 * The single entry point every call site should use — the live
 * redirect route AND any admin "test this link" tool.
 *
 * Returns one of:
 *   { type: 'tracking_link', trackingLink, destinationUrl, casino }
 *   { type: 'legacy_casino', casino, destinationUrl }
 *   { type: 'unavailable', reason: 'broken' | 'geo_ineligible', trackingLink, fallbackUrl }
 *   { type: 'not_found' }
 */
export async function resolveRedirectTarget(db, { identifier, countryCode }) {
  const trackingLink = await getTrackingLinkByCode(db, identifier);

  if (trackingLink && trackingLink.status === 'active') {
    const casino = trackingLink.casino_id
      ? await db.prepare(`SELECT * FROM casinos WHERE id = ?`).bind(trackingLink.casino_id).first()
      : null;

    // Casino-level GEO block always wins first, regardless of the
    // tracking link's own health or GEO configuration.
    const casinoGeo = await evaluateCasinoGeo(db, casino?.slug, countryCode);
    if (casinoGeo.status === 'blocked') {
      return { type: 'not_found' }; // matches existing behavior: a GEO-blocked casino shows nothing, not a fallback
    }

    const geoOk = isLinkGeoEligible(trackingLink, countryCode);
    const healthOk = trackingLink.health_status !== 'broken';

    if (geoOk && healthOk) {
      const geoDestinations = await getGeoDestinations(db, trackingLink.id);
      const override = geoDestinations.find(d => d.country_code === countryCode);
      const destinationUrl = override ? override.destination_url : trackingLink.destination_url;
      return { type: 'tracking_link', trackingLink, destinationUrl, casino };
    }

    // Not eligible to use THIS tracking link -- fall back to the
    // casino's own legacy URL if it has one, rather than showing
    // nothing outright (a related fallback, not an unrelated one).
    if (casino?.affiliate_url) {
      return {
        type: 'unavailable',
        reason: healthOk ? 'geo_ineligible' : 'broken',
        trackingLink,
        casino,
        fallbackUrl: casino.affiliate_url,
      };
    }
    return { type: 'unavailable', reason: healthOk ? 'geo_ineligible' : 'broken', trackingLink, casino, fallbackUrl: null };
  }

  // STEP 2/3: no active tracking link matched this identifier --
  // fall through to the legacy behavior of treating it as a casino slug.
  const casino = await db.prepare(`SELECT * FROM casinos WHERE slug = ?`).bind(identifier).first();
  if (!casino) {
    return { type: 'not_found' };
  }

  const casinoGeo = await evaluateCasinoGeo(db, casino.slug, countryCode);
  if (casinoGeo.status === 'blocked') {
    return { type: 'not_found' };
  }

  return { type: 'legacy_casino', casino, destinationUrl: casino.affiliate_url };
}
