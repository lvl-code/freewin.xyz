import { aiAssistant } from '../ai/assistant.js';

import {
  hashIP,
  checkRateLimit,
  logRequest
} from '../ai/security.js';

import {
  handleAdminLogin,
  handleGetCasinos,
  handleGetReviews,
  handleGetNews,
  handleGetPages,
  handleTogglePublish,
  handleAiCommand,
  handleGenerateReview,
  handleBulkSEO,
  handleBulkFAQs,
  handleBulkReviews
} from './admin-api.js';


/**
 * Lummet subdomain router.
 *
 * Works for any tenant:
 *
 *   lummet.freewin.xyz
 *   lummet.level.casino
 *   lummet.cluster.casino
 *
 * No tenant/domain identity is hardcoded here.
 *
 * Returns null only when the request is not a Lummet hostname.
 */
export async function handleLummetRequest(request, env, ctx) {
  const url = new URL(request.url);
  const hostname = url.hostname.toLowerCase();

  // Lummet is identified by the first hostname label.
  //
  // Example:
  //   lummet.freewin.xyz
  //   ^^^^^^
  //
  if (!hostname.startsWith("lummet.")) {
    return null;
  }

  const path = url.pathname;
  const method = request.method;

  // =====================================================
  // STATIC ASSETS
  // =====================================================

  // Important:
  // Lummet requests must be allowed to fetch CSS/JS/images
  // from the normal ASSETS binding instead of falling through
  // to the SPA index.
  if (path.startsWith("/static/")) {
    return env.ASSETS.fetch(request);
  }

  // Lummet application assets.
  if (path.startsWith("/lummet/") && path !== "/lummet/index.html") {
    return env.ASSETS.fetch(request);
  }

  // =====================================================
  // ADMIN API
  // =====================================================

  if (path === "/api/admin/login" && method === "POST") {
    return handleAdminLogin(request, env);
  }

  if (path === "/api/admin/casinos" && method === "GET") {
    return handleGetCasinos(request, env);
  }

  if (path === "/api/admin/reviews" && method === "GET") {
    return handleGetReviews(request, env);
  }

  if (path === "/api/admin/news" && method === "GET") {
    return handleGetNews(request, env);
  }

  if (path === "/api/admin/pages" && method === "GET") {
    return handleGetPages(request, env);
  }

  if (path === "/api/admin/toggle-publish" && method === "POST") {
    return handleTogglePublish(request, env);
  }

  if (path === "/api/admin/ai-command" && method === "POST") {
    return handleAiCommand(request, env);
  }

  if (path === "/api/admin/generate-review" && method === "POST") {
    return handleGenerateReview(request, env);
  }

  if (path === "/api/admin/bulk-seo" && method === "POST") {
    return handleBulkSEO(request, env);
  }

  if (path === "/api/admin/bulk-faqs" && method === "POST") {
    return handleBulkFAQs(request, env);
  }

  if (path === "/api/admin/bulk-reviews" && method === "POST") {
    return handleBulkReviews(request, env);
  }

  // =====================================================
  // LUMMET HOME
  // =====================================================

  if (path === "/" && method === "GET") {
    return serveIndex(request, env);
  }

  if (path === "/lummet" && method === "GET") {
    return serveIndex(request, env);
  }

  if (path === "/lummet/" && method === "GET") {
    return serveIndex(request, env);
  }

  // =====================================================
  // CHAT API — STREAMING
  // =====================================================

  if (path === "/api/chat/stream" && method === "POST") {
    return handleChatStream(request, env);
  }

  // =====================================================
  // CHAT API — NORMAL
  // =====================================================

  if (path === "/api/chat" && method === "POST") {
    return handleChat(request, env);
  }

  // =====================================================
  // FAVICON
  // =====================================================

  if (path === "/favicon.ico") {
    return new Response(null, {
      status: 204
    });
  }

  // =====================================================
  // UNKNOWN LUMMET PATH
  // =====================================================

  // Lummet is an SPA.
  // Any non-API/non-asset path goes back to index.html.
  return serveIndex(request, env);
}


/**
 * Serve the Lummet application.
 *
 * IMPORTANT:
 * Do NOT hardcode:
 *
 *   https://lummet.level.casino
 *
 * The current request hostname is used instead.
 */
function serveIndex(request, env) {
  const url = new URL(request.url);

  const assetUrl = new URL(
    "/lummet/index.html",
    url.origin
  );

  return env.ASSETS.fetch(
    new Request(assetUrl.toString(), {
      method: "GET",
      headers: request.headers
    })
  );
}


// =====================================================
// CHAT
// =====================================================

async function handleChat(request, env) {
  try {
    const body = await request.json();

    if (!body.message || body.message.length > 500) {
      return Response.json(
        { error: "Invalid message" },
        { status: 400 }
      );
    }

    const sessionId =
      body.session_id ||
      generateSessionId(request);

    const ipHash = await hashIP(
      request.headers.get("CF-Connecting-IP")
    );

    const allowed = await checkRateLimit(
      env.DB,
      ipHash
    );

    if (!allowed) {
      return Response.json(
        {
          success: false,
          error: "Too many requests."
        },
        { status: 429 }
      );
    }

    await logRequest(env.DB, ipHash);

    const result = await aiAssistant.chat(
      env,
      body.message,
      {
        country: request.cf?.country || "RW",
        sessionId,
        userId: null
      },
      request
    );

    return Response.json({
      success: true,
      ...result
    });

  } catch (error) {

    console.error(
      "Lummet chat error:",
      error.message
    );

    return Response.json(
      {
        success: false,
        error: "AI service unavailable."
      },
      { status: 500 }
    );
  }
}


// =====================================================
// CHAT STREAM
// =====================================================

async function handleChatStream(request, env) {
  try {

    const body = await request.json();

    if (!body.message || body.message.length > 500) {
      return Response.json(
        { error: "Invalid message" },
        { status: 400 }
      );
    }

    const sessionId =
      body.session_id ||
      generateSessionId(request);

    const ipHash = await hashIP(
      request.headers.get("CF-Connecting-IP")
    );

    const allowed = await checkRateLimit(
      env.DB,
      ipHash
    );

    if (!allowed) {
      return Response.json(
        {
          success: false,
          error: "Too many requests."
        },
        { status: 429 }
      );
    }

    await logRequest(env.DB, ipHash);

    return await aiAssistant.chatStream(
      env,
      body.message,
      {
        country: request.cf?.country || "RW",
        sessionId,
        userId: null
      },
      request
    );

  } catch (error) {

    console.error(
      "Lummet stream error:",
      error.message
    );

    return Response.json(
      {
        success: false,
        error: "AI streaming unavailable."
      },
      { status: 500 }
    );
  }
}


// =====================================================
// SESSION
// =====================================================

function generateSessionId(request) {
  const ip =
    request.headers.get("CF-Connecting-IP") ||
    "anon";

  return `lummet-${ip}-${crypto.randomUUID().slice(0, 8)}`;
}
