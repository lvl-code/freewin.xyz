import { aggregateAnalyticsDaily } from './database/analytics.js';
import { runDueReportSchedules } from './database/reports.js';
import { evaluateAlertRules } from './database/alerts.js';
import { getConfigsDueForSync } from './database/provider-adapters.js';
import { syncAllDueProviders } from './adapters/sync.js';

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

// Outbound provider/API adapter sync (brief §10). Same feature-flag
// contract as the jobs above -- checks 'provider_sync_cron_enabled'
// (default 'false', see migration 0035) and never fetches or writes
// anything when it's off. Deliberately reads the flag here rather than
// inside syncAllDueProviders(), matching where every other job in this
// file makes that check, so the on/off behavior of every scheduled job
// is visible in one place.
export async function runProviderSync(env) {
    const flag = await env.DB.prepare(`SELECT value FROM system_settings WHERE key = 'provider_sync_cron_enabled'`).first();
    if (!flag || flag.value !== 'true') return { skipped: true, reason: 'provider_sync_cron_enabled is not "true"' };

    const configs = await getConfigsDueForSync(env.DB);
    if (configs.length === 0) return { skipped: false, synced: 0, results: [] };

    const results = await syncAllDueProviders(env.DB, env, configs);
    return { skipped: false, synced: results.length, results };
}
