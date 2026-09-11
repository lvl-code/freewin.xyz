// test/super-api-reporting.test.js
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { seedBaseFixtures } from './support/fixtures.js';
import {
  handleListReports, handleGetReport, handleCreateReport, handleRunReport, handleReportColumnOptions,
  handleListCampaigns, handleGetCampaign, handleCreateCampaign, handleUpdateCampaign,
  handleListAlertRules, handleCreateAlertRule, handleListAlerts, handleAcknowledgeAlert
} from '../worker/super/handlers-reporting.js';

function req(url) { return new Request(url); }

describe('Super API v9 -- Reports', () => {
  let db, fx, env;
  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    fx = await seedBaseFixtures(db);
    env = { DB: db };
  });

  test('create -> list -> get roundtrip', async () => {
    const createRes = await handleCreateReport(req('https://x'), env, undefined, JSON.stringify({ name: 'Test Report', reportType: 'casino_performance' }));
    const createBody = await createRes.json();
    assert.equal(createBody.success, true);
    const id = createBody.data.id;

    const listRes = await handleListReports(req('https://x/reports'), env);
    const listBody = await listRes.json();
    assert.ok(listBody.data.some(r => r.id === id));

    const getRes = await handleGetReport(req('https://x'), env, id);
    const getBody = await getRes.json();
    assert.equal(getBody.data.name, 'Test Report');
    assert.ok(Array.isArray(getBody.data.schedules));
  });

  test('create rejects an unknown report_type', async () => {
    const res = await handleCreateReport(req('https://x'), env, undefined, JSON.stringify({ name: 'Bad', reportType: 'not_a_type' }));
    const body = await res.json();
    assert.equal(body.success, false);
  });

  test('create falls back to the tenant\'s first admin user as owner when none is specified', async () => {
    const res = await handleCreateReport(req('https://x'), env, undefined, JSON.stringify({ name: 'No Owner Specified', reportType: 'casino_performance' }));
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.ownerId, fx.admin.user_id);
  });

  test('create accepts an explicit ownerId override', async () => {
    const res = await handleCreateReport(req('https://x'), env, undefined, JSON.stringify({ name: 'Explicit Owner', reportType: 'casino_performance', ownerId: fx.editorAssigned.user_id }));
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.ownerId, fx.editorAssigned.user_id);
  });

  test('create fails clearly (not a raw SQL error) when no admin user exists and no ownerId given', async () => {
    const emptyDb = createTestDb();
    applyMigrations(emptyDb);
    const emptyEnv = { DB: emptyDb }; // no users at all
    const res = await handleCreateReport(req('https://x'), emptyEnv, undefined, JSON.stringify({ name: 'Orphan', reportType: 'casino_performance' }));
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.error, /admin user/i);
  });

  test('run returns REAL tenant-wide output, no item-access scoping applied (consistent with every other Super API handler)', async () => {
    for (const [casinoId, revenue] of [[fx.casinoA, 100], [fx.casinoB, 200]]) {
      await db.prepare(`INSERT INTO analytics_daily (date, dimension_type, dimension_id, revenue, currency) VALUES ('2026-01-15', 'casino', ?, ?, 'USD')`).bind(casinoId, revenue).run();
    }
    const createRes = await handleCreateReport(req('https://x'), env, undefined, JSON.stringify({ name: 'Casino Report', reportType: 'casino_performance' }));
    const { data: { id } } = await createRes.json();

    const runRes = await handleRunReport(req('https://x'), env, id, JSON.stringify({ startDate: '2026-01-01', endDate: '2026-01-31' }));
    const runBody = await runRes.json();
    assert.equal(runBody.success, true);
    assert.equal(runBody.data.rows.length, 2, 'expected both casinos -- tenant-wide, not scoped to any one editor');
  });

  test('run on a nonexistent report returns 404', async () => {
    const res = await handleRunReport(req('https://x'), env, 999, JSON.stringify({ startDate: '2026-01-01', endDate: '2026-01-31' }));
    assert.equal(res.status, 404);
  });

  test('run on seo_performance surfaces the same honest "not configured" error, not fake data', async () => {
    const createRes = await handleCreateReport(req('https://x'), env, undefined, JSON.stringify({ name: 'SEO', reportType: 'seo_performance' }));
    const { data: { id } } = await createRes.json();
    const runRes = await handleRunReport(req('https://x'), env, id, JSON.stringify({ startDate: '2026-01-01', endDate: '2026-01-31' }));
    const runBody = await runRes.json();
    assert.equal(runBody.success, false);
    assert.match(runBody.error, /not configured/i);
  });

  test('column-options endpoint works without running anything', async () => {
    const res = await handleReportColumnOptions(req('https://x/report-column-options?report_type=casino_performance'), env);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.some(c => c.key === 'revenue'));
  });
});

describe('Super API v9 -- Campaigns', () => {
  let db, env;
  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    env = { DB: db };
  });

  test('create -> list -> get -> update roundtrip', async () => {
    const createRes = await handleCreateCampaign(req('https://x'), env, undefined, JSON.stringify({ name: 'Q4 Push', utmSource: 'newsletter' }));
    const createBody = await createRes.json();
    assert.equal(createBody.success, true);
    const id = createBody.data.id;

    const listRes = await handleListCampaigns(req('https://x/campaigns'), env);
    const listBody = await listRes.json();
    assert.ok(listBody.data.some(c => c.id === id));

    const updateRes = await handleUpdateCampaign(req('https://x'), env, id, JSON.stringify({ status: 'paused' }));
    assert.equal((await updateRes.json()).success, true);

    const getRes = await handleGetCampaign(req('https://x'), env, id);
    const getBody = await getRes.json();
    assert.equal(getBody.data.status, 'paused');
    assert.equal(getBody.data.utm_source, 'newsletter', 'unspecified fields on update must be preserved, not wiped');
  });

  test('create requires a name', async () => {
    const res = await handleCreateCampaign(req('https://x'), env, undefined, JSON.stringify({}));
    assert.equal((await res.json()).success, false);
  });

  test('update on a nonexistent campaign returns 404', async () => {
    const res = await handleUpdateCampaign(req('https://x'), env, 999, JSON.stringify({ status: 'paused' }));
    assert.equal(res.status, 404);
  });
});

describe('Super API v9 -- Alerts', () => {
  let db, fx, env;
  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    fx = await seedBaseFixtures(db);
    env = { DB: db };
  });

  test('create rule -> list rules roundtrip', async () => {
    const createRes = await handleCreateAlertRule(req('https://x'), env, undefined, JSON.stringify({
      name: 'Casino A drop', metric: 'clicks', scopeType: 'casino', scopeId: fx.casinoA,
      thresholdType: 'percent_drop', thresholdValue: 30
    }));
    const createBody = await createRes.json();
    assert.equal(createBody.success, true);

    const listRes = await handleListAlertRules(req('https://x'), env);
    const listBody = await listRes.json();
    assert.ok(listBody.data.some(r => r.name === 'Casino A drop'));
  });

  test('create rule requires name/metric/thresholdType', async () => {
    const res = await handleCreateAlertRule(req('https://x'), env, undefined, JSON.stringify({ name: 'Incomplete' }));
    assert.equal((await res.json()).success, false);
  });

  test('list alerts returns ALL tenant-wide (Super API is admin-equivalent, same as every other handler)', async () => {
    await db.prepare(`INSERT INTO analytics_alert_rules (id, name, metric, scope_type, scope_id, threshold_type, threshold_value) VALUES (1, 'Rule', 'clicks', 'casino', ?, 'percent_drop', 30)`).bind(fx.casinoA).run();
    await db.prepare(`INSERT INTO analytics_alerts (rule_id, status) VALUES (1, 'open')`).run();

    const res = await handleListAlerts(req('https://x'), env);
    const body = await res.json();
    assert.equal(body.data.length, 1);
  });

  test('acknowledge marks the alert acknowledged', async () => {
    await db.prepare(`INSERT INTO analytics_alert_rules (id, name, metric, scope_type, scope_id, threshold_type, threshold_value) VALUES (1, 'Rule', 'clicks', 'casino', ?, 'percent_drop', 30)`).bind(fx.casinoA).run();
    const alertResult = await db.prepare(`INSERT INTO analytics_alerts (rule_id, status) VALUES (1, 'open')`).run();
    const alertId = alertResult.meta.last_row_id;

    const res = await handleAcknowledgeAlert(req('https://x'), env, alertId);
    assert.equal((await res.json()).success, true);

    const row = await db.prepare(`SELECT status FROM analytics_alerts WHERE id = ?`).bind(alertId).first();
    assert.equal(row.status, 'acknowledged');
  });

  test('acknowledge on a nonexistent alert returns 404', async () => {
    const res = await handleAcknowledgeAlert(req('https://x'), env, 999);
    assert.equal(res.status, 404);
  });
});
