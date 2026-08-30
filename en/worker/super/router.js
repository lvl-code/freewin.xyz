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
  ["GET", "/en/api/super/media/:id", h.handleGetMedia, "media"],
  ["PUT", "/en/api/super/media/:id", h.handleUpdateMedia, "media"],
  ["DELETE", "/en/api/super/media/:id", h.handleDeleteMedia, "media"],

  ["GET", "/en/api/super/settings", h.handleListSettings, "settings"],
  ["PUT", "/en/api/super/settings", h.handleUpdateSettings, "settings"],

  ["GET", "/en/api/super/users", h.handleListUsers, "users"],
  ["GET", "/en/api/super/users/:id", h.handleGetUser, "users"],
  ["PUT", "/en/api/super/users/:id/role", h.handleUpdateUserRole, "users"]
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
