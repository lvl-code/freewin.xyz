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
// Version 5: added platform updates (changelog/announcements) CRUD.
export const SUPER_API_VERSION = 5;

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
  nav_items: true,
  banners: true
};

export function getCapabilities() {
  return { ...CAPABILITIES };
}
