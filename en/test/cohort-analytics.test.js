// test/cohort-analytics.test.js

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { logEvent, recordConversion } from '../worker/database/analytics.js';
import { runReport } from '../worker/database/reports.js';

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

// recordConversion always stamps occurred_at = CURRENT_TIMESTAMP, so
// tests that need a SPECIFIC cohort date backdate it afterward via a
// direct UPDATE -- same workaround the reconciliation-alerts window
// bug taught us is necessary (occurred_at isn't settable via params).
async function backdateConversion(db, externalReference, occurredAt) {
  await db.prepare(`UPDATE analytics_conversions SET occurred_at = ? WHERE external_reference = ?`).bind(occurredAt, externalReference).run();
}

const admin = { user_id: 1, role: 'admin' };

describe('cohort_analysis: registration_to_ftd (brief §17)', () => {
  let db, graph;
  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    graph = await seedAffiliateGraph(db);
  });

  test('a registration followed by an FTD 3 days later is counted as converted, with the right avg_days_to_convert', async () => {
    await recordConversion(db, {
      clickId: 'c1', trackingLinkId: graph.trackingLinkId, casinoId: graph.casinoId, partnerId: graph.partnerId,
      programId: graph.programId, accountId: graph.accountId, conversionType: 'registration', status: 'confirmed',
      currency: 'USD', externalReference: 'REG-1'
    });
    await backdateConversion(db, 'REG-1', '2026-01-01 10:00:00');

    await recordConversion(db, {
      clickId: 'c1', trackingLinkId: graph.trackingLinkId, casinoId: graph.casinoId, partnerId: graph.partnerId,
      programId: graph.programId, accountId: graph.accountId, conversionType: 'ftd', status: 'confirmed',
      reportedValue: 100, currency: 'USD', externalReference: 'FTD-1'
    });
    await backdateConversion(db, 'FTD-1', '2026-01-04 10:00:00');

    const result = await runReport(db, admin, 'cohort_analysis', { startDate: '2026-01-01', endDate: '2026-01-01', cohortMetric: 'registration_to_ftd' });
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].cohort_date, '2026-01-01');
    assert.equal(result.rows[0].cohort_size, 1);
    assert.equal(result.rows[0].converted_count, 1);
    assert.equal(result.rows[0].conversion_rate_pct, 100);
    assert.equal(result.rows[0].avg_days_to_convert, 3);
  });

  test('a registration with NO later FTD shows converted_count 0 and avg_days_to_convert null (never 0 -- brief §29)', async () => {
    await recordConversion(db, {
      clickId: 'c2', trackingLinkId: graph.trackingLinkId, casinoId: graph.casinoId, partnerId: graph.partnerId,
      programId: graph.programId, accountId: graph.accountId, conversionType: 'registration', status: 'confirmed',
      currency: 'USD', externalReference: 'REG-2'
    });
    await backdateConversion(db, 'REG-2', '2026-01-01 10:00:00');

    const result = await runReport(db, admin, 'cohort_analysis', { startDate: '2026-01-01', endDate: '2026-01-01', cohortMetric: 'registration_to_ftd' });
    assert.equal(result.rows[0].cohort_size, 1);
    assert.equal(result.rows[0].converted_count, 0);
    assert.equal(result.rows[0].conversion_rate_pct, 0);
    assert.equal(result.rows[0].avg_days_to_convert, null);
  });

  test('cohort_date reflects the REGISTRATION date, not the later FTD date', async () => {
    await recordConversion(db, {
      clickId: 'c3', trackingLinkId: graph.trackingLinkId, casinoId: graph.casinoId, partnerId: graph.partnerId,
      programId: graph.programId, accountId: graph.accountId, conversionType: 'registration', status: 'confirmed',
      currency: 'USD', externalReference: 'REG-3'
    });
    await backdateConversion(db, 'REG-3', '2026-02-01 10:00:00');
    await recordConversion(db, {
      clickId: 'c3', trackingLinkId: graph.trackingLinkId, casinoId: graph.casinoId, partnerId: graph.partnerId,
      programId: graph.programId, accountId: graph.accountId, conversionType: 'ftd', status: 'confirmed',
      reportedValue: 50, currency: 'USD', externalReference: 'FTD-3'
    });
    await backdateConversion(db, 'FTD-3', '2026-02-20 10:00:00'); // outside the query's date range

    const result = await runReport(db, admin, 'cohort_analysis', { startDate: '2026-02-01', endDate: '2026-02-01', cohortMetric: 'registration_to_ftd' });
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].cohort_date, '2026-02-01');
    assert.equal(result.rows[0].converted_count, 1, 'the FTD should still be found even though it happened outside the cohort DATE range -- only the acquisition event is date-filtered');
  });

  test('grouping by GEO splits cohorts that landed on the same date in different countries', async () => {
    await recordConversion(db, { clickId: 'de1', trackingLinkId: graph.trackingLinkId, casinoId: graph.casinoId, partnerId: graph.partnerId, programId: graph.programId, accountId: graph.accountId, conversionType: 'registration', status: 'confirmed', currency: 'USD', countryCode: 'DE', externalReference: 'REG-DE' });
    await backdateConversion(db, 'REG-DE', '2026-03-01 10:00:00');
    await recordConversion(db, { clickId: 'fr1', trackingLinkId: graph.trackingLinkId, casinoId: graph.casinoId, partnerId: graph.partnerId, programId: graph.programId, accountId: graph.accountId, conversionType: 'registration', status: 'confirmed', currency: 'USD', countryCode: 'FR', externalReference: 'REG-FR' });
    await backdateConversion(db, 'REG-FR', '2026-03-01 11:00:00');

    const result = await runReport(db, admin, 'cohort_analysis', { startDate: '2026-03-01', endDate: '2026-03-01', cohortMetric: 'registration_to_ftd', groupByDimension: 'geo' });
    assert.equal(result.rows.length, 2);
    const geos = result.rows.map(r => r.country_code).sort();
    assert.deepEqual(geos, ['DE', 'FR']);
  });
});

describe('cohort_analysis: revenue_by_cohort (brief §17)', () => {
  let db, graph;
  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    graph = await seedAffiliateGraph(db);
  });

  test('revenue and commission are summed across ALL of a click_id\'s conversions, keyed by the acquisition date', async () => {
    await recordConversion(db, { clickId: 'c1', trackingLinkId: graph.trackingLinkId, casinoId: graph.casinoId, partnerId: graph.partnerId, programId: graph.programId, accountId: graph.accountId, conversionType: 'registration', status: 'confirmed', currency: 'USD', externalReference: 'R-1' });
    await backdateConversion(db, 'R-1', '2026-04-01 09:00:00');
    await recordConversion(db, { clickId: 'c1', trackingLinkId: graph.trackingLinkId, casinoId: graph.casinoId, partnerId: graph.partnerId, programId: graph.programId, accountId: graph.accountId, conversionType: 'ftd', status: 'confirmed', reportedValue: 100, currency: 'USD', externalReference: 'F-1' });
    await backdateConversion(db, 'F-1', '2026-04-05 09:00:00');
    await recordConversion(db, { clickId: 'c1', trackingLinkId: graph.trackingLinkId, casinoId: graph.casinoId, partnerId: graph.partnerId, programId: graph.programId, accountId: graph.accountId, conversionType: 'deposit', status: 'confirmed', reportedValue: 250, currency: 'USD', externalReference: 'D-1' });
    await backdateConversion(db, 'D-1', '2026-04-10 09:00:00');

    const result = await runReport(db, admin, 'cohort_analysis', { startDate: '2026-04-01', endDate: '2026-04-01', cohortMetric: 'revenue_by_cohort' });
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].cohort_date, '2026-04-01');
    assert.equal(result.rows[0].cohort_size, 1);
    assert.equal(result.rows[0].revenue, 350); // 100 + 250, registration itself has null reported_value
    assert.equal(result.rows[0].converted_count, null, 'registration_to_ftd-only fields must stay null on this metric, never a misleading 0');
  });

  test('permission scoping: a casino outside the caller\'s item-access is excluded from cohort results', async () => {
    await db.prepare(`INSERT INTO casinos (id, name, slug, website_url, affiliate_url, created_by) VALUES (201, 'Casino Y', 'casino-y', 'https://y.example', 'https://aff.example/y', 1)`).run();
    await recordConversion(db, { clickId: 'inA', trackingLinkId: graph.trackingLinkId, casinoId: graph.casinoId, partnerId: graph.partnerId, programId: graph.programId, accountId: graph.accountId, conversionType: 'registration', status: 'confirmed', currency: 'USD', externalReference: 'A-1' });
    await backdateConversion(db, 'A-1', '2026-05-01 09:00:00');
    await recordConversion(db, { clickId: 'inB', trackingLinkId: graph.trackingLinkId, casinoId: 201, partnerId: graph.partnerId, programId: graph.programId, accountId: graph.accountId, conversionType: 'registration', status: 'confirmed', currency: 'USD', externalReference: 'B-1' });
    await backdateConversion(db, 'B-1', '2026-05-01 09:00:00');

    await db.prepare(`INSERT INTO users (id, email, password_hash, role) VALUES (2, 'editor@test.local', 'x', 'editor')`).run();
    await db.prepare(`INSERT INTO user_item_access (user_id, resource, action, scope) VALUES (2, 'casinos', 'read', 'assigned')`).run();
    await db.prepare(`INSERT INTO item_access_assignments (user_id, resource, item_id) VALUES (2, 'casinos', ?)`).bind(graph.casinoId).run();

    const editor = { user_id: 2, role: 'editor' };
    const result = await runReport(db, editor, 'cohort_analysis', { startDate: '2026-05-01', endDate: '2026-05-01', cohortMetric: 'revenue_by_cohort' });
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].cohort_size, 1, 'only the assigned casino\'s registration should be counted, not both');
  });
});
