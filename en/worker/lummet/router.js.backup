// =====================================================
// LUMMET AI — Subdomain Router
// Handles routing for lummet.level.casino
// =====================================================

// Change these imports at the top of lummet/router.js:
import { aiAssistant } from '../ai/assistant.js';
//import { handleAdminAPI } from './admin-api.js';
import { validateInput, detectInjection, hashIP, checkRateLimit, logRequest } from '../ai/security.js';

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
 * Main router for lummet.level.casino
 * Returns null if the request should fall through to the main site
 */
export async function handleLummetRequest(request, env, ctx) {
  const url = new URL(request.url);
  const hostname = url.hostname;

  // Only handle lummet subdomain
  if (hostname !== 'lummet.level.casino') return null;

  const path = url.pathname;
  const method = request.method;

    // ── Admin API Routes ──
  if (path === '/api/admin/login' && method === 'POST') {
    return handleAdminLogin(request, env);
  }
  if (path === '/api/admin/casinos' && method === 'GET') {
    return handleGetCasinos(request, env);
  }
  if (path === '/api/admin/reviews' && method === 'GET') {
    return handleGetReviews(request, env);
  }
  if (path === '/api/admin/news' && method === 'GET') {
    return handleGetNews(request, env);
  }
  if (path === '/api/admin/pages' && method === 'GET') {
    return handleGetPages(request, env);
  }
  if (path === '/api/admin/toggle-publish' && method === 'POST') {
    return handleTogglePublish(request, env);
  }
  if (path === '/api/admin/ai-command' && method === 'POST') {
    return handleAiCommand(request, env);
  }
  if (path === '/api/admin/generate-review' && method === 'POST') {
    return handleGenerateReview(request, env);
  }
  if (path === '/api/admin/bulk-seo' && method === 'POST') {
    return handleBulkSEO(request, env);
  }
  if (path === '/api/admin/bulk-faqs' && method === 'POST') {
    return handleBulkFAQs(request, env);
  }
  if (path === '/api/admin/bulk-reviews' && method === 'POST') {
    return handleBulkReviews(request, env);
  }


  // ── Serve index.html for root ──
    // ── Serve index.html for root ──
  if (path === '/' && method === 'GET') {
    return serveIndex(env);
  }


  // ── Chat API (streaming) ──
  if (path === '/api/chat/stream' && method === 'POST') {
    return handleChatStream(request, env);
  }

  // ── Chat API (non-streaming) ──
  if (path === '/api/chat' && method === 'POST') {
    return handleChat(request, env);
  }

  // ── Admin API ──
  if (path.startsWith('/api/admin/')) {
    return handleAdminAPI(request, env, path);
  }

  // ── Favicon ──
  if (path === '/favicon.ico') {
    return new Response(null, { status: 204 });
  }

  // ── SPA fallback ──
  return serveIndex(env);
}

// ── Serve index.html ──
// Replace the serveIndex() function in lummet/router.js with this:

function serveIndex(env) {
  // Use the ASSETS binding to serve the HTML file
  return env.ASSETS.fetch(new Request('https://lummet.level.casino/lummet/index.html'));
}


// ── Chat handlers ──
async function handleChat(request, env) {
  try {
    const body = await request.json();
    if (!body.message || body.message.length > 500) {
      return Response.json({ error: 'Invalid message' }, { status: 400 });
    }

    const sessionId = body.session_id || generateSessionId(request);
    const ipHash = await hashIP(request.headers.get('CF-Connecting-IP'));

    const allowed = await checkRateLimit(env.DB, ipHash);
    if (!allowed) {
      return Response.json({ success: false, error: 'Too many requests.' }, { status: 429 });
    }
    await logRequest(env.DB, ipHash);

    const result = await aiAssistant.chat(env, body.message, {
      country: request.cf?.country || 'RW',
      sessionId,
      userId: null
    });

    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error('Lummet chat error:', error.message);
    return Response.json({ success: false, error: 'AI service unavailable.' }, { status: 500 });
  }
}

async function handleChatStream(request, env) {
  try {
    const body = await request.json();
    if (!body.message || body.message.length > 500) {
      return Response.json({ error: 'Invalid message' }, { status: 400 });
    }

    const sessionId = body.session_id || generateSessionId(request);
    const ipHash = await hashIP(request.headers.get('CF-Connecting-IP'));

    const allowed = await checkRateLimit(env.DB, ipHash);
    if (!allowed) {
      return Response.json({ success: false, error: 'Too many requests.' }, { status: 429 });
    }
    await logRequest(env.DB, ipHash);

    return await aiAssistant.chatStream(env, body.message, {
      country: request.cf?.country || 'RW',
      sessionId,
      userId: null
    });
  } catch (error) {
    console.error('Lummet stream error:', error.message);
    return Response.json({ success: false, error: 'AI streaming unavailable.' }, { status: 500 });
  }
}

function generateSessionId(request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'anon';
  return `lummet-${ip}-${crypto.randomUUID().slice(0, 8)}`;
}
