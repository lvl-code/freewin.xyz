// test/reconciliation-alerts.test.js
//
// Covers brief §13's alert types that plug into the postback/import
// engine: large commission discrepancies, missing conversions
// (no statement received), unusually high unattributed conversions,
// duplicate conversions, and broken/silent postback integrations.
// Reuses the EXISTING evaluateAlertRules()/analytics_alert_rules
// machinery -- no new tables, no new API routes.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { logEvent, recordConversion } from '../worker/database/analytics.js';
import { createCommercialTerm } from '../worker/database/affiliate-commercial-terms.js';
import { createPostbackConfig } from '../worker/database/postback-configs.js';
import { logPostbackAttempt } from '../worker/postback/logging.js';
import { parseCsv } from '../worker/imports/parse.js';
import { importConversionReport } from '../worker/imports/pipeline.js';
import { evaluateAlertRules, getScopedAlerts } from '../worker/database/alerts.js';

async function seedAffiliateGraph(db) {
  await db.prepare(`INSERT INTO users (id, email, password_hash, role) VALUES (1, 'admin@test.local', 'x', 'admin')`).run();
  await db.prepare(`INSERT INTO affiliate_partners (id, name, slug, status, created_by) VALUES (1, 'Partner A', 'partner-a', 'active', 1)`).run();
  await db.prepare(`INSERT INTO affiliate_programs (id, partner_id, name, status, created_by) VALUES (10, 1, 'Program A', 'active', 1)`).run();
  await db.prepare(`INSERT INTO affiliate_accounts (id, program_id, account_name, status, credential_reference, created_by) VALUES (100, 10, 'Account A', 'active', 'SECRET_A', 1)`).run();
  await db.prepare(`INSERT INTO casinos (id, name, slug, website_url, affiliate_url, created_by) VALUES (200, 'Casino X', 'casino-x', 'https://x.example', 'https://aff.example/x', 1)`).run();
  await db.prepare(`
    INSERT INTO tracking_links (id, internal_name, tracking_code, destination_url, casino_id, partner_id, program_id, status)
    VALUES (300, 'Program A link', 'proga-link', 'https://out.example/a', 200, 1, 10, 'active')
  `).run();
  return { partnerId: 1, programId: 10, accountId: 100, casinoId: 200, trackingLinkId: 300 };
}

async function enableAlertCron(db) {
  await db.prepare(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('alert_rules_cron_enabled', 'true')`).run();
}

async function createRule(db, rule) {
  const result = await db.prepare(`
    INSERT INTO analytics_alert_rules (name, metric, scope_type, scope_id, threshold_type, threshold_value, comparison_window_days, enabled, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)
  `).bind(rule.name, rule.metric, rule.scope_type, rule.scope_id, rule.threshold_type, rule.threshold_value, rule.comparison_window_days ?? 7).run();
  return result.meta.last_row_id;
}

describe('reconciliation commission-discrepancy alerts (brief §13)', () => {
  let db, graph;
  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    graph = await seedAffiliateGraph(db);
    await enableAlertCron(db);
    await createCommercialTerm(db, { program_id: graph.programId, account_id: graph.accountId, term_type: 'cpa', cpa_amount: 40, effective_date: '2020-01-01', created_by: 1 });
  });

  test('a large discrepancy between expected and reported commission triggers an alert', async () => {
    await recordConversion(db, {
      trackingLinkId: graph.trackingLinkId, casinoId: graph.casinoId, partnerId: graph.partnerId,
      programId: graph.programId, accountId: graph.accountId, conversionType: 'ftd', status: 'confirmed',
      reportedValue: 100, currency: 'USD', externalReference: 'GG-BIGGAP', source: 'postback'
    });
    const rows = parseCsv(`transaction_id,event,status,amount,currency,commission,casino_id\nGG-BIGGAP,ftd,confirmed,100,USD,10,${graph.casinoId}`); // expected 40, reported 10
    await importConversionReport(db, { accountId: graph.accountId, rows, format: 'csv', createdBy: 1 });

    await createRule(db, { name: 'Big discrepancy', metric: 'commission_discrepancy_pct', scope_type: 'account', scope_id: graph.accountId, threshold_type: 'percent_discrepancy', threshold_value: 20, comparison_window_days: 30 });

    const result = await evaluateAlertRules(db);
    assert.equal(result.skipped, false);
    assert.equal(result.summary[0].triggered, true);

    const admin = { user_id: 1, role: 'admin' };
    const alerts = await getScopedAlerts(db, admin, 'open');
    assert.equal(alerts.length, 1);
    const details = JSON.parse(alerts[0].details_json);
    assert.equal(details.expectedCommission, 40);
    assert.equal(details.reportedCommission, 10);
  });

  test('a discrepancy within tolerance does NOT trigger', async () => {
    await recordConversion(db, {
      trackingLinkId: graph.trackingLinkId, casinoId: graph.casinoId, partnerId: graph.partnerId,
      programId: graph.programId, accountId: graph.accountId, conversionType: 'ftd', status: 'confirmed',
      reportedValue: 100, currency: 'USD', externalReference: 'GG-CLOSE', source: 'postback'
    });
    const rows = parseCsv(`transaction_id,event,status,amount,currency,commission,casino_id\nGG-CLOSE,ftd,confirmed,100,USD,39,${graph.casinoId}`); // expected 40, reported 39 -- ~2.5% off
    await importConversionReport(db, { accountId: graph.accountId, rows, format: 'csv', createdBy: 1 });

    await createRule(db, { name: 'Big discrepancy', metric: 'commission_discrepancy_pct', scope_type: 'account', scope_id: graph.accountId, threshold_type: 'percent_discrepancy', threshold_value: 20, comparison_window_days: 30 });

    const result = await evaluateAlertRules(db);
    assert.equal(result.summary[0].triggered, false);
  });

  test('expected commission with NO import data at all triggers reconciliation_missing, not commission_discrepancy_pct', async () => {
    await recordConversion(db, {
      trackingLinkId: graph.trackingLinkId, casinoId: graph.casinoId, partnerId: graph.partnerId,
      programId: graph.programId, accountId: graph.accountId, conversionType: 'ftd', status: 'confirmed',
      reportedValue: 100, currency: 'USD', externalReference: 'GG-NONE', source: 'postback'
    });

    await createRule(db, { name: 'Discrepancy (no data)', metric: 'commission_discrepancy_pct', scope_type: 'account', scope_id: graph.accountId, threshold_type: 'percent_discrepancy', threshold_value: 5, comparison_window_days: 30 });
    await createRule(db, { name: 'Missing statement', metric: 'reconciliation_missing', scope_type: 'account', scope_id: graph.accountId, threshold_type: 'flat', threshold_value: 0, comparison_window_days: 30 });

    const result = await evaluateAlertRules(db);
    const byRule = Object.fromEntries(result.summary.map(s => [s.ruleId, s]));
    assert.equal(byRule[1].triggered, false, 'commission_discrepancy_pct must not fire without any reported data to compare');
    assert.equal(byRule[2].triggered, true, 'reconciliation_missing should fire: expected commission exists, no statement was ever imported');
  });
});

describe('postback conversion-health alerts (brief §13)', () => {
  let db, graph, configId;
  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    graph = await seedAffiliateGraph(db);
    await enableAlertCron(db);
    const created = await createPostbackConfig(db, { account_id: graph.accountId, label: 'Test integration', auth_method: 'shared_secret', credential_reference: 'SECRET_A', signature_param: 'secret', created_by: 1 });
    configId = created.id;
  });

  test('a high unattributed-conversion rate triggers postback_unattributed_rate', async () => {
    for (let i = 0; i < 8; i++) {
      await logPostbackAttempt(db, { postbackConfigId: configId, outcome: 'unattributed', externalReference: `U-${i}` });
    }
    for (let i = 0; i < 2; i++) {
      await logPostbackAttempt(db, { postbackConfigId: configId, outcome: 'accepted', externalReference: `A-${i}` });
    }
    // 8/10 = 80% unattributed.
    await createRule(db, { name: 'High unattributed rate', metric: 'postback_unattributed_rate', scope_type: 'postback_config', scope_id: configId, threshold_type: 'percent_threshold', threshold_value: 50, comparison_window_days: 7 });

    const result = await evaluateAlertRules(db);
    assert.equal(result.summary[0].triggered, true);
  });

  test('a low unattributed rate does NOT trigger', async () => {
    for (let i = 0; i < 9; i++) {
      await logPostbackAttempt(db, { postbackConfigId: configId, outcome: 'accepted', externalReference: `A-${i}` });
    }
    await logPostbackAttempt(db, { postbackConfigId: configId, outcome: 'unattributed', externalReference: 'U-1' });
    await createRule(db, { name: 'High unattributed rate', metric: 'postback_unattributed_rate', scope_type: 'postback_config', scope_id: configId, threshold_type: 'percent_threshold', threshold_value: 50, comparison_window_days: 7 });

    const result = await evaluateAlertRules(db);
    assert.equal(result.summary[0].triggered, false);
  });

  test('a postback_config with zero postbacks received in the window never fabricates a rate', async () => {
    await createRule(db, { name: 'High duplicate rate', metric: 'postback_duplicate_rate', scope_type: 'postback_config', scope_id: configId, threshold_type: 'percent_threshold', threshold_value: 10, comparison_window_days: 7 });
    const result = await evaluateAlertRules(db);
    assert.equal(result.summary[0].triggered, false);
  });

  test('postback_silence_hours fires when no accepted postback has arrived recently enough', async () => {
    // Simulate a last-accepted postback far enough in the past.
    await db.prepare(`
      INSERT INTO postback_logs (postback_config_id, outcome, received_at)
      VALUES (?, 'accepted', datetime('now', '-100 hours'))
    `).bind(configId).run();

    await createRule(db, { name: 'Postback gone silent', metric: 'postback_silence_hours', scope_type: 'postback_config', scope_id: configId, threshold_type: 'hours_since_last', threshold_value: 48, comparison_window_days: 7 });

    const result = await evaluateAlertRules(db);
    assert.equal(result.summary[0].triggered, true);
  });

  test('postback_silence_hours does not fire for an integration that has simply never received a postback yet', async () => {
    await createRule(db, { name: 'Postback gone silent', metric: 'postback_silence_hours', scope_type: 'postback_config', scope_id: configId, threshold_type: 'hours_since_last', threshold_value: 48, comparison_window_days: 7 });
    const result = await evaluateAlertRules(db);
    assert.equal(result.summary[0].triggered, false);
  });

  test('scoped alert reads honor the existing item-access system for the new scope types (admin sees postback_config alerts)', async () => {
    for (let i = 0; i < 5; i++) await logPostbackAttempt(db, { postbackConfigId: configId, outcome: 'unattributed', externalReference: `U-${i}` });
    await createRule(db, { name: 'High unattributed rate', metric: 'postback_unattributed_rate', scope_type: 'postback_config', scope_id: configId, threshold_type: 'percent_threshold', threshold_value: 50, comparison_window_days: 7 });
    await evaluateAlertRules(db);

    const admin = { user_id: 1, role: 'admin' };
    const alerts = await getScopedAlerts(db, admin, 'open');
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].scope_type, 'postback_config');
  });

  test('SECURITY: a non-admin editor never sees postback_config-scoped alerts, even with ordinary alerts-read access (postback_configs has no editor permission rows -- see migration 0033)', async () => {
    for (let i = 0; i < 5; i++) await logPostbackAttempt(db, { postbackConfigId: configId, outcome: 'unattributed', externalReference: `U-${i}` });
    await createRule(db, { name: 'High unattributed rate', metric: 'postback_unattributed_rate', scope_type: 'postback_config', scope_id: configId, threshold_type: 'percent_threshold', threshold_value: 50, comparison_window_days: 7 });
    await evaluateAlertRules(db);

    await db.prepare(`INSERT INTO users (id, email, password_hash, role) VALUES (2, 'editor@test.local', 'x', 'editor')`).run();
    // Grant the broadest possible non-admin item-access default so this
    // test proves the omission-from-ALERT_SCOPE_RESOURCE mechanism
    // itself is what blocks visibility, not merely an absent grant.
    await db.prepare(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('item_access_default_scope', 'all')`).run();

    const editor = { user_id: 2, role: 'editor' };
    const alerts = await getScopedAlerts(db, editor, 'open');
    assert.equal(alerts.length, 0, 'a postback_config-scoped alert must never be visible to a non-admin, regardless of their default item-access scope');
  });
});
