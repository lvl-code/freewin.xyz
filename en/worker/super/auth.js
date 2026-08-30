// =====================================================
// SUPER API — AUTHENTICATION
// HMAC-signed, server-to-server auth for the Lummet
// control plane. Never trusts the Host header (rule #10).
// =====================================================
//
// Required headers on every /en/api/super/* request:
//
//   Authorization:     Bearer <credential_id>
//   X-Lummet-Timestamp: <unix ms>
//   X-Lummet-Nonce:      <random hex>
//   X-Lummet-Signature:  <hex HMAC-SHA256>
//
// Canonical string:
//   `${METHOD}\n${PATH}\n${TIMESTAMP}\n${NONCE}\n${SHA256_HEX(BODY)}`
//
// Two Worker secrets configure this tenant's side:
//   env.SUPER_API_CREDENTIAL_ID  — public identifier
//   env.SUPER_API_SECRET         — shared HMAC secret
//
// Both must be set with `wrangler secret put` — never stored
// in D1, wrangler.jsonc, or shipped to frontend JS.

const TIMESTAMP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const NONCE_RETENTION_MS = 10 * 60 * 1000; // 10 minutes, opportunistic cleanup
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 120;

function toHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

async function hmacSha256Hex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );
  return toHex(signature);
}

// Workers don't expose Node's crypto.timingSafeEqual, so this is a
// manual constant-time byte comparison over the hex strings.
function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) {
    // Still do a comparison of equal-ish length to avoid a cheap
    // length-based timing signal, then return false regardless.
    let dummy = 0;
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
      dummy |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    }
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function cleanupExpiredNonces(db, now) {
  try {
    await db
      .prepare(`DELETE FROM super_api_nonces WHERE created_at < ?`)
      .bind(now - NONCE_RETENTION_MS)
      .run();
  } catch (_) {
    // Best-effort cleanup; never block the request on this.
  }
}

async function cleanupExpiredRateLimits(db, now) {
  try {
    await db
      .prepare(`DELETE FROM super_api_rate_limits WHERE created_at < ?`)
      .bind(now - RATE_LIMIT_WINDOW_MS)
      .run();
  } catch (_) {
    // Best-effort cleanup.
  }
}

async function checkAndConsumeNonce(db, credentialId, nonce, now) {
  await cleanupExpiredNonces(db, now);

  const existing = await db
    .prepare(
      `SELECT 1 FROM super_api_nonces WHERE credential_id = ? AND nonce = ?`
    )
    .bind(credentialId, nonce)
    .first();

  if (existing) return false;

  await db
    .prepare(
      `INSERT INTO super_api_nonces (nonce, credential_id, created_at) VALUES (?, ?, ?)`
    )
    .bind(nonce, credentialId, now)
    .run();

  return true;
}

async function checkRateLimit(db, credentialId, now) {
  await cleanupExpiredRateLimits(db, now);

  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  const row = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM super_api_rate_limits WHERE credential_id = ? AND created_at >= ?`
    )
    .bind(credentialId, windowStart)
    .first();

  const count = row?.c || 0;

  if (count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  await db
    .prepare(
      `INSERT INTO super_api_rate_limits (credential_id, created_at) VALUES (?, ?)`
    )
    .bind(credentialId, now)
    .run();

  return true;
}

/**
 * Verifies a Super API request against this tenant's configured
 * credential/secret. Returns a result object rather than throwing,
 * so the caller can produce a uniform, generic error response and
 * a matching audit log entry.
 *
 * @param {Request} request
 * @param {object} env
 * @param {string} path       - normalized path, e.g. "/en/api/super/news"
 * @param {string} bodyText   - raw request body text ("" if none)
 */
export async function verifySuperApiRequest(request, env, path, bodyText) {
  const db = env.DB;

  const configuredCredentialId = env.SUPER_API_CREDENTIAL_ID;
  const configuredSecret = env.SUPER_API_SECRET;

  if (!configuredCredentialId || !configuredSecret) {
    // This tenant has not been configured for Super API access.
    return { ok: false, status: 503, reason: "not_configured" };
  }

  const authHeader = request.headers.get("Authorization") || "";
  const timestampHeader = request.headers.get("X-Lummet-Timestamp") || "";
  const nonceHeader = request.headers.get("X-Lummet-Nonce") || "";
  const signatureHeader = request.headers.get("X-Lummet-Signature") || "";

  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const credentialId = bearerMatch ? bearerMatch[1].trim() : "";

  if (
    !credentialId ||
    !timestampHeader ||
    !nonceHeader ||
    !signatureHeader
  ) {
    return { ok: false, status: 401, reason: "missing_credentials" };
  }

  // 1. Credential identity must match this tenant's configured id.
  if (!constantTimeEqual(credentialId, configuredCredentialId)) {
    return { ok: false, status: 401, reason: "unknown_credential" };
  }

  // 2. Timestamp freshness (replay/clock-skew defense).
  const timestamp = Number(timestampHeader);
  const now = Date.now();

  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > TIMESTAMP_WINDOW_MS) {
    return { ok: false, status: 401, reason: "stale_timestamp" };
  }

  // 3. Recompute and compare signature.
  const bodyHash = await sha256Hex(bodyText || "");
  const canonical = [
    request.method.toUpperCase(),
    path,
    String(timestamp),
    nonceHeader,
    bodyHash
  ].join("\n");

  const expectedSignature = await hmacSha256Hex(configuredSecret, canonical);

  if (!constantTimeEqual(signatureHeader.toLowerCase(), expectedSignature)) {
    return { ok: false, status: 401, reason: "bad_signature" };
  }

  // 4. Replay protection — nonce must be unused within the window.
  const nonceOk = await checkAndConsumeNonce(db, credentialId, nonceHeader, now);
  if (!nonceOk) {
    return { ok: false, status: 401, reason: "replayed_nonce" };
  }

  // 5. Rate limiting.
  const withinLimit = await checkRateLimit(db, credentialId, now);
  if (!withinLimit) {
    return { ok: false, status: 429, reason: "rate_limited" };
  }

  return { ok: true, credentialId };
}

/**
 * Records a Super API audit log entry. Never pass secrets/credential
 * material beyond the credential_id itself.
 */
export async function logSuperApiRequest(env, entry) {
  try {
    await env.DB.prepare(
      `INSERT INTO super_audit_logs
        (credential_id, endpoint, method, resource, resource_id, action, success, status_code, request_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        entry.credentialId || null,
        entry.endpoint,
        entry.method,
        entry.resource || null,
        entry.resourceId != null ? String(entry.resourceId) : null,
        entry.action || null,
        entry.success ? 1 : 0,
        entry.statusCode || null,
        entry.requestId || null
      )
      .run();
  } catch (_) {
    // Audit logging must never break the response.
  }
}
