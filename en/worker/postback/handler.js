import { getActiveConfigByToken } from '../database/postback-configs.js';
import { verifyPostbackAuth } from './auth.js';
import { normalizeConversionPayload, validateNormalized } from './field-mapping.js';
import { ingestPostback } from './ingest.js';
import { logPostbackAttempt } from './logging.js';
import { getCached, setCached } from '../cache.js';

const RATE_LIMIT_PER_MINUTE = 120;

// Best-effort fixed-window counter on top of the existing KV cache
// utility (worker/cache.js) -- not atomic (a read-then-write race is
// possible under true concurrency), same trade-off as every other KV
// usage already in this codebase. Good enough to blunt a runaway or
// misbehaving sender; a Durable-Object-backed counter would be exact,
// but this platform doesn't use Durable Objects anywhere else.
async function isRateLimited(env, token) {
  if (!env.CACHE) return false;
  const windowKey = `postback:rl:${token}:${Math.floor(Date.now() / 60000)}`;
  const current = (await getCached(env, windowKey)) || 0;
  if (current >= RATE_LIMIT_PER_MINUTE) return true;
  await setCached(env, windowKey, current + 1, 60);
  return false;
}

function safeJson(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * The full HTTP-level handler for /api/v1/conversions/postback/:token.
 * Called directly from worker/api.js BEFORE the session-auth gate,
 * same as every other /api/v1/public/* route -- this endpoint has its
 * own per-config authentication (worker/postback/auth.js) instead of
 * a logged-in user. Accepts both GET and POST since some networks
 * fire a simple signed GET pixel rather than posting a body.
 */
export async function handlePostbackRequest(request, env, token) {
  const sourceIp = request.headers.get('CF-Connecting-IP') || null;

  const config = await getActiveConfigByToken(env.DB, token);
  if (!config) {
    // Generic 404 -- never confirm/deny a token's existence, and never
    // a 401/403 that tells a prober "the URL is right, the auth isn't."
    return safeJson({ success: false, error: 'Not found' }, 404);
  }

  if (await isRateLimited(env, token)) {
    await logPostbackAttempt(env.DB, { postbackConfigId: config.id, sourceIp, outcome: 'rejected_rate_limit' });
    return safeJson({ success: false, error: 'Rate limit exceeded' }, 429);
  }

  const url = new URL(request.url);
  const queryParams = Object.fromEntries(url.searchParams.entries());

  let rawBody = '';
  let bodyParams = {};
  if (request.method === 'POST') {
    rawBody = await request.text();
    const contentType = request.headers.get('content-type') || '';
    try {
      if (rawBody) {
        if (contentType.includes('application/json')) {
          bodyParams = JSON.parse(rawBody);
        } else if (contentType.includes('application/x-www-form-urlencoded')) {
          bodyParams = Object.fromEntries(new URLSearchParams(rawBody).entries());
        } else {
          // No/unknown content-type -- try JSON first, then form
          // encoding, rather than rejecting outright (plenty of
          // real-world postback senders omit the header entirely).
          try { bodyParams = JSON.parse(rawBody); }
          catch { bodyParams = Object.fromEntries(new URLSearchParams(rawBody).entries()); }
        }
      }
    } catch {
      await logPostbackAttempt(env.DB, { postbackConfigId: config.id, sourceIp, outcome: 'rejected_validation', reason: 'malformed_body' });
      return safeJson({ success: false, error: 'Malformed request body' }, 400);
    }
  }

  const rawParams = { ...queryParams, ...bodyParams };

  const authResult = await verifyPostbackAuth(env, config, { rawParams, rawBody, sourceIp });
  if (!authResult.valid) {
    await logPostbackAttempt(env.DB, { postbackConfigId: config.id, sourceIp, outcome: 'rejected_auth', reason: authResult.reason });
    return safeJson({ success: false, error: 'Authentication failed' }, 401);
  }

  const normalized = normalizeConversionPayload(rawParams, config.field_mapping_json);
  const validation = validateNormalized(normalized);
  if (!validation.valid) {
    await logPostbackAttempt(env.DB, {
      postbackConfigId: config.id, sourceIp, outcome: 'rejected_validation',
      reason: validation.errors.join('; '), clickId: normalized.click_id, externalReference: normalized.external_reference
    });
    return safeJson({ success: false, error: 'Validation failed', details: validation.errors }, 400);
  }

  let result;
  try {
    result = await ingestPostback(env.DB, { config, normalized, sourceIp });
  } catch (e) {
    await logPostbackAttempt(env.DB, {
      postbackConfigId: config.id, sourceIp, outcome: 'error', reason: 'ingest_exception',
      clickId: normalized.click_id, externalReference: normalized.external_reference, normalized
    });
    return safeJson({ success: false, error: 'Internal error processing conversion' }, 500);
  }

  await logPostbackAttempt(env.DB, {
    postbackConfigId: config.id, sourceIp, outcome: result.outcome,
    clickId: normalized.click_id, externalReference: normalized.external_reference,
    conversionId: result.conversion_id, normalized
  });

  // Always 200 for a well-formed, authenticated request -- duplicate
  // and unattributed are legitimate, expected outcomes, not something
  // the provider's retry logic should treat as a failure (brief §5
  // "safe error responses").
  return safeJson({
    success: true,
    outcome: result.outcome,
    conversion_id: result.conversion_id,
    attributed: result.outcome === 'accepted'
  }, 200);
}
