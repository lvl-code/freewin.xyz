// test/analytics-scoping.test.js
//
// The tests that matter most: does an editor scoped to one casino ever
// see another casino's numbers, even in an aggregate? And does a
// click_id with multiple same-day conversions inflate click counts
// (the fan-out bug fixed before Phase 7-9 shipped)?

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { seedBaseFixtures, insertEvent, insertConversion } from './support/fixtures.js';
import { getDimensionPerformance, getGeoPerformance, aggregateAnalyticsDaily } from '../worker/database/analytics.js';

describe('getDimensionPerformance -- leakage prevention', () => {
  let db, fx;

  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    fx = await seedBaseFixtures(db);

    // Seed analytics_daily directly (bypassing the aggregation job) --
    // one row per casino for a fixed date.
    for (const [casinoId, revenue] of [[fx.casinoA, 100], [fx.casinoB, 200], [fx.casinoC, 300]]) {
      await db.prepare(`
        INSERT INTO analytics_daily (date, dimension_type, dimension_id, page_views, clicks, conversions, revenue, commission, currency)
        VALUES ('2026-01-15', 'casino', ?, 1000, 100, 10, ?, 10, 'USD')
      `).bind(casinoId, revenue).run();
    }
  });

  test('admin sees all three casinos', async () => {
    const rows = await getDimensionPerformance(db, fx.admin, { dimensionType: 'casino', startDate: '2026-01-01', endDate: '2026-01-31' });
    assert.equal(rows.length, 3);
  });

  test('editor scoped to Casino A only sees Casino A -- not B or C, not in the row list, not in any total', async () => {
    const rows = await getDimensionPerformance(db, fx.editorAssigned, { dimensionType: 'casino', startDate: '2026-01-01', endDate: '2026-01-31' });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].dimensionId, fx.casinoA);
    assert.equal(rows[0].revenue, 100);

    // The critical leakage check: total revenue across returned rows
    // must NOT include Casino B's 200 or Casino C's 300.
    const totalRevenue = rows.reduce((sum, r) => sum + r.revenue, 0);
    assert.equal(totalRevenue, 100, 'total leaked revenue from an inaccessible casino');
  });

  test('editor with "none" scope sees zero rows, not an error, not all rows', async () => {
    const rows = await getDimensionPerformance(db, fx.editorNone, { dimensionType: 'casino', startDate: '2026-01-01', endDate: '2026-01-31' });
    assert.equal(rows.length, 0);
  });

  test('editor cannot see another casino\'s data by requesting a wider date range or no currency filter', async () => {
    // Simulates someone trying to "work around" scoping by varying
    // filters rather than the dimension itself.
    const rows = await getDimensionPerformance(db, fx.editorAssigned, { dimensionType: 'casino', startDate: '2020-01-01', endDate: '2030-01-01' });
    const ids = rows.map(r => r.dimensionId);
    assert.ok(!ids.includes(fx.casinoB), 'Casino B leaked via wide date range');
    assert.ok(!ids.includes(fx.casinoC), 'Casino C leaked via wide date range');
  });
});

describe('getGeoPerformance / aggregation -- fan-out regression', () => {
  let db, fx;

  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    fx = await seedBaseFixtures(db);
  });

  test('a click_id with TWO same-day conversions does not double-count the click in GEO performance', async () => {
    const clickId = 'click-fanout-test';
    await insertEvent(db, { eventType: 'TRACKING_LINK_CLICK', casinoId: fx.casinoA, clickId, occurredAt: '2026-01-15 10:00:00' });
    // Two conversions off the SAME click (e.g. registration + FTD)
    await insertConversion(db, { casinoId: fx.casinoA, clickId, reportedValue: 50, calculatedCommission: 5, occurredAt: '2026-01-15 10:05:00' });
    await insertConversion(db, { casinoId: fx.casinoA, clickId, reportedValue: 100, calculatedCommission: 10, occurredAt: '2026-01-15 10:10:00' });

    const rows = await getGeoPerformance(db, fx.admin, { startDate: '2026-01-01', endDate: '2026-01-31' });
    // Only ONE click event exists -- a naive JOIN would have fanned
    // this out to 2 (one per matching conversion row).
    const total = rows.reduce((sum, r) => sum + r.clicks, 0);
    assert.equal(total, 1, `expected exactly 1 click, fan-out bug would produce 2 (got ${total})`);

    // But both conversions/revenue amounts should still be fully counted.
    const totalConversions = rows.reduce((sum, r) => sum + r.conversions, 0);
    const totalRevenue = rows.reduce((sum, r) => sum + r.revenue, 0);
    assert.equal(totalConversions, 2);
    assert.equal(totalRevenue, 150);
  });

  test('aggregateAnalyticsDaily is idempotent -- running it twice for the same day does not double the totals', async () => {
    await db.prepare(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('analytics_aggregation_cron_enabled', 'true')`).run();

    const clickId = 'click-idempotent-test';
    await insertEvent(db, { eventType: 'CASINO_VIEW', casinoId: fx.casinoA, occurredAt: '2026-01-15 09:00:00' });
    await insertEvent(db, { eventType: 'TRACKING_LINK_CLICK', casinoId: fx.casinoA, clickId, occurredAt: '2026-01-15 10:00:00' });
    await insertConversion(db, { casinoId: fx.casinoA, clickId, reportedValue: 75, calculatedCommission: 7.5, occurredAt: '2026-01-15 10:05:00' });

    await aggregateAnalyticsDaily(db, { date: '2026-01-15' });
    const firstRun = await db.prepare(`SELECT * FROM analytics_daily WHERE dimension_type = 'casino' AND dimension_id = ? AND date = '2026-01-15'`).bind(fx.casinoA).first();

    await aggregateAnalyticsDaily(db, { date: '2026-01-15' }); // run again
    const secondRun = await db.prepare(`SELECT * FROM analytics_daily WHERE dimension_type = 'casino' AND dimension_id = ? AND date = '2026-01-15'`).bind(fx.casinoA).first();

    assert.equal(secondRun.clicks, firstRun.clicks, 'clicks doubled on re-run');
    assert.equal(secondRun.revenue, firstRun.revenue, 'revenue doubled on re-run');
    assert.equal(secondRun.clicks, 1);
    assert.equal(secondRun.revenue, 75);

    // Only one row should exist for this (date, dimension_type,
    // dimension_id, currency) -- the UNIQUE index + ON CONFLICT UPDATE
    // must have upserted, not inserted a duplicate.
    const count = await db.prepare(`SELECT COUNT(*) AS c FROM analytics_daily WHERE dimension_type = 'casino' AND dimension_id = ? AND date = '2026-01-15'`).bind(fx.casinoA).first();
    assert.equal(count.c, 1);
  });

  test('aggregation is disabled by default (feature flag off) and produces no rows', async () => {
    // No system_settings row inserted -- flag defaults to absent/off.
    await insertEvent(db, { eventType: 'CASINO_VIEW', casinoId: fx.casinoA, occurredAt: '2026-01-15 09:00:00' });
    const result = await aggregateAnalyticsDaily(db, { date: '2026-01-15' });
    assert.equal(result.skipped, true);
    const row = await db.prepare(`SELECT * FROM analytics_daily WHERE dimension_type = 'casino' AND dimension_id = ?`).bind(fx.casinoA).first();
    assert.equal(row, null);
  });
});
