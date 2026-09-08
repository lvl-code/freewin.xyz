// test/reports.test.js
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { seedBaseFixtures, insertEvent } from './support/fixtures.js';
import { runReport, isValidReportType, executeReportRun } from '../worker/database/reports.js';

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
