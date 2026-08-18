// =====================================================
// KV CACHE UTILITY
// Wraps Cloudflare KV with TTL + JSON serialization
// =====================================================

const DEFAULT_TTL = 300;       // 5 minutes
const LONG_TTL = 600;           // 10 minutes

/**
 * Get a cached JSON value, or null if miss/expired
 */
export async function getCached(env, key) {
  if (!env.CACHE) return null;
  try {
    const raw = await env.CACHE.get(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Store a JSON value in KV with TTL
 */
export async function setCached(env, key, value, ttl = DEFAULT_TTL) {
  if (!env.CACHE) return;
  try {
    await env.CACHE.put(key, JSON.stringify(value), { expirationTtl: ttl });
  } catch (e) {
    console.error("KV put failed:", e.message);
  }
}

/**
 * Delete one or more cached keys
 */
export async function invalidate(env, keys) {
  if (!env.CACHE) return;
  const keyArray = Array.isArray(keys) ? keys : [keys];
  await Promise.all(
    keyArray.map(k => env.CACHE.delete(k).catch(() => {}))
  );
}

// =====================================================
// CACHE KEYS — Centralized to avoid typos
// =====================================================

export const CACHE_KEYS = {
  // Public sidebar / homepage data
  PUBLIC_CASINOS:    "public:casinos:all",
  PUBLIC_GEO_RULES:  "public:geo_rules:all",
  PUBLIC_NEWS:       "public:news:latest",
  PUBLIC_COUNTRIES:  "public:countries:all",
  PUBLIC_CATEGORIES: "public:categories:all",

  SITE_SETTINGS: (hostname) =>
  `site-settings:${String(hostname || "").toLowerCase()}`,

  // Navigation (per location)
  NAV: (location) => `nav:${location}`,

  // All nav locations for bulk invalidation
  NAV_ALL_LOCATIONS: ["nav:header", "nav:footer_casinos", "nav:footer_company", "nav:footer_support", "nav:footer_legal", "nav:mobile"],
 // NAV_ALL_LOCATIONS: ["nav:header", "nav:footer_casinos", "nav:footer_company", "nav:footer_support", "nav:footer_legal"],
};

// =====================================================
// INVALIDATION HELPERS — Call after admin mutations
// =====================================================

export async function invalidateCasinos(env) {
  await invalidate(env, [CACHE_KEYS.PUBLIC_CASINOS, CACHE_KEYS.PUBLIC_GEO_RULES]);
}

export async function invalidateNews(env) {
  await invalidate(env, [CACHE_KEYS.PUBLIC_NEWS]);
}

export async function invalidateCountries(env) {
  await invalidate(env, [CACHE_KEYS.PUBLIC_COUNTRIES]);
}

export async function invalidateCategories(env) {
  await invalidate(env, [CACHE_KEYS.PUBLIC_CATEGORIES]);
}

export async function invalidateNav(env) {
  await invalidate(env, CACHE_KEYS.NAV_ALL_LOCATIONS);
}


export async function deleteCached(
  env,
  key
) {
  const cache =
    env?.CACHE;

  if (!cache) {
    return false;
  }

  await cache.delete(key);

  return true;
}
