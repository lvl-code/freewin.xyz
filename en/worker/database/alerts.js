// worker/database/alerts.js
// Phase 13: Lightweight anomaly/alert system.
//
// evaluateAlertRules() is the ONLY writer of analytics_alerts, per the
// 0031 migration header comment. It only ever compares real
// analytics_daily rows (already permission-agnostic aggregates, since
// this runs as a background job with no requesting user) against a
// trailing baseline, or real tracking_link_health_checks/
// tracking_links.health_status rows -- never synthetic data.
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
  partner: 'affiliate_partners'
  // 'global' intentionally has no resource mapping -- global-scope
  // alerts reflect platform-wide totals across all casinos/offers/etc.,
  // which would leak aggregate information about items a scoped editor
  // can't otherwise see. Global alerts are admin-only, enforced in
  // getScopedAlerts() below by simply never including them for
  // non-admins, not by trying to scope an inherently unscoped metric.
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
      const detail = isHealthRule
        ? await evaluateHealthRule(db, rule)
        : await evaluateDailyMetricRule(db, rule, targetDate);

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
