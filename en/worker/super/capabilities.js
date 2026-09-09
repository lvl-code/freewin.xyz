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
// Version 8: added Analytics -- analytics_overview (tenant-wide
// performance-by-dimension summary), analytics_revenue (tenant-wide
// daily revenue/commission time series, single-currency only, never
// silently summed across currencies), and tracking_health (current
// status counts + which links are currently unhealthy). All three are
// pre-aggregated summaries only -- raw analytics_events, individual
// visitor data, and the full tracking_link_health_checks history are
// deliberately NOT exposed through this API. report_definitions/
// report_runs, campaigns, and alerts are NOT exposed yet -- deferred
// pending confirmation the control plane needs report/alert data (not
// just analytics numbers) through this channel.
export const SUPER_API_VERSION = 8;

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
  tracking_links: true,
  analytics: true
};

export function getCapabilities() {
  return { ...CAPABILITIES };
}
