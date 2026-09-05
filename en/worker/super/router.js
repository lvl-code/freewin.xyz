// =====================================================
// SUPER API — ROUTER
// Explicit allowlist for /en/api/super/*. Every route is
// enumerated; there is no wildcard passthrough and no
// arbitrary-SQL endpoint (rule #25).
// =====================================================

import { verifySuperApiRequest, logSuperApiRequest } from "./auth.js";
import * as h from "./handlers.js";

// Each entry: [METHOD, path-pattern, handler, resource-name]
// Path patterns use ":param" for a single dynamic segment.
const ROUTES = [
  ["GET", "/en/api/super/handshake", h.handleHandshake, null],
  ["GET", "/en/api/super/health", h.handleHealth, null],
  ["GET", "/en/api/super/capabilities", h.handleCapabilities, null],

  ["GET", "/en/api/super/casinos", h.handleListCasinos, "casinos"],
  ["GET", "/en/api/super/casinos/:id", h.handleGetCasino, "casinos"],
  ["POST", "/en/api/super/casinos", h.handleCreateCasino, "casinos"],
  ["PUT", "/en/api/super/casinos/:id", h.handleUpdateCasino, "casinos"],
  ["DELETE", "/en/api/super/casinos/:id", h.handleDeleteCasino, "casinos"],

  ["GET", "/en/api/super/reviews", h.handleListReviews, "reviews"],
  ["GET", "/en/api/super/reviews/:id", h.handleGetReview, "reviews"],
  ["POST", "/en/api/super/reviews", h.handleCreateReview, "reviews"],
  ["PUT", "/en/api/super/reviews/:id", h.handleUpdateReview, "reviews"],
  ["DELETE", "/en/api/super/reviews/:id", h.handleDeleteReview, "reviews"],

  ["GET", "/en/api/super/news", h.handleListNews, "news"],
  ["GET", "/en/api/super/news/:id", h.handleGetNews, "news"],
  ["POST", "/en/api/super/news", h.handleCreateNews, "news"],
  ["PUT", "/en/api/super/news/:id", h.handleUpdateNews, "news"],
  ["DELETE", "/en/api/super/news/:id", h.handleDeleteNews, "news"],

  ["GET", "/en/api/super/pages", h.handleListPages, "pages"],
  ["GET", "/en/api/super/pages/:id", h.handleGetPage, "pages"],
  ["POST", "/en/api/super/pages", h.handleCreatePage, "pages"],
  ["PUT", "/en/api/super/pages/:id", h.handleUpdatePage, "pages"],
  ["DELETE", "/en/api/super/pages/:id", h.handleDeletePage, "pages"],

  ["GET", "/en/api/super/categories", h.handleListCategories, "categories"],
  ["GET", "/en/api/super/categories/:id", h.handleGetCategory, "categories"],
  ["POST", "/en/api/super/categories", h.handleCreateCategory, "categories"],
  ["PUT", "/en/api/super/categories/:id", h.handleUpdateCategory, "categories"],
  ["DELETE", "/en/api/super/categories/:id", h.handleDeleteCategory, "categories"],

  ["GET", "/en/api/super/countries", h.handleListCountries, "countries"],
  ["GET", "/en/api/super/countries/:id", h.handleGetCountry, "countries"],
  ["POST", "/en/api/super/countries", h.handleCreateCountry, "countries"],
  ["PUT", "/en/api/super/countries/:id", h.handleUpdateCountry, "countries"],
  ["DELETE", "/en/api/super/countries/:id", h.handleDeleteCountry, "countries"],

  ["GET", "/en/api/super/authors", h.handleListAuthors, "authors"],
  ["GET", "/en/api/super/authors/:id", h.handleGetAuthor, "authors"],
  ["POST", "/en/api/super/authors", h.handleCreateAuthor, "authors"],
  ["PUT", "/en/api/super/authors/:id", h.handleUpdateAuthor, "authors"],
  ["DELETE", "/en/api/super/authors/:id", h.handleDeleteAuthor, "authors"],

  ["GET", "/en/api/super/media", h.handleListMedia, "media"],
  ["GET", "/en/api/super/media/folders", h.handleListMediaFolders, "media"],
  ["GET", "/en/api/super/media/:id", h.handleGetMedia, "media"],
  ["POST", "/en/api/super/media/upload", h.handleUploadMedia, "media"],
  ["POST", "/en/api/super/media/from-url", h.handleCreateMediaFromUrl, "media"],
  ["PUT", "/en/api/super/media/:id", h.handleUpdateMedia, "media"],
  ["DELETE", "/en/api/super/media/:id", h.handleDeleteMedia, "media"],

  ["GET", "/en/api/super/settings", h.handleListSettings, "settings"],
  ["PUT", "/en/api/super/settings", h.handleUpdateSettings, "settings"],

  ["GET", "/en/api/super/users", h.handleListUsers, "users"],
  ["GET", "/en/api/super/users/:id", h.handleGetUser, "users"],
  ["PUT", "/en/api/super/users/:id/role", h.handleUpdateUserRole, "users"],
  ["DELETE", "/en/api/super/users/:id", h.handleDeleteUser, "users"],

  ["GET", "/en/api/super/components", h.handleListComponents, "components"],
  ["GET", "/en/api/super/components/:id", h.handleGetComponent, "components"],
  ["POST", "/en/api/super/components", h.handleCreateComponent, "components"],
  ["PUT", "/en/api/super/components/:id", h.handleUpdateComponent, "components"],
  ["DELETE", "/en/api/super/components/:id", h.handleDeleteComponent, "components"],

  ["GET", "/en/api/super/blocks", h.handleListBlocks, "page_components"],
  ["GET", "/en/api/super/blocks/:id", h.handleGetBlock, "page_components"],
  ["POST", "/en/api/super/blocks", h.handleCreateBlock, "page_components"],
  ["PUT", "/en/api/super/blocks/:id", h.handleUpdateBlock, "page_components"],
  ["DELETE", "/en/api/super/blocks/:id", h.handleDeleteBlock, "page_components"],

  // Permissions is a role/resource/action matrix, not an id-keyed
  // list of records — GET returns the whole matrix, PUT sets one
  // cell (body: {role, resource, action, allowed}), DELETE removes
  // one row by its numeric id.
  ["GET", "/en/api/super/permissions", h.handleListPermissions, "permissions"],
  ["PUT", "/en/api/super/permissions", h.handleSetPermission, "permissions"],
  ["DELETE", "/en/api/super/permissions/:id", h.handleDeletePermission, "permissions"],

  // Item-level access — per-user scope (none/own/all/assigned) on
  // top of the role permissions above. "defaults" is a literal
  // segment checked before the dynamic :id routes below, so a
  // numeric user id never collides with it.
  ["GET", "/en/api/super/item-access/defaults", h.handleGetItemAccessDefaults, "item_access"],
  ["PUT", "/en/api/super/item-access/defaults", h.handleSetItemAccessDefaultScope, "item_access"],
  ["GET", "/en/api/super/item-access/:id", h.handleGetUserItemAccess, "item_access"],
  ["PUT", "/en/api/super/item-access/:id", h.handleSetUserItemAccess, "item_access"],
  ["PUT", "/en/api/super/item-access/:id/assignment", h.handleSetItemAssignment, "item_access"],

  ["GET", "/en/api/super/review-blocks", h.handleListReviewBlocks, "review_blocks"],
  ["POST", "/en/api/super/review-blocks", h.handleCreateReviewBlock, "review_blocks"],
  ["PUT", "/en/api/super/review-blocks/:id", h.handleUpdateReviewBlock, "review_blocks"],
  ["DELETE", "/en/api/super/review-blocks/:id", h.handleDeleteReviewBlock, "review_blocks"],

  ["GET", "/en/api/super/ad-rules", h.handleListAdRules, "ad_rules"],
  ["POST", "/en/api/super/ad-rules", h.handleCreateAdRule, "ad_rules"],
  ["PUT", "/en/api/super/ad-rules/:id", h.handleUpdateAdRule, "ad_rules"],
  ["DELETE", "/en/api/super/ad-rules/:id", h.handleDeleteAdRule, "ad_rules"],

  ["GET", "/en/api/super/nav-items", h.handleListNavItems, "nav_items"],
  ["GET", "/en/api/super/nav-items/:id", h.handleGetNavItem, "nav_items"],
  ["POST", "/en/api/super/nav-items", h.handleCreateNavItem, "nav_items"],
  ["PUT", "/en/api/super/nav-items/:id", h.handleUpdateNavItem, "nav_items"],
  ["DELETE", "/en/api/super/nav-items/:id", h.handleDeleteNavItem, "nav_items"],

  ["GET", "/en/api/super/banners", h.handleListBanners, "banners"],
  ["GET", "/en/api/super/banners/:id", h.handleGetBanner, "banners"],
  ["POST", "/en/api/super/banners", h.handleCreateBanner, "banners"],
  ["PUT", "/en/api/super/banners/:id", h.handleUpdateBanner, "banners"],
  ["DELETE", "/en/api/super/banners/:id", h.handleDeleteBanner, "banners"],

  ["GET", "/en/api/super/updates", h.handleListPlatformUpdates, "updates"],
  ["GET", "/en/api/super/updates/:id", h.handleGetPlatformUpdate, "updates"],
  ["POST", "/en/api/super/updates", h.handleCreatePlatformUpdate, "updates"],
  ["PUT", "/en/api/super/updates/:id", h.handleUpdatePlatformUpdate, "updates"],
  ["DELETE", "/en/api/super/updates/:id", h.handleDeletePlatformUpdate, "updates"],

  // SEO landing pages (country_custom / category_country). Literal
  // segments ("discover", "countries-search", "eligible-casinos")
  // are listed before the dynamic :id route so a numeric id never
  // collides with them.
  ["GET", "/en/api/super/seo-pages-discover", h.handleDiscoverCategoryCountryCombos, "seo_pages"],
  ["GET", "/en/api/super/seo-pages-countries-search", h.handleSearchCountriesForSeoPages, "seo_pages"],
  ["GET", "/en/api/super/seo-pages-eligible-casinos", h.handleGetEligibleCasinosForSeoPage, "seo_pages"],
  ["GET", "/en/api/super/seo-pages", h.handleListSeoPages, "seo_pages"],
  ["GET", "/en/api/super/seo-pages/:id", h.handleGetSeoPage, "seo_pages"],
  ["POST", "/en/api/super/seo-pages", h.handleCreateSeoPage, "seo_pages"],
  ["PUT", "/en/api/super/seo-pages/:id", h.handleUpdateSeoPage, "seo_pages"],
  ["DELETE", "/en/api/super/seo-pages/:id", h.handleDeleteSeoPage, "seo_pages"]
];

function matchRoute(method, path) {
  for (const [routeMethod, pattern, handler, resource] of ROUTES) {
    if (routeMethod !== method) continue;

    const patternParts = pattern.split("/").filter(Boolean);
    const pathParts = path.split("/").filter(Boolean);

    if (patternParts.length !== pathParts.length) continue;

    let param = null;
    let matched = true;

    for (let i = 0; i < patternParts.length; i++) {
      const pp = patternParts[i];
      if (pp.startsWith(":")) {
        param = decodeURIComponent(pathParts[i]);
        continue;
      }
      if (pp !== pathParts[i]) {
        matched = false;
        break;
      }
    }

    if (matched) {
      return { handler, resource, param };
    }
  }

  return null;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function actionForMethod(method) {
  switch (method) {
    case "GET":
      return "read";
    case "POST":
      return "create";
    case "PUT":
      return "update";
    case "DELETE":
      return "delete";
    default:
      return method.toLowerCase();
  }
}

/**
 * Entry point for all /en/api/super/* requests.
 * Wired from routes.js / index.js — see rule #7/#9/#10/#25.
 */
export async function handleSuperApi(request, env, ctx, path) {
  const method = request.method.toUpperCase();
  const requestId = crypto.randomUUID();

  const match = matchRoute(method, path);

  if (!match) {
    return json({ success: false, error: "not_found" }, 404);
  }

  // Read the body once as text (needed both for signature
  // verification and for JSON parsing in the handler).
  let bodyText = "";
  if (method === "POST" || method === "PUT" || method === "DELETE") {
    try {
      bodyText = await request.text();
    } catch (_) {
      bodyText = "";
    }
  }

  const verification = await verifySuperApiRequest(request, env, path, bodyText);

  if (!verification.ok) {
    await logSuperApiRequest(env, {
      credentialId: null,
      endpoint: path,
      method,
      resource: match.resource,
      resourceId: match.param,
      action: actionForMethod(method),
      success: false,
      statusCode: verification.status,
      requestId
    });

    const publicMessage =
      verification.status === 429 ? "rate_limited" : "unauthorized";

    return json({ success: false, error: publicMessage }, verification.status);
  }

  try {
    const response = await match.handler(
      request,
      env,
      match.param,
      bodyText
    );

    await logSuperApiRequest(env, {
      credentialId: verification.credentialId,
      endpoint: path,
      method,
      resource: match.resource,
      resourceId: match.param,
      action: actionForMethod(method),
      success: response.status < 400,
      statusCode: response.status,
      requestId
    });

    return response;
  } catch (error) {
    await logSuperApiRequest(env, {
      credentialId: verification.credentialId,
      endpoint: path,
      method,
      resource: match.resource,
      resourceId: match.param,
      action: actionForMethod(method),
      success: false,
      statusCode: 500,
      requestId
    });

    return json({ success: false, error: "internal_error" }, 500);
  }
}
