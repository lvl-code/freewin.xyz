// =====================================================
// LUMMET AI — API Route Handlers
// =====================================================

import { aiAssistant } from './assistant.js';
import { validateInput, detectInjection, hashIP, checkRateLimit, logRequest } from './security.js';
import { clearConversation } from './memory.js';

/**
 * Handle non-streaming chat (backward compatible)
 * POST /api/v1/ai/chat
 */
export async function handleChat(request, env, user) {
  try {
    const body = await request.json();

    if (!body.message || body.message.length > 500) {
      return Response.json({ error: 'Invalid message' }, { status: 400 });
    }

    const sessionId = body.session_id || generateSessionId(request, user);

    const ipHash = await hashIP(request.headers.get('CF-Connecting-IP'));
    const allowed = await checkRateLimit(env.DB, ipHash);
    if (!allowed) {
      return Response.json({
        success: false,
        error: 'Too many requests. Please try again in a few minutes.'
      }, { status: 429 });
    }
    await logRequest(env.DB, ipHash);

    const result = await aiAssistant.chat(env, body.message, {
      country: request.cf?.country || 'RW',
      sessionId,
      userId: user?.user_id || user?.id || null
    });

    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error('Lummet chat API error:', error.message);
    return Response.json({
      success: false,
      error: 'AI service temporarily unavailable.'
    }, { status: 500 });
  }
}

/**
 * Handle streaming chat
 * POST /api/v1/ai/chat/stream
 * Returns: Server-Sent Events stream
 */
export async function handleChatStream(request, env, user) {
  try {
    const body = await request.json();

    if (!body.message || body.message.length > 500) {
      return Response.json({ error: 'Invalid message' }, { status: 400 });
    }

    const sessionId = body.session_id || generateSessionId(request, user);

    const ipHash = await hashIP(request.headers.get('CF-Connecting-IP'));
    const allowed = await checkRateLimit(env.DB, ipHash);
    if (!allowed) {
      return Response.json({
        success: false,
        error: 'Too many requests. Please try again in a few minutes.'
      }, { status: 429 });
    }
    await logRequest(env.DB, ipHash);

    return await aiAssistant.chatStream(
      env,
      body.message,
      {
        country: request.cf?.country || 'RW',
        sessionId,
        userId: user?.user_id || user?.id || null
      },
      request
    );
  } catch (error) {
    console.error('Lummet stream API error:', error.message);
    return Response.json({
      success: false,
      error: 'AI streaming service temporarily unavailable.'
    }, { status: 500 });
  }
}

/**
 * Clear conversation history
 * POST /api/v1/ai/chat/clear
 */
export async function handleClearChat(request, env, user) {
  try {
    const body = await request.json();
    const sessionId = body.session_id || generateSessionId(request, user);

    await clearConversation(env.DB, sessionId);

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

function generateSessionId(request, user) {
  if (user?.user_id) {
    return `user-${user.user_id}-${crypto.randomUUID().slice(0, 8)}`;
  }
  const ip = request.headers.get('CF-Connecting-IP') || 'anon';
  return `anon-${ip}-${crypto.randomUUID().slice(0, 8)}`;
}
