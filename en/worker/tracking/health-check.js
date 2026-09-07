// Link Health Monitoring Service.
//
// Deliberately NOT called from the redirect path (brief requirement:
// "do not perform expensive health checks synchronously during normal
// visitor requests"). This module is invoked only by: a scheduled
// Worker task gated behind the system_settings feature flag
// (Phase 5D wiring), an admin-triggered manual "test this link" API
// call, or a future authenticated Lummet Super API request.
//
// Health state vocabulary (brief §8 — deliberately nuanced, NOT a
// binary up/down, because affiliate destinations routinely block
// Cloudflare IPs, bots, or specific GEOs without actually being dead):
//   healthy    — resolved successfully within the redirect limit
//   warning    — resolved, but with a concerning signal (e.g. an
//                unusually long redirect chain)
//   broken     — confirmed dead: network failure, timeout, or a hard
//                4xx/5xx that isn't explainable as bot/GEO gating
//   restricted — server responded but in a way consistent with
//                bot-detection or GEO-gating (403/429/451), NOT
//                assumed dead — brief explicitly warns against
//                disabling a commercially important link over this
//   unknown    — not yet checked, or the check itself errored in a
//                way that isn't a meaningful health signal
//
// error_type is the structured detail behind the health_status, kept
// separate so admins can see WHY, not just a status dot.

const MAX_REDIRECTS = 10;
const DEFAULT_TIMEOUT_MS = 8000;
const WARNING_REDIRECT_THRESHOLD = 5;

/**
 * Follows a redirect chain manually (redirect: 'manual') so we can
 * count hops and stop at MAX_REDIRECTS, rather than letting fetch's
 * built-in redirect-following hide how many hops actually happened.
 */
export async function checkTrackingLinkHealth(url, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const startedAt = Date.now();
  let currentUrl = url;
  let redirectCount = 0;
  let finalUrl = url;
  let httpStatus = null;

  try {
    while (redirectCount <= MAX_REDIRECTS) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let response;
      try {
        response = await fetchImpl(currentUrl, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LinkHealthMonitor/1.0)' },
        });
      } finally {
        clearTimeout(timeout);
      }

      httpStatus = response.status;
      finalUrl = currentUrl;

      const isRedirect = httpStatus >= 300 && httpStatus < 400;
      if (!isRedirect) break;

      const location = response.headers.get('location');
      if (!location) break; // redirect status with no Location header -- treat as terminal
      currentUrl = new URL(location, currentUrl).toString();
      redirectCount++;

      if (redirectCount > MAX_REDIRECTS) {
        return finishResult({
          httpStatus, finalUrl: currentUrl, redirectCount, startedAt,
          errorType: 'too_many_redirects', healthStatus: 'broken',
          errorMessage: `Exceeded ${MAX_REDIRECTS} redirects`,
        });
      }
    }

    return classifyResult({ httpStatus, finalUrl, redirectCount, startedAt });
  } catch (err) {
    if (err.name === 'AbortError') {
      return finishResult({
        httpStatus: null, finalUrl: currentUrl, redirectCount, startedAt,
        errorType: 'timeout', healthStatus: 'timeout',
        errorMessage: `No response within ${timeoutMs}ms`,
      });
    }
    return finishResult({
      httpStatus: null, finalUrl: currentUrl, redirectCount, startedAt,
      errorType: 'network_error', healthStatus: 'broken',
      errorMessage: err.message || 'Network error',
    });
  }
}

function classifyResult({ httpStatus, finalUrl, redirectCount, startedAt }) {
  // Bot-detection / GEO-gating signals -- NOT treated as broken, per
  // the brief's explicit instruction not to disable a commercially
  // important link over an automated check hitting a 403.
  if (httpStatus === 403 || httpStatus === 429 || httpStatus === 451) {
    return finishResult({
      httpStatus, finalUrl, redirectCount, startedAt,
      errorType: httpStatus === 451 ? 'geo_restricted' : 'bot_restricted',
      healthStatus: 'restricted',
      errorMessage: `Server responded ${httpStatus} — likely bot detection or GEO gating, not a dead link`,
    });
  }

  if (httpStatus >= 200 && httpStatus < 300) {
    return finishResult({
      httpStatus, finalUrl, redirectCount, startedAt,
      errorType: null,
      healthStatus: redirectCount > WARNING_REDIRECT_THRESHOLD ? 'warning' : 'healthy',
      errorMessage: redirectCount > WARNING_REDIRECT_THRESHOLD ? `Unusually long redirect chain (${redirectCount} hops)` : null,
    });
  }

  // Any other 3xx (redirect loop with no Location, etc.), 4xx, or 5xx
  // is treated as a confirmed problem.
  return finishResult({
    httpStatus, finalUrl, redirectCount, startedAt,
    errorType: 'http_error',
    healthStatus: 'broken',
    errorMessage: `Server responded with HTTP ${httpStatus}`,
  });
}

function finishResult({ httpStatus, finalUrl, redirectCount, startedAt, errorType, healthStatus, errorMessage }) {
  return {
    httpStatus,
    finalUrl,
    redirectCount,
    responseTimeMs: Date.now() - startedAt,
    errorType,
    healthStatus,
    errorMessage,
  };
}

/**
 * Persists a health check result and updates the link's current
 * status snapshot, then prunes old checks beyond the retention
 * window (avoid unbounded growth, per the brief).
 */
export async function recordHealthCheck(db, trackingLinkId, result, { retainCount = 50 } = {}) {
  await db.prepare(`
    INSERT INTO tracking_link_health_checks (
      tracking_link_id, http_status, final_url, redirect_count, response_time_ms, error_type, error_message, health_status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    trackingLinkId, result.httpStatus ?? null, result.finalUrl ?? null, result.redirectCount ?? null,
    result.responseTimeMs ?? null, result.errorType ?? null, result.errorMessage ?? null, result.healthStatus
  ).run();

  await db.prepare(`
    UPDATE tracking_links SET health_status = ?, health_checked_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(result.healthStatus, trackingLinkId).run();

  // Prune: keep only the most recent `retainCount` checks for this link.
  await db.prepare(`
    DELETE FROM tracking_link_health_checks
    WHERE tracking_link_id = ? AND id NOT IN (
      SELECT id FROM tracking_link_health_checks
      WHERE tracking_link_id = ?
      ORDER BY checked_at DESC
      LIMIT ?
    )
  `).bind(trackingLinkId, trackingLinkId, retainCount).run();
}

/**
 * Runs a health check for one link end to end (check + record). This
 * is what an admin-triggered manual "test this link" API call and the
 * scheduled batch task both call.
 */
export async function checkAndRecordLink(db, trackingLink, opts = {}) {
  const result = await checkTrackingLinkHealth(trackingLink.destination_url, opts);
  await recordHealthCheck(db, trackingLink.id, result);
  return result;
}

/**
 * Batch entry point for the scheduled task (Phase 5D wiring). Checks
 * the feature flag itself so the caller doesn't need to -- a no-op
 * scheduled invocation is always safe to call.
 */
export async function runScheduledHealthChecks(db, { batchSize = 20, staleAfterHours = 6 } = {}) {
  const flag = await db.prepare(`SELECT value FROM system_settings WHERE key = 'tracking_link_health_cron_enabled'`).first();
  if (!flag || flag.value !== 'true') {
    return { skipped: true, reason: 'feature flag disabled' };
  }

  const stale = await db.prepare(`
    SELECT * FROM tracking_links
    WHERE status = 'active'
      AND (health_checked_at IS NULL OR health_checked_at < datetime('now', ?))
    ORDER BY health_checked_at ASC NULLS FIRST
    LIMIT ?
  `).bind(`-${staleAfterHours} hours`, batchSize).all();

  const links = stale.results || [];
  const results = [];
  for (const link of links) {
    try {
      const result = await checkAndRecordLink(db, link);
      results.push({ id: link.id, ...result });
    } catch (err) {
      results.push({ id: link.id, error: err.message });
    }
  }
  return { skipped: false, checked: results.length, results };
}
