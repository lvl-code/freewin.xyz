export async function getSiteContext(request, env) {
  const requestUrl = new URL(request.url);

  let origin = requestUrl.origin;
  let hostname = requestUrl.hostname;

  // Lummet runs as a subdomain of the tenant.
  // Site identity should always represent the parent/main site.
  if (hostname.startsWith("lummet.")) {
    hostname = hostname.slice("lummet.".length);
    origin = `${requestUrl.protocol}//${hostname}`;
  }

  let siteName = hostname;
  let siteDescription = "";
  let logoPath = "/static/images/logo.png";
  let ogImagePath = "/static/images/og-image.png";

  const db = env?.DB;

  if (db) {
    try {
      const result = await db
        .prepare(`
          SELECT key, value
          FROM settings
          WHERE key IN (
            'site_name',
            'site_description',
            'site_logo',
            'site_og_image'
          )
        `)
        .all();

      for (const row of result.results || []) {
        if (row.key === "site_name" && row.value) {
          siteName = row.value;
        }

        if (row.key === "site_description" && row.value) {
          siteDescription = row.value;
        }

        if (row.key === "site_logo" && row.value) {
          logoPath = row.value;
        }

        if (row.key === "site_og_image" && row.value) {
          ogImagePath = row.value;
        }
      }
    } catch (_) {
      // Settings table may not exist yet.
      // Hostname remains the safe fallback.
    }
  }

  return {
    origin,
    hostname,
    siteName,
    description: siteDescription,
    logoUrl: new URL(logoPath, origin).href,
    ogImageUrl: new URL(ogImagePath, origin).href,

    url(path = "/") {
      if (!path) return origin;

      if (/^https?:\/\//i.test(path)) {
        return path;
      }

      return new URL(
        path.startsWith("/") ? path : `/${path}`,
        origin
      ).href;
    }
  };
}
