// worker/database/reports.js
// Phase 7-9: Report execution engine.
//
// Hard rule, same as analytics.js: report_definitions.filters_json is a
// saved convenience only, never an authorization boundary. Every runReport()
// call re-resolves the REQUESTING user's item-access at execution time via
// the same helpers analytics.js uses -- a saved report cannot leak data the
// runner no longer has access to (see 0030_reporting.sql header comment).
//
// "No fake completion" (brief §44): report types with no real underlying
// data source (seo_performance -- no Search Console/SEO API integration
// exists in this codebase) throw a clear, specific error rather than
// returning fabricated or all-zero rows dressed up as real data.

import { getAccessibleIdCondition } from './item-access.js';
import {
  getDimensionPerformance, getTimeSeries, getGeoPerformance, computeKpis, safeDivide
} from './analytics.js';

const REPORT_TYPES = [
  'executive_performance', 'affiliate_performance', 'partner_performance',
  'program_performance', 'account_performance', 'offer_performance',
  'tracking_link_performance', 'casino_performance', 'geo_performance',
  'content_performance', 'traffic_performance', 'conversion_funnel',
  'revenue_commission', 'seo_performance', 'operational_health'
];

export function isValidReportType(type) {
  return REPORT_TYPES.includes(type);
}

// ── Column manifests ─────────────────────────────────
// Single source of truth for each report type's available columns.
// Handlers below reference these constants directly (never inline a
// duplicate array) so the "available columns" the UI offers can never
// drift from what a handler actually returns. `summable: true` marks
// columns that are safe to subtotal when grouping (raw counts/amounts);
// ratios (CTR/CVR/EPC/etc.), IDs, and labels are never summed.
// `groupable: true` marks categorical columns worth grouping rows by --
// deliberately not offered on IDs or continuous metrics, where grouping
// wouldn't reduce anything (grouping by a unique ID just reproduces the
// original ungrouped rows).

const DIMENSION_REPORT_COLUMNS = (label) => [
  { key: 'dimensionId', label: `${label} ID` },
  { key: 'currency', label: 'Currency', groupable: true },
  { key: 'views', label: 'Views', summable: true },
  { key: 'clicks', label: 'Clicks', summable: true },
  { key: 'conversions', label: 'Conversions', summable: true },
  { key: 'revenue', label: 'Revenue', summable: true },
  { key: 'commission', label: 'Commission', summable: true },
  { key: 'ctr', label: 'CTR' }, { key: 'cvr', label: 'CVR' },
  { key: 'epc', label: 'EPC' }, { key: 'rpc', label: 'RPC' }, { key: 'cpa', label: 'CPA' }
];

const AFFILIATE_PERFORMANCE_COLUMNS = [
  { key: 'level', label: 'Level', groupable: true },
  { key: 'dimensionId', label: 'ID' },
  { key: 'currency', label: 'Currency', groupable: true },
  { key: 'clicks', label: 'Clicks', summable: true },
  { key: 'conversions', label: 'Conversions', summable: true },
  { key: 'revenue', label: 'Revenue', summable: true },
  { key: 'commission', label: 'Commission', summable: true },
  { key: 'cvr', label: 'CVR' }, { key: 'epc', label: 'EPC' }, { key: 'cpa', label: 'CPA' }
];

const GEO_PERFORMANCE_COLUMNS = [
  { key: 'country', label: 'Country', groupable: true },
  { key: 'clicks', label: 'Clicks', summable: true },
  { key: 'conversions', label: 'Conversions', summable: true },
  { key: 'revenue', label: 'Revenue', summable: true },
  { key: 'commission', label: 'Commission', summable: true },
  { key: 'cvr', label: 'CVR' }, { key: 'epc', label: 'EPC' }
];

const CONTENT_PERFORMANCE_COLUMNS = [
  { key: 'contentType', label: 'Content Type', groupable: true },
  { key: 'dimensionId', label: 'ID' },
  { key: 'views', label: 'Views', summable: true }
];

const TRAFFIC_PERFORMANCE_COLUMNS = [
  { key: 'date', label: 'Date', groupable: true },
  { key: 'views', label: 'Views (all content)', summable: true },
  { key: 'clicks', label: 'Affiliate Clicks', summable: true },
  { key: 'ctr', label: 'CTR' },
  { key: 'conversions', label: 'Conversions', summable: true },
  { key: 'revenue', label: 'Revenue', summable: true },
  { key: 'commission', label: 'Commission', summable: true }
];

const EXECUTIVE_PERFORMANCE_COLUMNS = [
  { key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value' }
];

const CONVERSION_FUNNEL_COLUMNS = [
  { key: 'casinoId', label: 'Casino ID' },
  { key: 'views', label: 'Views', summable: true },
  { key: 'clicks', label: 'Clicks', summable: true },
  { key: 'conversions', label: 'Conversions', summable: true },
  { key: 'viewToClick', label: 'View → Click %' }, { key: 'clickToConversion', label: 'Click → Conversion %' }
];

const REVENUE_COMMISSION_COLUMNS = [
  { key: 'casino_id', label: 'Casino ID' },
  { key: 'currency', label: 'Currency', groupable: true },
  { key: 'status', label: 'Status', groupable: true },
  { key: 'conversions', label: 'Conversions', summable: true },
  { key: 'revenue', label: 'Revenue', summable: true },
  { key: 'commission', label: 'Commission', summable: true }
];

const OPERATIONAL_HEALTH_COLUMNS = [
  { key: 'section', label: 'Section', groupable: true }, { key: 'detail', label: 'Detail' }
];

// Public manifest lookup -- used both by the API (to offer choices to
// the UI) and internally by runReport() (to validate/apply a saved
// selection). seo_performance intentionally has no entry, matching it
// having no handler -- see runReport() below.
const REPORT_COLUMN_MANIFESTS = {
  casino_performance: DIMENSION_REPORT_COLUMNS('Casino'),
  offer_performance: DIMENSION_REPORT_COLUMNS('Offer'),
  tracking_link_performance: DIMENSION_REPORT_COLUMNS('Tracking Link'),
  partner_performance: DIMENSION_REPORT_COLUMNS('Partner'),
  program_performance: DIMENSION_REPORT_COLUMNS('Program'),
  account_performance: DIMENSION_REPORT_COLUMNS('Account'),
  affiliate_performance: AFFILIATE_PERFORMANCE_COLUMNS,
  geo_performance: GEO_PERFORMANCE_COLUMNS,
  content_performance: CONTENT_PERFORMANCE_COLUMNS,
  traffic_performance: TRAFFIC_PERFORMANCE_COLUMNS,
  executive_performance: EXECUTIVE_PERFORMANCE_COLUMNS,
  conversion_funnel: CONVERSION_FUNNEL_COLUMNS,
  revenue_commission: REVENUE_COMMISSION_COLUMNS,
  operational_health: OPERATIONAL_HEALTH_COLUMNS
};

/**
 * Returns the full column manifest for a report type, for the API/UI to
 * offer choices from -- without running the report. Returns null for
 * seo_performance and any unrecognized type (both are "nothing to
 * offer", not an error the caller needs to distinguish here).
 */
export function getReportColumnOptions(reportType) {
  return REPORT_COLUMN_MANIFESTS[reportType] || null;
}

// ── Handlers: each returns { columns: [{key,label}], rows: [plain objects] } ──

async function handleDimensionReport(db, user, filters, dimensionType, label) {
  const rows = await getDimensionPerformance(db, user, { dimensionType, ...filters });
  return { columns: DIMENSION_REPORT_COLUMNS(label), rows };
}

async function handleAffiliatePerformance(db, user, filters) {
  const [partners, programs, accounts] = await Promise.all([
    getDimensionPerformance(db, user, { dimensionType: 'partner', ...filters }),
    getDimensionPerformance(db, user, { dimensionType: 'program', ...filters }),
    getDimensionPerformance(db, user, { dimensionType: 'account', ...filters })
  ]);
  const rows = [
    ...partners.map(r => ({ level: 'partner', ...r })),
    ...programs.map(r => ({ level: 'program', ...r })),
    ...accounts.map(r => ({ level: 'account', ...r }))
  ];
  return { columns: AFFILIATE_PERFORMANCE_COLUMNS, rows };
}

async function handleGeoPerformance(db, user, filters) {
  const rows = await getGeoPerformance(db, user, filters);
  return { columns: GEO_PERFORMANCE_COLUMNS, rows };
}

async function handleContentPerformance(db, user, filters) {
  const [reviews, news, pages] = await Promise.all([
    getDimensionPerformance(db, user, { dimensionType: 'review', ...filters }),
    getDimensionPerformance(db, user, { dimensionType: 'news', ...filters }),
    getDimensionPerformance(db, user, { dimensionType: 'page', ...filters })
  ]);
  const rows = [
    ...reviews.map(r => ({ contentType: 'review', ...r })),
    ...news.map(r => ({ contentType: 'news', ...r })),
    ...pages.map(r => ({ contentType: 'page', ...r }))
  ];
  return { columns: CONTENT_PERFORMANCE_COLUMNS, rows };
}

async function handleTrafficPerformance(db, user, filters) {
  const [casino, review, news, page] = await Promise.all([
    getTimeSeries(db, user, { dimensionType: 'casino', ...filters }),
    getTimeSeries(db, user, { dimensionType: 'review', ...filters }),
    getTimeSeries(db, user, { dimensionType: 'news', ...filters }),
    getTimeSeries(db, user, { dimensionType: 'page', ...filters })
  ]);
  const byDate = new Map();
  for (const series of [casino, review, news, page]) {
    for (const point of series) {
      const existing = byDate.get(point.date) || { date: point.date, views: 0, clicks: 0, conversions: 0, revenue: 0, commission: 0 };
      existing.views += point.views || 0;
      existing.clicks += point.clicks || 0;
      existing.conversions += point.conversions || 0;
      existing.revenue += point.revenue || 0;
      existing.commission += point.commission || 0;
      byDate.set(point.date, existing);
    }
  }
  const rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
    .map(r => ({ ...r, ctr: safeDivide(r.clicks, r.views) }));
  return { columns: TRAFFIC_PERFORMANCE_COLUMNS, rows };
}

async function handleExecutivePerformance(db, user, filters) {
  const casinoRows = await getDimensionPerformance(db, user, { dimensionType: 'casino', ...filters });
  const totals = casinoRows.reduce((acc, r) => ({
    views: acc.views + r.views, clicks: acc.clicks + r.clicks,
    conversions: acc.conversions + r.conversions, revenue: acc.revenue + r.revenue,
    commission: acc.commission + r.commission
  }), { views: 0, clicks: 0, conversions: 0, revenue: 0, commission: 0 });

  const contentTotals = await handleTrafficPerformance(db, user, filters);
  const contentViews = contentTotals.rows.reduce((sum, r) => sum + (r.views || 0), 0);
  // Note: contentViews intentionally double-counts casino views already
  // present in `totals.views` above (traffic_performance sums casino+
  // review+news+page together) -- this row is presented separately as
  // "all content views (any type)" rather than merged into the casino
  // KPI row, to avoid silently conflating the two in one number.

  return {
    columns: EXECUTIVE_PERFORMANCE_COLUMNS,
    rows: [
      { metric: 'Casino Views', value: totals.views },
      { metric: 'Affiliate Clicks', value: totals.clicks },
      { metric: 'Conversions', value: totals.conversions },
      { metric: 'Revenue', value: totals.revenue },
      { metric: 'Commission', value: totals.commission },
      { metric: 'CTR', value: safeDivide(totals.clicks, totals.views) },
      { metric: 'CVR', value: safeDivide(totals.conversions, totals.clicks) },
      { metric: 'All Content Views (casinos+reviews+news+pages)', value: contentViews }
    ]
  };
}

async function handleConversionFunnel(db, user, filters) {
  const { condition, params } = await getAccessibleIdCondition(db, user, 'casinos', 'read', 'casino_id');

  // Two independent queries merged in JS, NOT a JOIN -- joining
  // analytics_events to analytics_conversions on click_id before
  // counting would fan out (a click_id with more than one conversion
  // that day would multiply the view/click counts), the same
  // double-counting risk already documented and avoided in
  // aggregateOneDimension() above.
  const traffic = await db.prepare(`
    SELECT
      casino_id,
      COUNT(*) FILTER (WHERE event_type = 'CASINO_VIEW') AS views,
      COUNT(*) FILTER (WHERE event_type IN ('TRACKING_LINK_CLICK','OFFER_CLICK','AFFILIATE_REDIRECT','OUTBOUND_CLICK')) AS clicks
    FROM analytics_events
    WHERE date(occurred_at) BETWEEN ? AND ?
      AND ${condition}
      AND casino_id IS NOT NULL
    GROUP BY casino_id
  `).bind(filters.startDate, filters.endDate, ...params).all();

  const conversionCond = await getAccessibleIdCondition(db, user, 'casinos', 'read', 'casino_id');
  const conversions = await db.prepare(`
    SELECT casino_id, COUNT(*) AS conversions
    FROM analytics_conversions
    WHERE date(occurred_at) BETWEEN ? AND ?
      AND ${conversionCond.condition}
      AND casino_id IS NOT NULL
      AND status != 'rejected'
    GROUP BY casino_id
  `).bind(filters.startDate, filters.endDate, ...conversionCond.params).all();

  const conversionsByCasino = new Map((conversions.results || []).map(r => [r.casino_id, r.conversions]));

  const rows = (traffic.results || []).map(r => {
    const conv = conversionsByCasino.get(r.casino_id) || 0;
    return {
      casinoId: r.casino_id, views: r.views, clicks: r.clicks, conversions: conv,
      viewToClick: safeDivide(r.clicks, r.views), clickToConversion: safeDivide(conv, r.clicks)
    };
  });
  return { columns: CONVERSION_FUNNEL_COLUMNS, rows };
}

async function handleRevenueCommission(db, user, filters) {
  const { condition, params } = await getAccessibleIdCondition(db, user, 'casinos', 'read', 'casino_id');
  const currencyClause = filters.currency ? 'AND currency = ?' : '';
  const result = await db.prepare(`
    SELECT
      casino_id, currency, status,
      COUNT(*) AS conversions,
      COALESCE(SUM(reported_value), 0) AS revenue,
      COALESCE(SUM(calculated_commission), 0) AS commission
    FROM analytics_conversions
    WHERE date(occurred_at) BETWEEN ? AND ?
      AND ${condition}
      ${currencyClause}
    GROUP BY casino_id, currency, status
    ORDER BY revenue DESC
  `).bind(filters.startDate, filters.endDate, ...params, ...(filters.currency ? [filters.currency] : [])).all();

  return { columns: REVENUE_COMMISSION_COLUMNS, rows: result.results || [] };
}

async function handleOperationalHealth(db, user, filters) {
  const { condition, params } = await getAccessibleIdCondition(db, user, 'tracking_links', 'read', 'tl.id');
  const healthResult = await db.prepare(`
    SELECT tl.id AS tracking_link_id, tl.internal_name, tl.health_status,
           MAX(hc.checked_at) AS last_checked_at
    FROM tracking_links tl
    LEFT JOIN tracking_link_health_checks hc ON hc.tracking_link_id = tl.id
    WHERE ${condition} AND tl.health_status != 'healthy'
    GROUP BY tl.id
    ORDER BY tl.health_status
  `).bind(...params).all();

  // Report-run failures: scoped to reports this user owns (or all, if
  // admin) -- reuses report_definitions' own item-access registration
  // rather than inventing a separate check.
  const { condition: reportCond, params: reportParams } = await getAccessibleIdCondition(db, user, 'report_definitions', 'read', 'rd.id');
  const failedRuns = await db.prepare(`
    SELECT rr.id, rr.report_id, rd.name AS report_name, rr.error_message, rr.started_at
    FROM report_runs rr
    JOIN report_definitions rd ON rd.id = rr.report_id
    WHERE rr.status = 'failed' AND ${reportCond}
      AND date(rr.started_at) BETWEEN ? AND ?
    ORDER BY rr.started_at DESC
    LIMIT 50
  `).bind(...reportParams, filters.startDate, filters.endDate).all();

  // Open alerts: admin-only in this version -- analytics_alert_rules'
  // scope_type/scope_id isn't wired to the item-access registry (it's a
  // free-form dimension pointer, not a registered resource), so rather
  // than build a partial per-scope-type join here, non-admins simply see
  // a count of 0 with a note. This is a conservative, non-leaking
  // default, not a claim that no alerts exist.
  const alerts = user.role === 'admin'
    ? await db.prepare(`SELECT id, rule_id, triggered_at, status FROM analytics_alerts WHERE status = 'open' ORDER BY triggered_at DESC LIMIT 50`).all()
    : { results: [] };

  return {
    columns: OPERATIONAL_HEALTH_COLUMNS,
    rows: [
      ...(healthResult.results || []).map(r => ({ section: 'Tracking Link Health', detail: `${r.internal_name} (#${r.tracking_link_id}): ${r.health_status}` })),
      ...(failedRuns.results || []).map(r => ({ section: 'Failed Report Run', detail: `"${r.report_name}" (run #${r.id}) at ${r.started_at}: ${r.error_message || 'unknown error'}` })),
      ...(alerts.results || []).map(r => ({ section: 'Open Alert', detail: `Alert #${r.id} (rule #${r.rule_id}) triggered ${r.triggered_at}` })),
      ...(user.role !== 'admin' ? [{ section: 'Note', detail: 'Open alerts are only shown to admins in this version.' }] : [])
    ]
  };
}

const REPORT_HANDLERS = {
  casino_performance: (db, user, f) => handleDimensionReport(db, user, f, 'casino', 'Casino'),
  offer_performance: (db, user, f) => handleDimensionReport(db, user, f, 'offer', 'Offer'),
  tracking_link_performance: (db, user, f) => handleDimensionReport(db, user, f, 'tracking_link', 'Tracking Link'),
  partner_performance: (db, user, f) => handleDimensionReport(db, user, f, 'partner', 'Partner'),
  program_performance: (db, user, f) => handleDimensionReport(db, user, f, 'program', 'Program'),
  account_performance: (db, user, f) => handleDimensionReport(db, user, f, 'account', 'Account'),
  affiliate_performance: handleAffiliatePerformance,
  geo_performance: handleGeoPerformance,
  content_performance: handleContentPerformance,
  traffic_performance: handleTrafficPerformance,
  executive_performance: handleExecutivePerformance,
  conversion_funnel: handleConversionFunnel,
  revenue_commission: handleRevenueCommission,
  operational_health: handleOperationalHealth,
  // seo_performance deliberately has NO handler -- see runReport() below.
};

/**
 * Executes a report definition's report_type against real, item-access-
 * scoped data. Never reads report_definitions.filters_json as anything
 * more than a starting point the caller may override -- `filters` here
 * is what actually runs.
 */
/**
 * Executes a report definition's report_type against real, item-access-
 * scoped data. Never reads report_definitions.filters_json as anything
 * more than a starting point the caller may override -- `filters` here
 * is what actually runs.
 *
 * `filters.selectedColumns` (array of column keys) and `filters.groupBy`
 * (a single groupable column key) are both OPTIONAL and applied AFTER
 * the handler runs, never passed into the handler's own queries --
 * column selection is a display concern, not a data-access concern, so
 * it can never be used to widen what a handler returns.
 */
export async function runReport(db, user, reportType, filters) {
  if (reportType === 'seo_performance') {
    throw new Error(
      'SEO performance reporting requires a Search Console (or equivalent) ' +
      'integration that is not configured for this tenant. Internally ' +
      'measured page-view metrics for SEO landing pages are available via ' +
      'the content_performance report type instead.'
    );
  }
  const handler = REPORT_HANDLERS[reportType];
  if (!handler) {
    throw new Error(`Unknown or unimplemented report_type: ${reportType}`);
  }

  const result = await handler(db, user, filters);
  return applyColumnSelectionAndGrouping(result, filters);
}

/**
 * Applies (in order): column selection, then grouping+subtotals. Both
 * are validated against the report's OWN column manifest -- an unknown
 * or unavailable column key is silently ignored rather than throwing,
 * since a saved report's columns_json could reference a column from a
 * different report_type if hand-edited via the API; failing softly
 * here just means "show all columns" / "no grouping", never an error
 * that blocks viewing the report's real data.
 */
function applyColumnSelectionAndGrouping(result, { selectedColumns, groupBy } = {}) {
  let { columns, rows } = result;

  if (Array.isArray(selectedColumns) && selectedColumns.length > 0) {
    const available = new Set(columns.map(c => c.key));
    const filtered = columns.filter(c => selectedColumns.includes(c.key) && available.has(c.key));
    if (filtered.length > 0) columns = filtered;
  }

  if (groupBy) {
    const groupColumn = columns.find(c => c.key === groupBy && c.groupable);
    if (groupColumn) {
      rows = groupAndSubtotal(rows, columns, groupBy);
    }
  }

  return { columns, rows };
}

/**
 * Sorts rows by the group key and inserts a subtotal row after each
 * group, summing every column marked `summable: true` in the (possibly
 * already column-selected) column set. Non-summable columns in the
 * subtotal row are left blank rather than concatenated/guessed.
 */
function groupAndSubtotal(rows, columns, groupBy) {
  const summableKeys = columns.filter(c => c.summable).map(c => c.key);
  const groups = new Map();
  for (const row of rows) {
    const key = row[groupBy] ?? '(none)';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const output = [];
  for (const [groupValue, groupRows] of groups) {
    output.push(...groupRows);
    const subtotal = { [groupBy]: `Subtotal: ${groupValue}`, __subtotal: true };
    for (const key of summableKeys) {
      if (key === groupBy) continue;
      subtotal[key] = groupRows.reduce((sum, r) => sum + (Number(r[key]) || 0), 0);
    }
    output.push(subtotal);
  }
  return output;
}

// ── Export rendering ────────────────────────────────

function csvEscape(value) {
  if (value == null) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

/**
 * Builds a CSV string from a { columns, rows } result. Kept as a plain
 * string builder, not a true byte-stream, because D1 result sets here
 * are already fully materialized in memory by the handler queries above
 * (they're bounded, permission-scoped, date-ranged aggregate rows, not
 * raw event dumps) -- the "avoid loading millions of rows into memory"
 * constraint applies to the underlying query design (querying
 * analytics_daily, not analytics_events, for anything but single-day
 * ranges), not to this formatting step.
 */
export function toCsv({ columns, rows }) {
  const header = columns.map(c => csvEscape(c.label)).join(',');
  const lines = rows.map(row => columns.map(c => csvEscape(row[c.key])).join(','));
  return [header, ...lines].join('\n');
}

export function toHtml({ columns, rows }, title) {
  const header = columns.map(c => `<th>${c.label}</th>`).join('');
  const body = rows.map(row =>
    `<tr>${columns.map(c => `<td>${row[c.key] ?? ''}</td>`).join('')}</tr>`
  ).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
    <style>table{border-collapse:collapse;width:100%;font-family:sans-serif;font-size:13px}
    th,td{border:1px solid #ccc;padding:6px 10px;text-align:left}th{background:#f5f5f5}</style>
    </head><body><h1>${title}</h1><table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></body></html>`;
}

// ── Run bookkeeping + scheduled execution (Phase 9) ─────────────────

/**
 * Executes one report run end-to-end: runs the report_type handler,
 * records a report_runs row (success or failure — never silently
 * dropped, per brief §12), and returns the result for the caller to
 * do something with (stream as an export, or hand to delivery).
 *
 * `scheduleId` is null for an ad-hoc/manual run, set for a scheduled one.
 */
export async function executeReportRun(db, user, reportDefinition, { scheduleId = null, filters }) {
  const startedAt = new Date().toISOString();
  let runId = null;

  try {
    const result = await runReport(db, user, reportDefinition.report_type, filters);

    const insertResult = await db.prepare(`
      INSERT INTO report_runs (report_id, schedule_id, status, row_count, output_format, triggered_by, started_at, finished_at)
      VALUES (?, ?, 'success', ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(
      reportDefinition.id, scheduleId, result.rows.length,
      filters.outputFormat || 'csv', user?.user_id ?? null, startedAt
    ).run();
    runId = insertResult.meta.last_row_id;

    return { success: true, runId, ...result };
  } catch (e) {
    const insertResult = await db.prepare(`
      INSERT INTO report_runs (report_id, schedule_id, status, error_message, triggered_by, started_at, finished_at)
      VALUES (?, ?, 'failed', ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(reportDefinition.id, scheduleId, e.message, user?.user_id ?? null, startedAt).run();
    runId = insertResult.meta.last_row_id;

    return { success: false, runId, error: e.message };
  }
}

function computeNextRunAt(frequency, fromDate = new Date()) {
  const next = new Date(fromDate);
  if (frequency === 'daily') next.setUTCDate(next.getUTCDate() + 1);
  else if (frequency === 'weekly') next.setUTCDate(next.getUTCDate() + 7);
  else if (frequency === 'monthly') next.setUTCMonth(next.getUTCMonth() + 1);
  else return null; // 'custom' — no cron-expression parser here; requires manual reschedule
  return next.toISOString();
}

/**
 * Cron entry point (Phase 9). Feature-flagged identically to the
 * aggregation and health-check jobs (system_settings key
 * 'report_schedules_cron_enabled', default off).
 *
 * For each due schedule: builds a system-level "runner" user context
 * from the schedule's created_by (so item-access scoping still applies
 * to a scheduled run — it does NOT run unscoped just because no live
 * admin is making the request), executes the report, delivers it, and
 * advances next_run_at. One schedule's failure never stops the others
 * (each is wrapped independently).
 */
export async function runDueReportSchedules(db, env) {
  const flag = await db.prepare(
    `SELECT value FROM system_settings WHERE key = 'report_schedules_cron_enabled'`
  ).first();
  if (!flag || flag.value !== 'true') {
    return { skipped: true, reason: 'feature flag disabled' };
  }

  const { deliverReportRun } = await import('../reports/delivery.js');

  const due = await db.prepare(`
    SELECT rs.*, rd.report_type, rd.name AS report_name, rd.owner_id
    FROM report_schedules rs
    JOIN report_definitions rd ON rd.id = rs.report_id
    WHERE rs.enabled = 1 AND rs.next_run_at IS NOT NULL AND rs.next_run_at <= CURRENT_TIMESTAMP
  `).all();

  const summary = [];
  for (const schedule of due.results || []) {
    try {
      // Run AS the report's owner, so item-access scoping is exactly
      // what it would be if that user ran it manually right now —
      // never an unscoped "system" context.
      const owner = await db.prepare(`SELECT id AS user_id, role FROM users WHERE id = ?`).bind(schedule.owner_id).first();
      if (!owner) throw new Error(`Report owner (user #${schedule.owner_id}) no longer exists`);

      const today = new Date().toISOString().slice(0, 10);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const filters = { startDate: thirtyDaysAgo, endDate: today, outputFormat: schedule.output_format };

      const result = await executeReportRun(db, owner, { id: schedule.report_id, report_type: schedule.report_type }, {
        scheduleId: schedule.id, filters
      });

      const recipients = await db.prepare(`SELECT user_id, email FROM report_recipients WHERE schedule_id = ?`).bind(schedule.id).all();
      if (result.success) {
        await deliverReportRun(env, {
          reportRun: { id: result.runId, rowCount: result.rows?.length ?? 0 },
          reportName: schedule.report_name,
          recipients: recipients.results || []
        });
      }
      // Failed runs are already recorded in report_runs by executeReportRun
      // above; deliberately not notifying recipients of a failed run body
      // here (no content to send) — operational_health surfaces failures
      // to admins/owners instead, per brief §12/§22.

      const nextRunAt = computeNextRunAt(schedule.frequency);
      if (nextRunAt) {
        await db.prepare(`UPDATE report_schedules SET next_run_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(nextRunAt, schedule.id).run();
      }

      summary.push({ scheduleId: schedule.id, success: result.success, runId: result.runId });
    } catch (e) {
      // A schedule-level failure (e.g. missing owner) that never made
      // it into report_runs — record it there too so nothing is silent.
      await db.prepare(`
        INSERT INTO report_runs (report_id, schedule_id, status, error_message, started_at, finished_at)
        VALUES (?, ?, 'failed', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).bind(schedule.report_id, schedule.id, e.message).run().catch(() => {});
      summary.push({ scheduleId: schedule.id, success: false, error: e.message });
    }
  }

  return { skipped: false, processed: summary.length, summary };
}
