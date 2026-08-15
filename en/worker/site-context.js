import { getSetting } from "./database/settings.js";

export async function getSiteContext(request, env) {
  const requestUrl = new URL(request.url);

  let hostname = requestUrl.hostname;

  // Lummet belongs to the parent tenant.
  // lummet.level.casino -> level.casino
  // lummet.cluster.casino -> cluster.casino
  if (hostname.startsWith("lummet.")) {
    hostname = hostname.slice("lummet.".length);
  }

  const origin =
    `${requestUrl.protocol}//${hostname}`;

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

      if (dbSiteName) {
        siteName = dbSiteName;
      }

      if (dbDescription) {
        description = dbDescription;
      }

      if (dbLogo) {
        logoPath = dbLogo;
      }

      if (dbOgImage) {
        ogImagePath = dbOgImage;
      }
    } catch (error) {
      console.warn(
        "Site context settings unavailable:",
        error.message
      );
    }
  }

  return {
    origin,
    hostname,
    siteName,
    description,

    logoUrl: new URL(
      logoPath,
      origin
    ).href,

    ogImageUrl: new URL(
      ogImagePath,
      origin
    ).href,

    url(path = "/") {
      if (!path) {
        return origin;
      }

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
