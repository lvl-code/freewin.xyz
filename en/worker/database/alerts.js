// worker/database/alerts.js
// Phase 13: Lightweight anomaly/alert system.
//
// evaluateAlertRules() is the ONLY writer of analytics_alerts, per the
// 0031 migration header comment. It only ever compares real observed
// data against a trailing baseline or current-state check -- never
// synthetic data. As of this pass that data source is one of:
// analytics_daily (evaluateDailyMetricRule), tracking_link_health_checks/
// tracking_links.health_status (evaluateHealthRule), postback_logs
// (evaluatePostbackHealthRule/evaluatePostbackSilenceRule -- brief §13
// "broken postbacks"/"unusually high unattributed conversions"/
// "duplicate conversions"), or analytics_conversions.source/
// reported_commission (evaluateReconciliationRule -- brief §13 "large
// commission discrepancies"/"missing conversions"). No new API surface
// was needed for any of this: rule CRUD (/api/v1/analytics/alert-rule/
// create) already accepts any metric/scope_type/threshold_type as free
// text, so these are usable the moment this file ships.
//
// Reading alerts back out, though, MUST be item-access scoped -- an
// alert about a casino/offer/tracking_link/partner an editor can't see
// is itself a leak (e.g. "Casino C revenue dropped 40%" reveals Casino C
// has revenue at all). getScopedAlerts() below handles that; the
// evaluation job itself does not need to, since it writes rather than
// reads on behalf of anyone.

import { getAccessibleIdCondition } from './item-access.js';

const ALERT_SCOPE_RESOURCE = {
  casino: 'casinos',
  offer: 'offers',
  tracking_link: 'tracking_links',
  partner: 'affiliate_partners',
  // Added for reconciliation alerts (brief §13) -- affiliate_accounts
  // IS already registered in item-access.js (editors commonly hold
  // real, non-admin-only permissions on it, unlike postback_configs
  // below), so 'account'-scoped alert visibility correctly inherits
  // whatever per-account scope (all/own/assigned/none) the viewing
  // user already has -- same scoping the reconciliation report itself
  // uses (see worker/database/reports.js handleReconciliation).
  account: 'affiliate_accounts'
  // 'global' and 'postback_config' intentionally have NO resource
  // mapping here, and for the same reason: postback_configs (0033)
  // deliberately has zero editor permission rows because it holds
  // credential_reference pointers -- there is no legitimate non-admin
  // scope for it to inherit (registering it would only ever resolve
  // to the system's default item-access scope, e.g. 'all', which
  // would silently leak postback-health alerts to any editor with
  // ordinary alerts-read access). Simply omitting a scope_type from
  // this map is what makes getScopedAlerts()/acknowledgeAlert() below
  // skip it entirely for non-admins -- the same mechanism 'global'
  // already relied on before this file had scope types at all.
};

// ── Evaluation (cron) ────────────────────────────────

// Only these analytics_daily columns may ever be interpolated as a
// column name below. rule.metric is stored, admin-editable data (via
// a future rule-management API, not yet built in this pass) -- never
// safe to splice into SQL without a whitelist, regardless of whether
// a write path exists yet.
const VALID_DAILY_METRIC_COLUMNS = new Set(['page_views', 'clicks', 'unique_clicks', 'conversions', 'revenue', 'commission']);

async function evaluateDailyMetricRule(db, rule, targetDate) {
  if (rule.scope_type === 'global') {
    // No 'overall' aggregate row exists in analytics_daily by design
    // (see analytics.js DIMENSION_RESOURCE_MAP comment -- adding one
    // would need to stay admin-only to avoid a leakage vector, and
    // global rules are already admin-only end to end, but there's
    // still no data source to read it from). Global-scope rules on a
    // per-dimension metric are not evaluated in this version --
    // create per-casino/offer/etc. rules instead. Returns cleanly
    // rather than guessing at an aggregate.
    return null;
  }
  if (!VALID_DAILY_METRIC_COLUMNS.has(rule.metric)) {
    throw new Error(`Rule metric "${rule.metric}" is not a valid analytics_daily column`);
  }

  const baselineStart = new Date(targetDate);
  baselineStart.setUTCDate(baselineStart.getUTCDate() - rule.comparison_window_days);
  const baselineStartStr = baselineStart.toISOString().slice(0, 10);
  const baselineEndStr = new Date(new Date(targetDate).setUTCDate(new Date(targetDate).getUTCDate() - 1)).toISOString().slice(0, 10);

  const dimensionClause = 'dimension_type = ? AND dimension_id = ?';

  const observedRow = await db.prepare(`
    SELECT ${rule.metric} AS value FROM analytics_daily
    WHERE ${dimensionClause} AND date = ?
  `).bind(rule.scope_type, rule.scope_id, targetDate).first();
  const observed = observedRow?.value ?? 0;

  const baselineRow = await db.prepare(`
    SELECT AVG(${rule.metric}) AS avg_value FROM analytics_daily
    WHERE ${dimensionClause} AND date BETWEEN ? AND ?
  `).bind(rule.scope_type, rule.scope_id, baselineStartStr, baselineEndStr).first();
  const baseline = baselineRow?.avg_value ?? 0;

  let triggered = false;
  if (rule.threshold_type === 'percent_drop') {
    triggered = baseline > 0 && observed <= baseline * (1 - rule.threshold_value / 100);
  } else if (rule.threshold_type === 'absolute_drop') {
    triggered = (baseline - observed) >= rule.threshold_value;
  } else if (rule.threshold_type === 'zero_conversion') {
    triggered = baseline > 0 && observed === 0;
  }

  if (!triggered) return null;
  return { observed, baseline, targetDate };
}

async function evaluateHealthRule(db, rule) {
  // health rules ignore comparison_window_days -- they check CURRENT
  // status, not a trend.
  if (rule.scope_type === 'tracking_link' && rule.scope_id) {
    const link = await db.prepare(`SELECT id, internal_name, health_status FROM tracking_links WHERE id = ?`).bind(rule.scope_id).first();
    if (link && link.health_status !== 'healthy') {
      return { linkId: link.id, linkName: link.internal_name, status: link.health_status };
    }
    return null;
  }
  if (rule.scope_type === 'global') {
    const unhealthy = await db.prepare(`SELECT id, internal_name, health_status FROM tracking_links WHERE health_status != 'healthy' LIMIT 1`).first();
    if (unhealthy) return { linkId: unhealthy.id, linkName: unhealthy.internal_name, status: unhealthy.health_status };
    return null;
  }
  return null; // health rules don't apply to casino/offer/partner scope
}

// ── Conversion/reconciliation health rules (brief §13) ─────────────
// Both read directly from tables the postback/import engine writes
// (postback_logs, analytics_conversions.source/reported_commission --
// see migrations 0033/0034) -- same "never synthetic" rule as the
// daily-metric/health rules above, just a different data source than
// analytics_daily since these concepts (postback outcomes, reported
// vs expected commission) don't live there.

const POSTBACK_RATE_METRICS = {
  // brief §13: "unusually high unattributed conversions", "duplicate
  // conversions", "broken postback authentication" all reduce to the
  // same shape -- what fraction of a postback_config's received
  // requests landed on a given outcome in the trailing window.
  postback_unattributed_rate: 'unattributed',
  postback_duplicate_rate: 'duplicate',
  postback_auth_failure_rate: 'rejected_auth'
};

async function evaluatePostbackHealthRule(db, rule) {
  if (rule.scope_type !== 'postback_config' || !rule.scope_id) return null;
  const outcome = POSTBACK_RATE_METRICS[rule.metric];
  if (!outcome) return null;

  // Real-time window ending NOW, not "yesterday" -- unlike
  // analytics_daily (only reliably complete for full past days),
  // postback_logs is written in real time, and the whole point of
  // this rule is to catch a breakage as it's happening, not tomorrow.
  const windowModifier = `-${rule.comparison_window_days} days`;
  const row = await db.prepare(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE outcome = ?) AS matching
    FROM postback_logs
    WHERE postback_config_id = ?
      AND received_at >= datetime('now', ?)
  `).bind(outcome, rule.scope_id, windowModifier).first();

  // No postbacks received at all in the window is its own condition
  // (brief §13 "broken postbacks") -- handled by postback_silence_
  // hours below, not here, so this never reports a fabricated 0% rate
  // off zero data (brief §29).
  if (!row || row.total === 0) return null;

  const ratePct = (row.matching / row.total) * 100;
  if (ratePct < rule.threshold_value) return null;
  return { totalReceived: row.total, matching: row.matching, ratePct: Number(ratePct.toFixed(2)) };
}

async function evaluatePostbackSilenceRule(db, rule) {
  // threshold_value = max acceptable hours since the last successfully
  // accepted postback. comparison_window_days is unused here (current-
  // state check, like evaluateHealthRule, not a trend).
  if (rule.scope_type !== 'postback_config' || !rule.scope_id) return null;

  const config = await db.prepare(`SELECT id FROM postback_configs WHERE id = ? AND status = 'active'`).bind(rule.scope_id).first();
  if (!config) return null; // a disabled/deleted integration isn't "broken", it's off

  const last = await db.prepare(`
    SELECT MAX(received_at) AS last_accepted FROM postback_logs
    WHERE postback_config_id = ? AND outcome = 'accepted'
  `).bind(rule.scope_id).first();

  if (!last?.last_accepted) return null; // never received one yet -- a fresh integration, not "broken"

  const hoursSince = (Date.now() - new Date(last.last_accepted + 'Z').getTime()) / (1000 * 60 * 60);
  if (hoursSince < rule.threshold_value) return null;
  return { lastAcceptedAt: last.last_accepted, hoursSince: Number(hoursSince.toFixed(1)) };
}

async function evaluateReconciliationRule(db, rule) {
  if (rule.scope_type !== 'account' || !rule.scope_id) return null;

  // Same real-time-window reasoning as evaluatePostbackHealthRule above.
  const windowModifier = `-${rule.comparison_window_days} days`;
  const row = await db.prepare(`
    SELECT
      COALESCE(SUM(calculated_commission) FILTER (WHERE source IN ('postback','manual')), 0) AS expected,
      COALESCE(SUM(reported_commission) FILTER (WHERE source = 'import'), 0) AS reported,
      COUNT(*) FILTER (WHERE source = 'import') AS reported_rows
    FROM analytics_conversions
    WHERE account_id = ? AND occurred_at >= datetime('now', ?)
  `).bind(rule.scope_id, windowModifier).first();
  if (!row) return null;

  if (rule.metric === 'reconciliation_missing') {
    // brief §13 "missing conversions": we have expected commission in
    // this window but no statement/import has arrived to compare
    // against at all -- distinct from a real discrepancy, which needs
    // reported data to exist in the first place.
    if (row.expected > (rule.threshold_value ?? 0) && row.reported_rows === 0) {
      return { expectedCommission: row.expected, reportedRows: 0 };
    }
    return null;
  }

  if (rule.metric === 'commission_discrepancy_pct') {
    if (row.reported_rows === 0) return null; // nothing to compare -- that's reconciliation_missing's job, not this rule's
    const diff = row.expected - row.reported;
    const diffPct = row.reported !== 0 ? (diff / row.reported) * 100 : (row.expected > 0 ? 100 : 0);
    if (Math.abs(diffPct) < rule.threshold_value) return null;
    return { expectedCommission: row.expected, reportedCommission: row.reported, difference: diff, differencePct: Number(diffPct.toFixed(2)) };
  }

  return null;
}

/**
 * Unscoped list of every alert rule -- for the Super API. The tenant
 * dashboard's own /alert-rules/list endpoint already does this exact
 * query inline in api.js (rules themselves have no item-access concept
 * to scope by -- only alerts, once triggered, get scoped by their
 * rule's dimension in getScopedAlerts() above). Exported here as a
 * reusable function rather than duplicating that same query a third
 * time in the new Super API handler.
 */
export async function getAllAlertRules(db) {
  const result = await db.prepare(`SELECT * FROM analytics_alert_rules ORDER BY created_at DESC`).all();
  return result.results || [];
}

export async function createAlertRule(db, { name, metric, scopeType, scopeId, thresholdType, thresholdValue, comparisonWindowDays, createdBy }) {
  const result = await db.prepare(`
    INSERT INTO analytics_alert_rules (name, metric, scope_type, scope_id, threshold_type, threshold_value, comparison_window_days, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    name, metric, scopeType || 'global', scopeId ?? null,
    thresholdType, thresholdValue ?? null, comparisonWindowDays || 7, createdBy ?? null
  ).run();
  return result.meta.last_row_id;
}

/**
 * Cron entry point. Feature-flagged identically to the other scheduled
 * jobs (system_settings key 'alert_rules_cron_enabled', default off).
 * Skips creating a new alert for a rule that already has an unresolved
 * 'open' alert -- prevents re-paging for an ongoing issue every run;
 * the existing alert must be acknowledged/resolved first.
 */
export async function evaluateAlertRules(db) {
  const flag = await db.prepare(`SELECT value FROM system_settings WHERE key = 'alert_rules_cron_enabled'`).first();
  if (!flag || flag.value !== 'true') {
    return { skipped: true, reason: 'feature flag disabled' };
  }

  const targetDate = await db.prepare(`SELECT date('now', '-1 day') AS d`).first().then(r => r.d);
  const rules = await db.prepare(`SELECT * FROM analytics_alert_rules WHERE enabled = 1`).all();

  const summary = [];
  for (const rule of rules.results || []) {
    try {
      const existingOpen = await db.prepare(`SELECT id FROM analytics_alerts WHERE rule_id = ? AND status = 'open' LIMIT 1`).bind(rule.id).first();
      if (existingOpen) {
        summary.push({ ruleId: rule.id, skipped: 'already open' });
        continue;
      }

      const isHealthRule = rule.metric === 'tracking_link_health' || rule.threshold_type === 'health_failure';
      const isPostbackRateRule = Object.prototype.hasOwnProperty.call(POSTBACK_RATE_METRICS, rule.metric);
      const isPostbackSilenceRule = rule.metric === 'postback_silence_hours';
      const isReconciliationRule = rule.metric === 'commission_discrepancy_pct' || rule.metric === 'reconciliation_missing';

      let detail;
      if (isHealthRule) detail = await evaluateHealthRule(db, rule);
      else if (isPostbackRateRule) detail = await evaluatePostbackHealthRule(db, rule);
      else if (isPostbackSilenceRule) detail = await evaluatePostbackSilenceRule(db, rule);
      else if (isReconciliationRule) detail = await evaluateReconciliationRule(db, rule);
      else detail = await evaluateDailyMetricRule(db, rule, targetDate);

      if (detail) {
        const insertResult = await db.prepare(`
          INSERT INTO analytics_alerts (rule_id, details_json, status) VALUES (?, ?, 'open')
        `).bind(rule.id, JSON.stringify(detail)).run();
        summary.push({ ruleId: rule.id, triggered: true, alertId: insertResult.meta.last_row_id });
      } else {
        summary.push({ ruleId: rule.id, triggered: false });
      }
    } catch (e) {
      summary.push({ ruleId: rule.id, error: e.message });
    }
  }

  return { skipped: false, date: targetDate, evaluated: summary.length, summary };
}

// ── Scoped reads ─────────────────────────────────────

/**
 * Returns alerts visible to `user`. Admins see everything. Non-admins
 * see only alerts whose rule scope_type/scope_id resolves to something
 * they have read access to via the existing item-access registry --
 * global-scope alerts are never shown to non-admins (see
 * ALERT_SCOPE_RESOURCE comment above).
 */
export async function getScopedAlerts(db, user, status = 'open') {
  if (user.role === 'admin') {
    const result = await db.prepare(`
      SELECT aa.*, ar.name AS rule_name, ar.metric, ar.scope_type, ar.scope_id
      FROM analytics_alerts aa
      JOIN analytics_alert_rules ar ON ar.id = aa.rule_id
      WHERE aa.status = ?
      ORDER BY aa.triggered_at DESC
      LIMIT 100
    `).bind(status).all();
    return result.results || [];
  }

  const scopeTypes = Object.keys(ALERT_SCOPE_RESOURCE);
  const conditions = [];
  const params = [];
  for (const scopeType of scopeTypes) {
    const { condition, params: p } = await getAccessibleIdCondition(db, user, ALERT_SCOPE_RESOURCE[scopeType], 'read', 'ar.scope_id');
    conditions.push(`(ar.scope_type = ? AND ${condition})`);
    params.push(scopeType, ...p);
  }

  const result = await db.prepare(`
    SELECT aa.*, ar.name AS rule_name, ar.metric, ar.scope_type, ar.scope_id
    FROM analytics_alerts aa
    JOIN analytics_alert_rules ar ON ar.id = aa.rule_id
    WHERE aa.status = ? AND (${conditions.join(' OR ')})
    ORDER BY aa.triggered_at DESC
    LIMIT 100
  `).bind(status, ...params).all();
  return result.results || [];
}

/**
 * Acknowledges an alert, after re-confirming the same scoped visibility
 * getScopedAlerts() would apply -- an alert ID is guessable/enumerable,
 * so this must not trust that the caller only ever requests IDs they
 * were shown.
 */
export async function acknowledgeAlert(db, user, alertId) {
  const alert = await db.prepare(`
    SELECT aa.*, ar.scope_type, ar.scope_id
    FROM analytics_alerts aa
    JOIN analytics_alert_rules ar ON ar.id = aa.rule_id
    WHERE aa.id = ?
  `).bind(alertId).first();
  if (!alert) return { success: false, error: 'Alert not found' };

  if (user.role !== 'admin') {
    if (alert.scope_type === 'global' || !ALERT_SCOPE_RESOURCE[alert.scope_type]) {
      return { success: false, error: 'Alert not found' };
    }
    // Re-derive the same accessible-scope_id condition getScopedAlerts()
    // uses, then test it against this ONE alert's scope_id via a
    // single-row derived table -- condition references a `scope_id`
    // column, which this derived table supplies directly.
    const { condition, params } = await getAccessibleIdCondition(db, user, ALERT_SCOPE_RESOURCE[alert.scope_type], 'read', 'scope_id');
    const check = await db.prepare(`
      SELECT 1 AS ok FROM (SELECT ? AS scope_id) WHERE ${condition}
    `).bind(alert.scope_id, ...params).first();
    if (!check) return { success: false, error: 'Alert not found' };
  }

  await db.prepare(`
    UPDATE analytics_alerts SET status = 'acknowledged', acknowledged_by = ?, acknowledged_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(user.user_id, alertId).run();
  return { success: true };
}
