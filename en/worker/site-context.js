// en/worker/site-context.js — Add this guard at the TOP of getSiteContext

export async function getSiteContext(request, env) {
  // Guard: if request is missing or has no URL, fall back to env or hostname
  if (!request || !request.url) {
    const fallbackOrigin = env?.SITE_URL || 'https://unknown.local';
    const fallbackHostname = new URL(fallbackOrigin).hostname;

    return {
      origin: fallbackOrigin,
      hostname: fallbackHostname,
      siteName: env?.SITE_NAME || fallbackHostname,
      description: '',
      logoUrl: new URL('/static/images/logo.png', fallbackOrigin).href,
      ogImageUrl: new URL('/static/images/og-image.png', fallbackOrigin).href,
      url(path = "/") {
        if (!path) return fallbackOrigin;
        if (/^https?:\/\//i.test(path)) return path;
        return new URL(path.startsWith("/") ? path : `/${path}`, fallbackOrigin).href;
      }
    };
  }

  const requestUrl = new URL(request.url);

  let hostname = requestUrl.hostname;

  if (hostname.startsWith("lummet.")) {
    hostname = hostname.slice("lummet.".length);
  }

  const origin = `${requestUrl.protocol}//${hostname}`;

  const db = env?.DB;

  let siteName = hostname;
  let description = "";
  let logoPath = "/static/images/logo.png";
  let ogImagePath = "/static/images/og-image.png";

  if (db) {
    try {
      const [
        dbSiteName,
        dbDescription,
        dbLogo,
        dbOgImage
      ] = await Promise.all([
        getSetting(db, "site_name"),
        getSetting(db, "site_description"),
        getSetting(db, "site_logo"),
        getSetting(db, "site_og_image")
      ]);

      if (dbSiteName) siteName = dbSiteName;
      if (dbDescription) description = dbDescription;
      if (dbLogo) logoPath = dbLogo;
      if (dbOgImage) ogImagePath = dbOgImage;
    } catch (error) {
      console.warn("Site context settings unavailable:", error.message);
    }
  }

  return {
    origin,
    hostname,
    siteName,
    description,
    logoUrl: new URL(logoPath, origin).href,
    ogImageUrl: new URL(ogImagePath, origin).href,
    url(path = "/") {
      if (!path) return origin;
      if (/^https?:\/\//i.test(path)) return path;
      return new URL(path.startsWith("/") ? path : `/${path}`, origin).href;
    }
  };
}
