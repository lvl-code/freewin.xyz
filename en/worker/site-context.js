// ============================================================
// TENANT SITE CONTEXT
// ============================================================

import { getSetting } from "./database/settings.js";
import { getSiteSettings } from "./site-settings.js";

export async function getSiteContext(request, env) {

  // ----------------------------------------------------------
  // Fallback when request URL is unavailable
  // ----------------------------------------------------------

  if (!request || !request.url) {
    const fallbackOrigin = env?.SITE_URL;

    if (!fallbackOrigin) {
      throw new Error(
        "SITE_URL is required when request URL is unavailable"
      );
    }

    const fallbackHostname =
      new URL(fallbackOrigin).hostname;

    const siteSettings =
      await getSiteSettings(
        env?.DB,
        fallbackOrigin
      );

    return {
      origin: fallbackOrigin,
      hostname: fallbackHostname,

      siteName:
        env?.SITE_NAME ||
        fallbackHostname,

      description: "",

      ...siteSettings,

      url(path = "/") {
        if (!path) return fallbackOrigin;

        if (/^https?:\/\//i.test(path)) {
          return path;
        }

        return new URL(
          path.startsWith("/")
            ? path
            : `/${path}`,
          fallbackOrigin
        ).href;
      }
    };
  }


  // ----------------------------------------------------------
  // Determine tenant from request hostname
  // ----------------------------------------------------------

  const requestUrl =
    new URL(request.url);

  let hostname =
    requestUrl.hostname;

  // Lummet belongs to the tenant
  if (hostname.startsWith("lummet.")) {
    hostname =
      hostname.slice("lummet.".length);
  }

  const origin =
    `${requestUrl.protocol}//${hostname}`;


  // ----------------------------------------------------------
  // Existing site identity settings
  // ----------------------------------------------------------

  const db = env?.DB;

  let siteName = hostname;
  let description = "";

  if (db) {
    try {
      const [
        dbSiteName,
        dbDescription
      ] = await Promise.all([
        getSetting(db, "site_name"),
        getSetting(db, "site_description")
      ]);

      if (dbSiteName) {
        siteName = dbSiteName;
      }

      if (dbDescription) {
        description = dbDescription;
      }

    } catch (error) {
      console.warn(
        "Site identity settings unavailable:",
        error.message
      );
    }
  }


  // ----------------------------------------------------------
  // Extended tenant settings
  // ----------------------------------------------------------

  let siteSettings;

  try {
    siteSettings =
      await getSiteSettings(
        db,
        origin
      );
  } catch (error) {
    console.warn(
      "Site settings unavailable:",
      error.message
    );

    siteSettings =
      await getSiteSettings(
        null,
        origin
      );
  }


  // ----------------------------------------------------------
  // Final tenant context
  // ----------------------------------------------------------

  return {
    origin,
    hostname,

    siteName,
    description,

    ...siteSettings,

    url(path = "/") {
      if (!path) return origin;

      if (/^https?:\/\//i.test(path)) {
        return path;
      }

      return new URL(
        path.startsWith("/")
          ? path
          : `/${path}`,
        origin
      ).href;
    }
  };
}
