// test/super-api-analytics.test.js
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { seedBaseFixtures } from './support/fixtures.js';
import { handleAnalyticsOverview, handleAnalyticsRevenue, handleTrackingHealth } from '../worker/super/handlers-analytics.js';

// These handlers take (request, env) matching the Super API router's
// call signature -- env.DB is all they actually read from the "env".
function fakeRequest(url) {
  return new Request(url);
}

describe('Super API analytics handlers -- tenant-wide aggregate, never raw events', () => {
  let db, fx, env;
  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    fx = await seedBaseFixtures(db);
    env = { DB: db };
  });

  test('handleAnalyticsOverview requires start_date/end_date', async () => {
    const res = await handleAnalyticsOverview(fakeRequest('https://x/en/api/super/analytics-overview'), env);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  test('handleAnalyticsOverview returns ALL casinos tenant-wide (Super API bypasses item-access, same as every other existing Super API handler)', async () => {
    for (const [casinoId, revenue] of [[fx.casinoA, 100], [fx.casinoB, 200], [fx.casinoC, 300]]) {
      await db.prepare(`
        INSERT INTO analytics_daily (date, dimension_type, dimension_id, revenue, currency)
        VALUES ('2026-01-15', 'casino', ?, ?, 'USD')
      `).bind(casinoId, revenue).run();
    }

    const res = await handleAnalyticsOverview(
      fakeRequest('https://x/en/api/super/analytics-overview?start_date=2026-01-01&end_date=2026-01-31'), env
    );
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.rows.length, 3, 'Super API should see all 3 casinos tenant-wide, not scoped to any one editor');
  });

  test('handleAnalyticsRevenue REQUIRES a currency -- never silently sums across currencies', async () => {
    const res = await handleAnalyticsRevenue(
      fakeRequest('https://x/en/api/super/analytics-revenue?start_date=2026-01-01&end_date=2026-01-31'), env
    );
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.error, /currency/i);
  });

  test('handleAnalyticsRevenue returns a real time series when currency is provided', async () => {
    await db.prepare(`
      INSERT INTO analytics_daily (date, dimension_type, dimension_id, revenue, currency)
      VALUES ('2026-01-15', 'casino', ?, 150, 'USD')
    `).bind(fx.casinoA).run();

    const res = await handleAnalyticsRevenue(
      fakeRequest('https://x/en/api/super/analytics-revenue?start_date=2026-01-01&end_date=2026-01-31&currency=USD'), env
    );
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.currency, 'USD');
    assert.ok(body.series.some(p => p.revenue === 150));
  });

  test('handleTrackingHealth summarizes status counts, never the raw check-history table', async () => {
    await db.prepare(`
      INSERT INTO tracking_links (id, internal_name, tracking_code, destination_url, casino_id, health_status, created_by)
      VALUES (1, 'Link A', 'code-a', 'https://example.com/aff', ?, 'broken', 1)
    `).bind(fx.casinoA).run();

    const res = await handleTrackingHealth(fakeRequest('https://x/en/api/super/tracking-health'), env);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.counts.broken, 1);
    assert.equal(body.unhealthy_links[0].name, 'Link A');
    // The response shape has no raw check-log fields (timestamps of
    // every individual check, response bodies, etc.) -- just current
    // status, matching the "summarized, not raw table access" contract.
    assert.equal('checks' in body, false);
  });
});
