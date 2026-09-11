// test/reports.test.js
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { seedBaseFixtures, insertEvent } from './support/fixtures.js';
import { runReport, isValidReportType, executeReportRun, getReportColumnOptions, runDueReportSchedules } from '../worker/database/reports.js';

describe('runReport -- "no fake completion" contract', () => {
  let db, fx;
  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    fx = await seedBaseFixtures(db);
  });

  test('seo_performance throws a clear, honest error instead of returning fabricated rows', async () => {
    await assert.rejects(
      () => runReport(db, fx.admin, 'seo_performance', { startDate: '2026-01-01', endDate: '2026-01-31' }),
      /not configured/i
    );
  });

  test('an unknown report_type throws rather than silently returning empty results', async () => {
    await assert.rejects(
      () => runReport(db, fx.admin, 'not_a_real_report_type', { startDate: '2026-01-01', endDate: '2026-01-31' })
    );
  });

  test('isValidReportType rejects seo_performance is NOT true -- it IS a recognized type, just unimplemented', () => {
    // Distinguish "not a valid type at all" from "valid type, no data
    // source yet" -- the API layer uses isValidReportType() to accept
    // report_definitions.report_type at creation time, separately from
    // whether runReport() can actually execute it yet.
    assert.equal(isValidReportType('seo_performance'), true);
    assert.equal(isValidReportType('made_up_type'), false);
  });

  test('casino_performance returns real, scoped rows for a valid type', async () => {
    await db.prepare(`
      INSERT INTO analytics_daily (date, dimension_type, dimension_id, page_views, clicks, conversions, revenue, commission, currency)
      VALUES ('2026-01-15', 'casino', ?, 100, 10, 1, 50, 5, 'USD')
    `).bind(fx.casinoA).run();

    const result = await runReport(db, fx.editorAssigned, 'casino_performance', { startDate: '2026-01-01', endDate: '2026-01-31' });
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].dimensionId, fx.casinoA);
    assert.ok(result.columns.length > 0);
  });
});

describe('runReport -- column selection and grouping (report column UI)', () => {
  let db, fx;
  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    fx = await seedBaseFixtures(db);
  });

  test('getReportColumnOptions returns the full manifest for a valid type, null for seo_performance', () => {
    const cols = getReportColumnOptions('casino_performance');
    assert.ok(cols.some(c => c.key === 'revenue'));
    assert.equal(getReportColumnOptions('seo_performance'), null);
    assert.equal(getReportColumnOptions('not_a_type'), null);
  });

  test('selectedColumns filters the returned columns without touching row data or scoping', async () => {
    await db.prepare(`
      INSERT INTO analytics_daily (date, dimension_type, dimension_id, revenue, commission, clicks, currency)
      VALUES ('2026-01-15', 'casino', ?, 100, 10, 5, 'USD')
    `).bind(fx.casinoA).run();

    const full = await runReport(db, fx.admin, 'casino_performance', { startDate: '2026-01-01', endDate: '2026-01-31' });
    assert.ok(full.columns.length > 2);

    const filtered = await runReport(db, fx.admin, 'casino_performance', {
      startDate: '2026-01-01', endDate: '2026-01-31', selectedColumns: ['dimensionId', 'revenue']
    });
    assert.deepEqual(filtered.columns.map(c => c.key), ['dimensionId', 'revenue']);
    // Row data itself is untouched -- filtering is a display concern only.
    assert.equal(filtered.rows[0].revenue, 100);
  });

  test('an empty or unmatched selectedColumns falls back to all columns rather than showing nothing', async () => {
    await db.prepare(`
      INSERT INTO analytics_daily (date, dimension_type, dimension_id, revenue, currency)
      VALUES ('2026-01-15', 'casino', ?, 100, 'USD')
    `).bind(fx.casinoA).run();

    const result = await runReport(db, fx.admin, 'casino_performance', {
      startDate: '2026-01-01', endDate: '2026-01-31', selectedColumns: ['not_a_real_column']
    });
    assert.ok(result.columns.length > 1, 'should have fallen back to the full column set');
  });

  test('groupBy on a groupable column sorts rows and inserts summed subtotal rows', async () => {
    // affiliate_performance groups by "level" (partner/program/account)
    await db.prepare(`INSERT INTO affiliate_partners (id, name, slug, status, created_by) VALUES (1, 'Partner A', 'partner-a', 'active', 1)`).run();
    await db.prepare(`
      INSERT INTO analytics_daily (date, dimension_type, dimension_id, clicks, revenue, currency)
      VALUES ('2026-01-15', 'partner', 1, 10, 100, 'USD')
    `).run();

    const result = await runReport(db, fx.admin, 'affiliate_performance', {
      startDate: '2026-01-01', endDate: '2026-01-31', groupBy: 'level'
    });
    const subtotalRows = result.rows.filter(r => r.__subtotal);
    assert.ok(subtotalRows.length > 0, 'expected at least one subtotal row');
    const partnerSubtotal = subtotalRows.find(r => String(r.level).includes('partner'));
    assert.ok(partnerSubtotal, 'expected a partner subtotal row');
    assert.equal(partnerSubtotal.revenue, 100);
    assert.equal(partnerSubtotal.clicks, 10);
  });

  test('groupBy on a non-groupable or unknown column is ignored, not an error', async () => {
    await db.prepare(`
      INSERT INTO analytics_daily (date, dimension_type, dimension_id, revenue, currency)
      VALUES ('2026-01-15', 'casino', ?, 100, 'USD')
    `).bind(fx.casinoA).run();

    // 'dimensionId' is NOT marked groupable in the manifest for casino_performance
    const result = await runReport(db, fx.admin, 'casino_performance', {
      startDate: '2026-01-01', endDate: '2026-01-31', groupBy: 'dimensionId'
    });
    assert.equal(result.rows.some(r => r.__subtotal), false);
  });
});

describe('executeReportRun -- always records a report_runs row, success or failure', () => {
  let db, fx;
  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    fx = await seedBaseFixtures(db);
  });

  test('a successful run is recorded with status=success and a real row_count', async () => {
    await db.prepare(`INSERT INTO report_definitions (id, name, report_type, owner_id) VALUES (1, 'Test Report', 'casino_performance', ?)`).bind(fx.admin.user_id).run();

    const result = await executeReportRun(db, fx.admin, { id: 1, report_type: 'casino_performance' }, {
      filters: { startDate: '2026-01-01', endDate: '2026-01-31' }
    });
    assert.equal(result.success, true);

    const run = await db.prepare(`SELECT * FROM report_runs WHERE id = ?`).bind(result.runId).first();
    assert.equal(run.status, 'success');
    assert.equal(run.row_count, result.rows.length);
  });

  test('a failing report_type (seo_performance) is recorded as status=failed with a real error_message, never silently dropped', async () => {
    await db.prepare(`INSERT INTO report_definitions (id, name, report_type, owner_id) VALUES (2, 'SEO Report', 'seo_performance', ?)`).bind(fx.admin.user_id).run();

    const result = await executeReportRun(db, fx.admin, { id: 2, report_type: 'seo_performance' }, {
      filters: { startDate: '2026-01-01', endDate: '2026-01-31' }
    });
    assert.equal(result.success, false);
    assert.ok(result.error);

    const run = await db.prepare(`SELECT * FROM report_runs WHERE id = ?`).bind(result.runId).first();
    assert.equal(run.status, 'failed');
    assert.ok(run.error_message && run.error_message.length > 0);
  });

  test('running the same report as a MORE restricted user yields fewer/no rows -- report definitions are not an authorization bypass', async () => {
    await db.prepare(`INSERT INTO report_definitions (id, name, report_type, owner_id) VALUES (3, 'Casino Report', 'casino_performance', ?)`).bind(fx.admin.user_id).run();
    for (const [casinoId, revenue] of [[fx.casinoA, 100], [fx.casinoB, 200], [fx.casinoC, 300]]) {
      await db.prepare(`
        INSERT INTO analytics_daily (date, dimension_type, dimension_id, revenue, currency)
        VALUES ('2026-01-15', 'casino', ?, ?, 'USD')
      `).bind(casinoId, revenue).run();
    }

    const asAdmin = await executeReportRun(db, fx.admin, { id: 3, report_type: 'casino_performance' }, { filters: { startDate: '2026-01-01', endDate: '2026-01-31' } });
    const asRestrictedEditor = await executeReportRun(db, fx.editorAssigned, { id: 3, report_type: 'casino_performance' }, { filters: { startDate: '2026-01-01', endDate: '2026-01-31' } });

    assert.equal(asAdmin.rows.length, 3);
    assert.equal(asRestrictedEditor.rows.length, 1);
    assert.equal(asRestrictedEditor.rows[0].dimensionId, fx.casinoA);
    // The SAME report_definitions row produced different, correctly
    // scoped results depending on who ran it -- confirming filters_json
    // (or the saved definition itself) is never the authorization
    // boundary, the requesting user always is.
  });
});

describe('runDueReportSchedules -- delivery failures are recorded, never silently dropped', () => {
  let db, fx, mockFetch;

  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    fx = await seedBaseFixtures(db);
    await db.prepare(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('report_schedules_cron_enabled', 'true')`).run();
  });

  afterEach(() => { if (mockFetch) globalThis.fetch = mockFetch; });

  test('a scheduled report with a failing email recipient records the failure via the audit log, run itself still succeeds', async () => {
    mockFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: false, status: 422, json: async () => ({ message: 'Invalid recipient' }) });

    await db.prepare(`INSERT INTO report_definitions (id, name, report_type, owner_id) VALUES (1, 'Sched Report', 'casino_performance', ?)`).bind(fx.admin.user_id).run();
    await db.prepare(`
      INSERT INTO report_schedules (id, report_id, frequency, timezone, next_run_at, enabled, output_format, created_by)
      VALUES (1, 1, 'daily', 'UTC', datetime('now', '-1 hour'), 1, 'csv', ?)
    `).bind(fx.admin.user_id).run();
    await db.prepare(`INSERT INTO report_recipients (schedule_id, email) VALUES (1, 'bad@example.com')`).run();

    const env = { DB: db, RESEND_API_KEY: 'k', RESEND_FROM_EMAIL: 'reports@example.com' };
    const result = await runDueReportSchedules(db, env);

    assert.equal(result.skipped, false);
    assert.equal(result.summary[0].success, true, 'the RUN itself succeeded -- only delivery failed');

    const run = await db.prepare(`SELECT * FROM report_runs WHERE report_id = 1`).first();
    assert.equal(run.status, 'success');

    const auditEntry = await db.prepare(`SELECT * FROM audit_logs WHERE action = 'delivery_failed'`).first();
    assert.ok(auditEntry, 'delivery failure must be recorded, not silently dropped');
    const metadata = JSON.parse(auditEntry.metadata);
    assert.equal(metadata.recipient, 'bad@example.com');
    assert.match(metadata.error, /Invalid recipient/);
  });
});
