// =====================================================
// SUPER API — HANDLERS (Reports / Campaigns / Alerts capabilities, v9)
//
// Confirmed need: the control plane requires all three. Same
// conventions as every other Super API handler file: thin wrappers
// over dedicated DB-module functions, tenant-wide (unscoped), Super
// API's single HMAC-signed credential treated as the same trusted
// tenant-wide actor used everywhere else in this file family (see
// handlers-analytics.js header comment for the fuller reasoning).
//
// Exposure decisions made explicitly, not by default:
// - Reports: list/get/create + trigger an ad-hoc run (returns the
//   run's actual output rows). Report OUTPUT is itself aggregated KPI
//   data -- the same trust tier already exposed via analytics-overview/
//   analytics-revenue in v8 -- so returning it here is not a bigger
//   exposure than what's already approved, just packaged through a
//   named report type with column selection instead of a raw dimension
//   query. Historical report_runs rows do NOT store their row output
//   anywhere (only row_count/status/error) -- there is nothing to leak
//   by listing past runs; only a fresh /run call has real row data.
// - Campaigns: full CRUD -- campaign metadata (name, UTM fields,
//   status, dates) carries materially lower sensitivity than financial
//   or per-visitor data, and mirrors the read+write access every other
//   simple resource already has through this API (banners, nav items,
//   etc.).
// - Alerts: list rules, create rules, list alerts, acknowledge --
//   mirrors the tenant dashboard's own capability split (create/delete
//   rules is admin-only there; Super API's credential is already
//   tenant-wide-admin-equivalent by design, consistent with the rest
//   of this file).
// =====================================================

import { isValidReportType, getReportColumnOptions, getAllReportDefinitions, executeReportRun } from "../database/reports.js";
import * as campaignsDB from "../database/campaigns.js";
import { getAllAlertRules, createAlertRule, getScopedAlerts, acknowledgeAlert } from "../database/alerts.js";

const SUPER_API_ACTOR = Object.freeze({ user_id: null, role: "admin" });

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
function ok(data = {}) { return json({ success: true, ...data }, 200); }
function created(data = {}) { return json({ success: true, ...data }, 201); }
function fail(message, status = 400) { return json({ success: false, error: message }, status); }

async function readJsonBody(request, bodyText) {
  if (!bodyText) return {};
  try {
    return JSON.parse(bodyText);
  } catch (_) {
    return {};
  }
}

// =====================================================
// REPORTS
// =====================================================

export async function handleListReports(request, env) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "active";
  const rows = await getAllReportDefinitions(env.DB, { status });
  return ok({ data: rows });
}

export async function handleGetReport(request, env, id) {
  const report = await env.DB.prepare(`SELECT * FROM report_definitions WHERE id = ?`).bind(id).first();
  if (!report) return fail("not_found", 404);
  const schedules = await env.DB.prepare(`SELECT * FROM report_schedules WHERE report_id = ?`).bind(id).all();
  return ok({ data: { ...report, schedules: schedules.results || [] } });
}

export async function handleCreateReport(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  if (!body.name || !body.reportType) return fail("name and reportType are required");
  if (!isValidReportType(body.reportType)) return fail(`Unknown report_type: ${body.reportType}`);

  // report_definitions.owner_id is NOT NULL (it's the item-access
  // ownership column the tenant dashboard's 'own' scope resolves
  // against) -- Super API calls carry no per-user identity to supply
  // one automatically. Accept an explicit ownerId from the caller
  // (the control plane may know which tenant admin should own it);
  // otherwise fall back to the tenant's own first admin user, since
  // every Super API action is already tenant-admin-equivalent by
  // design (see file header). Fails clearly rather than letting a raw
  // NOT NULL constraint error reach the caller if somehow no admin
  // user exists at all.
  let ownerId = body.ownerId;
  if (!ownerId) {
    const admin = await env.DB.prepare(`SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1`).first();
    if (!admin) return fail("No admin user exists in this tenant to own the report; pass an explicit ownerId.", 422);
    ownerId = admin.id;
  }

  const result = await env.DB.prepare(`
    INSERT INTO report_definitions (name, report_type, filters_json, columns_json, grouping_json, owner_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    body.name, body.reportType,
    body.filters ? JSON.stringify(body.filters) : null,
    body.columns ? JSON.stringify(body.columns) : null,
    body.grouping ? JSON.stringify(body.grouping) : null,
    ownerId
  ).run();

  return created({ data: { id: result.meta.last_row_id, ownerId } });
}

// Triggers an immediate run and returns its actual output -- see file
// header for why report output is treated as the same trust tier as
// the v8 analytics endpoints rather than a bigger exposure.
export async function handleRunReport(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  if (!body.startDate || !body.endDate) return fail("startDate and endDate are required");

  const report = await env.DB.prepare(`SELECT * FROM report_definitions WHERE id = ?`).bind(id).first();
  if (!report) return fail("not_found", 404);

  const filters = {
    startDate: body.startDate, endDate: body.endDate, currency: body.currency || null,
    outputFormat: "json", selectedColumns: body.columns, groupBy: body.groupBy
  };

  const result = await executeReportRun(env.DB, SUPER_API_ACTOR, report, { filters });
  if (!result.success) return fail(result.error, 422);

  return ok({ data: { runId: result.runId, columns: result.columns, rows: result.rows } });
}

export async function handleReportColumnOptions(request, env) {
  const url = new URL(request.url);
  const reportType = url.searchParams.get("report_type");
  if (!reportType) return fail("report_type is required");
  const columns = getReportColumnOptions(reportType);
  return ok({ data: columns || [] });
}

// =====================================================
// CAMPAIGNS
// =====================================================

export async function handleListCampaigns(request, env) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const rows = await campaignsDB.getAllCampaigns(env.DB, { status });
  return ok({ data: rows });
}

export async function handleGetCampaign(request, env, id) {
  const row = await campaignsDB.getCampaignById(env.DB, id);
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleCreateCampaign(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  if (!body.name) return fail("name is required");
  const id = await campaignsDB.createCampaign(env.DB, body);
  return created({ data: { id } });
}

export async function handleUpdateCampaign(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  const updated = await campaignsDB.updateCampaign(env.DB, id, body);
  if (!updated) return fail("not_found", 404);
  return ok({ data: { id } });
}

// =====================================================
// ALERTS
// =====================================================

export async function handleListAlertRules(request, env) {
  const rows = await getAllAlertRules(env.DB);
  return ok({ data: rows });
}

export async function handleCreateAlertRule(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  if (!body.name || !body.metric || !body.thresholdType) {
    return fail("name, metric, and thresholdType are required");
  }
  const id = await createAlertRule(env.DB, body);
  return created({ data: { id } });
}

export async function handleListAlerts(request, env) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "open";
  // getScopedAlerts()'s admin branch is unconditional/tenant-wide --
  // exactly the access level this API already grants everywhere else.
  const rows = await getScopedAlerts(env.DB, SUPER_API_ACTOR, status);
  return ok({ data: rows });
}

export async function handleAcknowledgeAlert(request, env, id) {
  const result = await acknowledgeAlert(env.DB, SUPER_API_ACTOR, id);
  if (!result.success) return fail(result.error, 404);
  return ok({});
}
