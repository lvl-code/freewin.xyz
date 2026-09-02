import { getCasinoCategories } from "./casinos.js";

// =====================================================
// RELATED CASINO ENGINE — database/scoring layer
// =====================================================
// Rendering ({{related_casinos}}) is a later phase — this module
// only selects and ranks candidates. Conceptually mirrors the
// pattern of getRelatedNews() in database/news.js (exclude
// current item, score, sort, limit) but adapted to the casino
// data model actually present in this repo: casinos.features
// (JSON text array), casino_categories (join table), and
// geo_rules (per-country allow/block).
//
// ── Deterministic ranking algorithm (documented per spec) ────
//
// 1. Build a bounded candidate "seed pool" via two targeted D1
//    queries — never the full casinos table (Part 26):
//      a) casinos sharing at least one category with the current
//         casino (JOIN on casino_categories)
//      b) casinos whose `features` JSON text contains at least
//         one of the current casino's features (LIKE-based text
//         match — the same technique already used by
//         getCasinosByCountry()'s supported_countries LIKE ?
//         checks elsewhere in this codebase, since `features` has
//         no normalized join table to query directly)
//    Both queries already exclude the current casino and filter
//    to published/status='published' — the platform's existing
//    "is this casino available at all" convention, reused
//    verbatim from casinos.js.
//
// 2. Score every seed-pool candidate:
//       score = (shared_categories * 40)
//             + (shared_features   * 15)
//             + quality_tiebreak
//    quality_tiebreak = rating + (featured ? 0.5 : 0) — deliberately
//    small (well under one unit of either weight above) so it can
//    only break exact ties, never override a real category/feature
//    difference.
//
// 3. GEO eligibility is applied as a PRE-FILTER, not a score term
//    (Part 24's pipeline lists "apply GEO eligibility" as its own
//    step, before scoring) — only candidates whose evaluated GEO
//    status for the visitor's country is "allowed" survive. GEO
//    status is computed with the exact same default as the
//    existing casino card renderer's prepareGeoData() in
//    controllers.js: no geo_rules at all for a casino → "blocked"
//    everywhere. This is the opposite default used for PageNav
//    (Phase 2), and that is intentional — Part 22 requires reusing
//    each existing GEO model as-is, not unifying them into a third,
//    invented one.
//
// 4. If fewer than `limit` category/feature-matched + GEO-eligible
//    candidates exist, a fallback tier fills the remainder from a
//    small, bounded, quality-ordered pool (featured DESC, sort_order
//    ASC, rating DESC — the platform's existing tie-breaker
//    convention), still filtered to GEO-eligible only.
//
// 5. Deliberately NOT implemented: a further fallback to
//    GEO-*ineligible* casinos. Recommending a casino the visitor's
//    own country cannot access was judged a worse experience than
//    returning fewer than `limit` results (or none) — the
//    {{related_casinos}} template (a later phase) is expected to
//    guard on an empty result exactly like {{related_news_html}}
//    already does today.
// =====================================================

const SCORE_WEIGHTS = {
  category: 40,
  feature: 15
};

/**
 * Casinos sharing at least one category with the current casino.
 * Bounded by the JOIN, not a full-table scan.
 */
export async function getCategoryMatchedCandidates(db, currentCasinoId, categoryIds) {
  if (!categoryIds || categoryIds.length === 0) return [];

  const placeholders = categoryIds.map(() => "?").join(",");
  const result = await db.prepare(`
    SELECT DISTINCT c.*
    FROM casinos c
    JOIN casino_categories cc ON cc.casino_id = c.id
    WHERE cc.category_id IN (${placeholders})
      AND c.id != ?
      AND c.published = 1 AND c.status = 'published'
  `).bind(...categoryIds, currentCasinoId).all();

  return result.results || [];
}

/**
 * Casinos whose `features` JSON text contains at least one of the
 * given features. Uses the same LIKE-on-JSON-text technique as
 * getCasinosByCountry() elsewhere in casinos.js, since `features`
 * has no normalized join table.
 */
export async function getFeatureMatchedCandidates(db, currentCasinoId, features) {
  if (!features || features.length === 0) return [];

  const conditions = features.map(() => "c.features LIKE ?").join(" OR ");
  const bindings = features.map(f => `%"${f}"%`);

  const result = await db.prepare(`
    SELECT DISTINCT c.* FROM casinos c
    WHERE (${conditions})
      AND c.id != ?
      AND c.published = 1 AND c.status = 'published'
  `).bind(...bindings, currentCasinoId).all();

  return result.results || [];
}

/**
 * Batched category-id lookup for a whole candidate pool at once
 * (no N+1 — Part 26).
 */
export async function getCategoryIdsForCasinos(db, casinoIds) {
  if (!casinoIds || casinoIds.length === 0) return {};

  const placeholders = casinoIds.map(() => "?").join(",");
  const result = await db.prepare(`
    SELECT casino_id, category_id FROM casino_categories
    WHERE casino_id IN (${placeholders})
  `).bind(...casinoIds).all();

  const map = {};
  for (const row of (result.results || [])) {
    if (!map[row.casino_id]) map[row.casino_id] = [];
    map[row.casino_id].push(row.category_id);
  }
  return map;
}

/**
 * A small, bounded, quality-ordered fallback pool — never the full
 * casinos table. Used only to fill remaining slots when the
 * category/feature-matched pool is too small.
 */
export async function getQualityFallbackCandidates(db, currentCasinoId, excludeIds, limit) {
  const excludeList = [currentCasinoId, ...excludeIds];
  const placeholders = excludeList.map(() => "?").join(",");

  const result = await db.prepare(`
    SELECT * FROM casinos
    WHERE id NOT IN (${placeholders})
      AND published = 1 AND status = 'published'
    ORDER BY featured DESC, sort_order ASC, rating DESC
    LIMIT ?
  `).bind(...excludeList, limit).all();

  return result.results || [];
}

/**
 * GEO eligibility for a batch of casino slugs, for one visitor
 * country. Mirrors prepareGeoData() in controllers.js EXACTLY
 * (same "no rules → blocked everywhere" default) — kept as a
 * separate implementation here (rather than importing it) because
 * prepareGeoData is a private, unexported function scoped to
 * controllers.js's own request handling. If that logic is ever
 * changed, this must be updated to match — see Part 22.
 */
export async function getCasinoGeoStatuses(db, slugs, countryCode) {
  if (!slugs || slugs.length === 0) return {};

  if (!countryCode) {
    // No GEO context at all — treat everyone as ineligible rather
    // than guessing. Matches the existing blocked-by-default
    // posture rather than inventing a permissive fallback.
    const none = {};
    for (const slug of slugs) none[slug] = "blocked";
    return none;
  }

  const placeholders = slugs.map(() => "?").join(",");
  const result = await db.prepare(`
    SELECT casino_slug, country_code, status FROM geo_rules
    WHERE casino_slug IN (${placeholders})
  `).bind(...slugs).all();

  const rulesBySlug = {};
  for (const row of (result.results || [])) {
    if (!rulesBySlug[row.casino_slug]) rulesBySlug[row.casino_slug] = [];
    rulesBySlug[row.casino_slug].push(row);
  }

  const statuses = {};
  for (const slug of slugs) {
    const rules = rulesBySlug[slug] || [];

    if (rules.length === 0) {
      statuses[slug] = "blocked";
      continue;
    }

    const countryRule = rules.find(r => r.country_code === countryCode);
    if (countryRule) {
      statuses[slug] = countryRule.status;
      continue;
    }

    const hasAllowed = rules.some(r => r.status === "allowed");
    const hasBlocked = rules.some(r => r.status === "blocked");

    if (hasAllowed && !hasBlocked) statuses[slug] = "blocked";       // allowlist mode
    else if (hasBlocked && !hasAllowed) statuses[slug] = "allowed";  // blocklist mode
    else statuses[slug] = "blocked";                                  // mixed → safe default
  }

  return statuses;
}

/**
 * Pure scoring function — no DB access. Takes already-fetched
 * candidates plus batched lookups and returns them annotated with
 * a numeric _relatedScore (higher = more related).
 */
export function scoreRelatedCasinoCandidates(candidates, currentCategoryIds, currentFeatures, categoryIdsByCasinoId) {
  const currentCategorySet = new Set(currentCategoryIds || []);
  const currentFeatureSet = new Set((currentFeatures || []).map(f => String(f).toLowerCase()));

  return candidates.map(candidate => {
    const candidateCategoryIds = categoryIdsByCasinoId[candidate.id] || [];
    const sharedCategories = candidateCategoryIds.filter(id => currentCategorySet.has(id)).length;

    let candidateFeatures = [];
    try {
      candidateFeatures = JSON.parse(candidate.features || "[]");
    } catch {
      candidateFeatures = [];
    }
    const sharedFeatures = candidateFeatures.filter(
      f => currentFeatureSet.has(String(f).toLowerCase())
    ).length;

    const qualityTiebreak = (candidate.rating || 0) + (candidate.featured ? 0.5 : 0);

    const score =
      sharedCategories * SCORE_WEIGHTS.category +
      sharedFeatures * SCORE_WEIGHTS.feature +
      qualityTiebreak;

    return {
      ...candidate,
      _relatedScore: score,
      _sharedCategories: sharedCategories,
      _sharedFeatures: sharedFeatures
    };
  });
}

/**
 * Top-level entry point: given the current casino row (must
 * include at least `id`, `slug`, `features`) and the visitor's
 * detected country code, return up to `limit` related, GEO-
 * eligible, available casinos, ranked by relevance.
 *
 * Internal scoring fields (_relatedScore etc.) are attached for
 * debugging/testing but are not meant to be exposed to end users
 * (Part 24: "do not expose internal scoring numbers to users") —
 * the rendering layer (a later phase) should not display them.
 */
export async function getRelatedCasinos(db, currentCasino, countryCode, limit = 6) {
  if (!currentCasino || !currentCasino.id) return [];

  let currentFeatures = [];
  try {
    currentFeatures = JSON.parse(currentCasino.features || "[]");
  } catch {
    currentFeatures = [];
  }

  const currentCategoryIds = await getCasinoCategories(db, currentCasino.id);

  const [categoryPool, featurePool] = await Promise.all([
    getCategoryMatchedCandidates(db, currentCasino.id, currentCategoryIds),
    getFeatureMatchedCandidates(db, currentCasino.id, currentFeatures)
  ]);

  const seedPoolById = new Map();
  for (const candidate of [...categoryPool, ...featurePool]) {
    seedPoolById.set(candidate.id, candidate);
  }
  const seedPool = Array.from(seedPoolById.values());

  const seedPoolIds = seedPool.map(c => c.id);
  const categoryIdsByCasinoId = await getCategoryIdsForCasinos(db, seedPoolIds);

  const scoredPool = scoreRelatedCasinoCandidates(
    seedPool,
    currentCategoryIds,
    currentFeatures,
    categoryIdsByCasinoId
  );

  const seedSlugs = scoredPool.map(c => c.slug);
  const geoStatuses = await getCasinoGeoStatuses(db, seedSlugs, countryCode);

  const geoEligible = scoredPool
    .filter(c => geoStatuses[c.slug] === "allowed")
    .sort((a, b) => b._relatedScore - a._relatedScore);

  const results = [];
  const usedIds = new Set();

  for (const candidate of geoEligible) {
    if (results.length >= limit) break;
    results.push(candidate);
    usedIds.add(candidate.id);
  }

  // Fallback tier — GEO-eligible, quality-ranked, no category/
  // feature overlap required. Only runs if the matched pool above
  // wasn't enough to fill `limit`.
  if (results.length < limit) {
    const need = limit - results.length;
    const fallbackPool = await getQualityFallbackCandidates(
      db,
      currentCasino.id,
      [...usedIds],
      need * 3 // small multiplier so GEO filtering below still has enough to choose from
    );

    const fallbackSlugs = fallbackPool.map(c => c.slug);
    const fallbackGeoStatuses = await getCasinoGeoStatuses(db, fallbackSlugs, countryCode);

    for (const candidate of fallbackPool) {
      if (results.length >= limit) break;
      if (usedIds.has(candidate.id)) continue;
      if (fallbackGeoStatuses[candidate.slug] !== "allowed") continue;
      results.push(candidate);
      usedIds.add(candidate.id);
    }
  }

  return results.slice(0, limit);
}
