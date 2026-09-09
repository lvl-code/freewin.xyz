// =====================================================
// SUPER API — HANDLERS (Analytics/Reporting/Alerting capabilities)
//
// Same convention as handlers.js/handlers-affiliate.js: thin wrappers,
// no duplicated business logic. Reuses worker/database/analytics.js
// and worker/database/reports.js exactly as the tenant dashboard does.
//
// Deliberate scope, per the original platform audit (§32): "Determine
// appropriate capability-based Super API endpoints... Expose only safe
// aggregated information unless raw data is explicitly necessary."
//
// - analytics_overview / analytics_revenue: TENANT-WIDE aggregates only
//   (analytics_daily rows, already pre-aggregated -- never
//   analytics_events, never a single visitor's data).
// - tracking_health: current STATUS counts + which links are currently
//   unhealthy -- never the raw tracking_link_health_checks history.
//
// Super API requests carry no per-user identity (single HMAC-signed
// tenant credential, see auth.js) -- consistent with every OTHER
// existing Super API handler in this codebase (handleListCasinos etc.
// call getAllCasinosAdmin() directly, with no item-access scoping at
// all). A synthetic { role: 'admin' } actor is passed into the shared
// analytics.js functions below so they resolve to their own
// unconditional "all" branch -- same tenant-wide-by-design model as
// everything else already exposed through this API, not a new or
// weaker access path introduced for analytics specifically.
//
// report_definitions/report_runs are NOT exposed through this API yet
// -- deferred, same as the original audit recommended, pending
// confirmation the control plane actually needs report data (not just
// analytics numbers) through this channel.
// =====================================================

import { getDimensionPerformance, getTimeSeries } from "../database/analytics.js";

// Synthetic tenant-wide actor -- see file header. Never constructed
// from request data; always this exact literal.
const SUPER_API_ACTOR = Object.freeze({ user_id: null, role: "admin" });

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
function ok(data = {}) { return json({ success: true, ...data }, 200); }
function fail(message, status = 400) { return json({ success: false, error: message }, status); }

function parseDateRange(url) {
  const startDate = url.searchParams.get("start_date");
  const endDate = url.searchParams.get("end_date");
  if (!startDate || !endDate) return null;
  return { startDate, endDate };
}

// =====================================================
// ANALYTICS OVERVIEW
// =====================================================
// GET /en/api/super/analytics-overview?start_date=&end_date=&dimension_type=&currency=
// Tenant-wide performance-by-dimension summary. dimension_type defaults
// to 'casino'; any type getDimensionPerformance() supports is valid
// (casino/offer/tracking_link/partner/program/account/campaign/review/
// news/page). Reads analytics_daily (pre-aggregated), never raw events.
export async function handleAnalyticsOverview(request, env) {
  const url = new URL(request.url);
  const range = parseDateRange(url);
  if (!range) return fail("start_date and end_date are required");

  const dimensionType = url.searchParams.get("dimension_type") || "casino";
  const currency = url.searchParams.get("currency") || null;

  const rows = await getDimensionPerformance(env.DB, SUPER_API_ACTOR, {
    dimensionType, currency, ...range
  });

  return ok({ dimension_type: dimensionType, rows });
}

// =====================================================
// ANALYTICS REVENUE
// =====================================================
// GET /en/api/super/analytics-revenue?start_date=&end_date=&currency=
// Tenant-wide daily revenue/commission time series, summed across every
// accessible casino (getTimeSeries with dimensionId=null already sums
// over all dimension_ids of that type per date -- see analytics.js).
// currency is REQUIRED here specifically (not optional, unlike the
// overview endpoint) -- summing revenue across mixed currencies would
// silently produce a meaningless number, and this platform's own rule
// is "never silently convert currencies" (brief §23).
export async function handleAnalyticsRevenue(request, env) {
  const url = new URL(request.url);
  const range = parseDateRange(url);
  if (!range) return fail("start_date and end_date are required");

  const currency = url.searchParams.get("currency");
  if (!currency) return fail("currency is required (revenue is never summed across currencies)");

  const series = await getTimeSeries(env.DB, SUPER_API_ACTOR, {
    dimensionType: "casino", dimensionId: null, currency, ...range
  });

  return ok({ currency, series });
}

// =====================================================
// TRACKING LINK HEALTH
// =====================================================
// GET /en/api/super/tracking-health
// Current status counts + which specific links are currently unhealthy.
// Deliberately NOT the raw tracking_link_health_checks history table --
// that stays internal; this is a summarized operational signal, per the
// audit's explicit "expose a summarized capability rather than raw
// table access" guidance for this exact resource.
export async function handleTrackingHealth(request, env) {
  const countsResult = await env.DB.prepare(`
    SELECT health_status, COUNT(*) AS count
    FROM tracking_links
    GROUP BY health_status
  `).all();

  const unhealthyResult = await env.DB.prepare(`
    SELECT id, internal_name, health_status
    FROM tracking_links
    WHERE health_status != 'healthy'
    ORDER BY health_status
    LIMIT 100
  `).all();

  const counts = {};
  for (const row of countsResult.results || []) {
    counts[row.health_status] = row.count;
  }

  return ok({
    counts,
    unhealthy_links: (unhealthyResult.results || []).map(r => ({
      id: r.id, name: r.internal_name, status: r.health_status
    }))
  });
}
