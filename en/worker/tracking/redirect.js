// Tracking Link Redirect Resolution Service — the single reusable
// place that decides what /en/go/:identifier actually does.
//
// Deliberately separated from the actual HTTP Response construction
// (that stays in worker/controllers.js, Phase 5D) so this logic is
// unit-testable and so the resolution decision is never duplicated
// between the live route and any admin "test this link" tool.
//
// Resolution order:
//   STEP 1: active tracking_link where tracking_code = identifier
//           (a direct, opaque campaign-code URL -- unchanged)
//   STEP 2: if not found, casino where casino.slug = identifier.
//           If that casino has any active tracking links of its own,
//           pick the best GEO-eligible one for this visitor (by
//           priority) and use IT -- this is what makes a friendly
//           URL like /en/go/pinup GEO-aware without needing a
//           tracking_code literally named "pinup" (which the
//           collision guard in tracking-links.js deliberately
//           forbids -- see createTrackingLink()). Only when the
//           casino has no eligible tracking link at all do we fall
//           through to its plain legacy affiliate_url.
//   STEP 3: neither a tracking code nor a casino slug matches -> not_found
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
// a 403 must not disable a commercially important link. In practice,
// most real affiliate click-trackers respond 403 to a plain
// server-side health-check request even when the link works
// perfectly for real browser traffic -- that's exactly why 403 maps
// to 'restricted', not 'broken' (see worker/tracking/health-check.js).
//
// Safety: a destination that resolves to an empty/missing URL is
// always treated as 'not_found' rather than attempted as a redirect
// -- Response.redirect("") throws, which previously surfaced as a
// raw 500 to visitors instead of a clean 404.

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
 * Resolves the actual destination URL for a specific tracking link +
 * country, applying any GEO-specific override. Shared by both the
 * direct tracking_code path and the casino-slug-fallback path below
 * so the two never diverge on how a GEO override is applied.
 */
async function resolveLinkDestination(db, link, countryCode) {
  const geoDestinations = await getGeoDestinations(db, link.id);
  const override = geoDestinations.find(d => d.country_code === countryCode);
  return override ? override.destination_url : link.destination_url;
}

/**
 * Picks the best active, GEO-eligible, non-broken tracking link
 * belonging to a specific casino, for a specific visitor country --
 * same "most specific / highest priority wins" spirit as
 * worker/offers/selection.js, applied to tracking_links instead of
 * offers. Returns null if the casino has no eligible link right now
 * (including "no tracking links configured at all", the common case
 * for any casino not yet migrated onto this system).
 */
async function pickBestTrackingLinkForCasino(db, casinoId, countryCode) {
  const result = await db.prepare(`
    SELECT * FROM tracking_links
    WHERE casino_id = ? AND status = 'active'
    ORDER BY priority DESC, id ASC
  `).bind(casinoId).all();

  const candidates = result.results || [];
  for (const link of candidates) {
    if (link.health_status === 'broken') continue;
    if (!isLinkGeoEligible(link, countryCode)) continue;
    return link;
  }
  return null;
}

function isUsableUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * The single entry point every call site should use — the live
 * redirect route AND any admin "test this link" tool.
 *
 * Returns one of:
 *   { type: 'tracking_link', trackingLink, destinationUrl, casino }
 *   { type: 'legacy_casino', casino, destinationUrl }
 *   { type: 'unavailable', reason: 'broken' | 'geo_ineligible', trackingLink, casino, fallbackUrl }
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
      const destinationUrl = await resolveLinkDestination(db, trackingLink, countryCode);
      if (isUsableUrl(destinationUrl)) {
        return { type: 'tracking_link', trackingLink, destinationUrl, casino };
      }
      // This specific tracking link is misconfigured (empty/invalid
      // destination) -- fall through to the same "not eligible" path
      // below rather than ever attempting Response.redirect("").
    }

    // Not eligible to use THIS tracking link -- fall back to the
    // casino's own legacy URL if it has one, rather than showing
    // nothing outright (a related fallback, not an unrelated one).
    const fallbackUrl = casino?.affiliate_url;
    return {
      type: 'unavailable',
      reason: healthOk ? 'geo_ineligible' : 'broken',
      trackingLink,
      casino,
      fallbackUrl: isUsableUrl(fallbackUrl) ? fallbackUrl : null,
    };
  }

  // STEP 2: no active tracking link matched this identifier by code --
  // try it as a casino slug instead.
  const casino = await db.prepare(`SELECT * FROM casinos WHERE slug = ?`).bind(identifier).first();
  if (!casino) {
    return { type: 'not_found' };
  }

  const casinoGeo = await evaluateCasinoGeo(db, casino.slug, countryCode);
  if (casinoGeo.status === 'blocked') {
    return { type: 'not_found' };
  }

  // This casino may have its own tracking links even though the
  // identifier used was its plain slug, not one of their codes --
  // route through the best GEO-eligible one for this visitor before
  // ever falling back to the flat legacy affiliate_url. This is what
  // makes /en/go/<casino-slug> GEO-aware.
  const bestLink = await pickBestTrackingLinkForCasino(db, casino.id, countryCode);
  if (bestLink) {
    const destinationUrl = await resolveLinkDestination(db, bestLink, countryCode);
    if (isUsableUrl(destinationUrl)) {
      return { type: 'tracking_link', trackingLink: bestLink, destinationUrl, casino };
    }
  }

  if (!isUsableUrl(casino.affiliate_url)) {
    // No eligible tracking link AND no usable legacy URL -- there is
    // genuinely nothing to redirect to. Treat as not_found instead of
    // ever calling Response.redirect("") and throwing a 500.
    return { type: 'not_found' };
  }

  return { type: 'legacy_casino', casino, destinationUrl: casino.affiliate_url };
}
