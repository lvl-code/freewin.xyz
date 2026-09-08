// =====================================================
// SUPER API — CAPABILITY MANIFEST
// Static per-deployment description of which Super API
// resources this codebase version supports. Lummet reads
// this at handshake time to show/hide dashboard features
// per rule #16/#17 (capability + version discovery).
// =====================================================

// Version 2: added components, page_components ("blocks"),
// permissions matrix, nav_items, banners, and base64-JSON media
// upload. Existing v1 resources are unchanged — a Lummet control
// plane that only knows v1 can keep working against everything it
// already used; it just won't show the new resources until it
// checks capabilities/version again.
// Version 6: added SEO landing pages (country_custom /
// category_country) — seo_pages + seo_page_casinos.
// Version 7: added Affiliate Partner & Program Management (System 1),
// Offer & Bonus Management (System 2), and Tracking Link Management
// with GEO-aware redirect resolution and link health monitoring
// (System 3). commercial_terms is read+create only through this
// Super API (terms are versioned/immutable, no plain edit --
// superseding is a deliberate two-step action).
export const SUPER_API_VERSION = 7;

export const CAPABILITIES = {
  casinos: true,
  reviews: true,
  news: true,
  pages: true,
  categories: true,
  countries: true,
  authors: true,
  media: true,
  media_upload: true,
  settings: true,
  users: true,
  components: true,
  page_components: true,
  permissions: true,
  item_access: true,
  review_blocks: true,
  ad_rules: true,
  updates: true,
  seo_pages: true,
  nav_items: true,
  banners: true,
  affiliate_partners: true,
  affiliate_programs: true,
  affiliate_accounts: true,
  commercial_terms: true,
  offers: true,
  tracking_links: true
};

export function getCapabilities() {
  return { ...CAPABILITIES };
}
