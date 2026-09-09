import { aggregateAnalyticsDaily } from './database/analytics.js';
import { runDueReportSchedules } from './database/reports.js';
import { evaluateAlertRules } from './database/alerts.js';

export async function cleanupExpiredSessions(env) {

    await env.DB.prepare(`
        DELETE FROM sessions
        WHERE expires_at < CURRENT_TIMESTAMP
    `).run();

}

// Analytics daily aggregation (Phase 4). Mirrors the existing
// runScheduledHealthChecks() contract exactly: checks its own
// system_settings feature flag, always safe to call even when
// disabled (default), never throws out to the caller.
export async function runAnalyticsAggregation(env) {
    return await aggregateAnalyticsDaily(env.DB);
}

// Scheduled report execution (Phase 9). Same contract as above.
export async function runScheduledReports(env) {
    return await runDueReportSchedules(env.DB, env);
}

// Alert-rule evaluation (Phase 13). Same contract as above.
export async function runAlertEvaluation(env) {
    return await evaluateAlertRules(env.DB);
}
