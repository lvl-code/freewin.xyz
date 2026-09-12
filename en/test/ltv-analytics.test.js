// test/ltv-analytics.test.js

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { recordConversion } from '../worker/database/analytics.js';
import { normalizeConversionPayload } from '../worker/postback/field-mapping.js';
import { ingestPostback } from '../worker/postback/ingest.js';
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

async function backdateConversion(db, externalReference, occurredAt) {
  await db.prepare(`UPDATE analytics_conversions SET occurred_at = ? WHERE external_reference = ?`).bind(occurredAt, externalReference).run();
}

const admin = { user_id: 1, role: 'admin' };

describe('field mapping: external_player_id (brief §18)', () => {
  test('default aliases pick up player_id/customer_id/user_id', () => {
    assert.equal(normalizeConversionPayload({ player_id: 'p1' }).external_player_id, 'p1');
    assert.equal(normalizeConversionPayload({ customer_id: 'c1' }).external_player_id, 'c1');
    assert.equal(normalizeConversionPayload({ user_id: 'u1' }).external_player_id, 'u1');
  });

  test('absent when the provider sends nothing -- never fabricated', () => {
    assert.equal(normalizeConversionPayload({ click_id: 'abc' }).external_player_id, null);
  });
});

describe('ingestPostback persists external_player_id end-to-end', () => {
  let db, graph;
  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    graph = await seedAffiliateGraph(db);
  });

  test('a postback carrying player_id stores it on the conversion row', async () => {
    const config = { account_id: graph.accountId, program_id: graph.programId };
    const normalized = normalizeConversionPayload({ external_reference: 'GG-1', conversion_type: 'ftd', status: 'confirmed', reported_value: 100, currency: 'USD', player_id: 'player-42' });
    await ingestPostback(db, { config, normalized, source: 'postback' });

    const row = await db.prepare(`SELECT external_player_id FROM analytics_conversions WHERE external_reference = 'GG-1'`).first();
    assert.equal(row.external_player_id, 'player-42');
  });
});

describe('ltv_analysis report (brief §18, §29)', () => {
  let db, graph;
  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    graph = await seedAffiliateGraph(db);
  });

  test('a tenant with ZERO external_player_id data anywhere gets the honest "not available" row, not an empty table', async () => {
    await recordConversion(db, {
      trackingLinkId: graph.trackingLinkId, casinoId: graph.casinoId, partnerId: graph.partnerId,
      programId: graph.programId, accountId: graph.accountId, conversionType: 'ftd', status: 'confirmed',
      reportedValue: 100, currency: 'USD', externalReference: 'NO-PLAYER-1'
    });

    const result = await runReport(db, admin, 'ltv_analysis', { startDate: '2020-01-01', endDate: '2030-01-01' });
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].external_player_id, null);
    assert.equal(result.rows[0].total_revenue, null, 'numeric columns must be null, never a misleading 0, on the capability-missing row');
    assert.match(result.rows[0].note, /No player-level data available/);
  });

  test('a tenant WITH player data but none acquired in the requested range gets genuinely empty rows (a real zero, not "unavailable")', async () => {
    await recordConversion(db, {
      trackingLinkId: graph.trackingLinkId, casinoId: graph.casinoId, partnerId: graph.partnerId,
      programId: graph.programId, accountId: graph.accountId, conversionType: 'ftd', status: 'confirmed',
      reportedValue: 100, currency: 'USD', externalReference: 'P-OLD', externalPlayerId: 'player-1'
    });
    await backdateConversion(db, 'P-OLD', '2020-06-01 10:00:00');

    const result = await runReport(db, admin, 'ltv_analysis', { startDate: '2025-01-01', endDate: '2025-01-31' });
    assert.equal(result.rows.length, 0, 'no synthetic note row here -- the capability exists, this scope/period is just genuinely empty');
  });

  test('per-player rollup: ftd_value, deposit_value, and total_revenue/commission are computed correctly', async () => {
    await recordConversion(db, {
      trackingLinkId: graph.trackingLinkId, casinoId: graph.casinoId, partnerId: graph.partnerId,
      programId: graph.programId, accountId: graph.accountId, conversionType: 'ftd', status: 'confirmed',
      reportedValue: 100, currency: 'USD', externalReference: 'P1-FTD', externalPlayerId: 'player-1'
    });
    await backdateConversion(db, 'P1-FTD', '2026-01-01 09:00:00');
    await recordConversion(db, {
      trackingLinkId: graph.trackingLinkId, casinoId: graph.casinoId, partnerId: graph.partnerId,
      programId: graph.programId, accountId: graph.accountId, conversionType: 'deposit', status: 'confirmed',
      reportedValue: 250, currency: 'USD', externalReference: 'P1-DEP', externalPlayerId: 'player-1'
    });
    await backdateConversion(db, 'P1-DEP', '2026-01-05 09:00:00');

    const result = await runReport(db, admin, 'ltv_analysis', { startDate: '2026-01-01', endDate: '2026-01-01' });
    assert.equal(result.rows.length, 1);
    const row = result.rows[0];
    assert.equal(row.external_player_id, 'player-1');
    assert.equal(row.ftd_value, 100);
    assert.equal(row.deposit_value, 250);
    assert.equal(row.total_revenue, 350);
    assert.equal(row.note, null);
  });

  test('revenue_7d / revenue_30d windows are measured from first_seen_at, with correct boundary behavior', async () => {
    await recordConversion(db, {
      trackingLinkId: graph.trackingLinkId, casinoId: graph.casinoId, partnerId: graph.partnerId,
      programId: graph.programId, accountId: graph.accountId, conversionType: 'registration', status: 'confirmed',
      currency: 'USD', externalReference: 'P2-REG', externalPlayerId: 'player-2'
    });
    await backdateConversion(db, 'P2-REG', '2026-02-01 00:00:00');

    // Inside the 7-day window (day 5)
    await recordConversion(db, {
      trackingLinkId: graph.trackingLinkId, casinoId: graph.casinoId, partnerId: graph.partnerId,
      programId: graph.programId, accountId: graph.accountId, conversionType: 'deposit', status: 'confirmed',
      reportedValue: 50, currency: 'USD', externalReference: 'P2-D1', externalPlayerId: 'player-2'
    });
    await backdateConversion(db, 'P2-D1', '2026-02-06 00:00:00');

    // Outside 7-day, inside 30-day (day 20)
    await recordConversion(db, {
      trackingLinkId: graph.trackingLinkId, casinoId: graph.casinoId, partnerId: graph.partnerId,
      programId: graph.programId, accountId: graph.accountId, conversionType: 'deposit', status: 'confirmed',
      reportedValue: 70, currency: 'USD', externalReference: 'P2-D2', externalPlayerId: 'player-2'
    });
    await backdateConversion(db, 'P2-D2', '2026-02-21 00:00:00');

    // Outside 30-day (day 45)
    await recordConversion(db, {
      trackingLinkId: graph.trackingLinkId, casinoId: graph.casinoId, partnerId: graph.partnerId,
      programId: graph.programId, accountId: graph.accountId, conversionType: 'deposit', status: 'confirmed',
      reportedValue: 90, currency: 'USD', externalReference: 'P2-D3', externalPlayerId: 'player-2'
    });
    await backdateConversion(db, 'P2-D3', '2026-03-18 00:00:00');

    const result = await runReport(db, admin, 'ltv_analysis', { startDate: '2026-02-01', endDate: '2026-02-01' });
    const row = result.rows[0];
    assert.equal(row.revenue_7d, 50, 'only the day-5 deposit falls within 7 days of acquisition');
    assert.equal(row.revenue_30d, 120, 'day-5 and day-20 deposits both fall within 30 days');
    assert.equal(row.total_revenue, 210, 'all three deposits count toward lifetime-to-date revenue regardless of window');
  });

  test('permission scoping: an editor limited to one casino never sees another casino\'s players', async () => {
    await db.prepare(`INSERT INTO casinos (id, name, slug, website_url, affiliate_url, created_by) VALUES (201, 'Casino Y', 'casino-y', 'https://y.example', 'https://aff.example/y', 1)`).run();

    await recordConversion(db, {
      trackingLinkId: graph.trackingLinkId, casinoId: graph.casinoId, partnerId: graph.partnerId,
      programId: graph.programId, accountId: graph.accountId, conversionType: 'ftd', status: 'confirmed',
      reportedValue: 100, currency: 'USD', externalReference: 'A-1', externalPlayerId: 'player-a'
    });
    await backdateConversion(db, 'A-1', '2026-04-01 09:00:00');
    await recordConversion(db, {
      trackingLinkId: graph.trackingLinkId, casinoId: 201, partnerId: graph.partnerId,
      programId: graph.programId, accountId: graph.accountId, conversionType: 'ftd', status: 'confirmed',
      reportedValue: 200, currency: 'USD', externalReference: 'B-1', externalPlayerId: 'player-b'
    });
    await backdateConversion(db, 'B-1', '2026-04-01 09:00:00');

    await db.prepare(`INSERT INTO users (id, email, password_hash, role) VALUES (2, 'editor@test.local', 'x', 'editor')`).run();
    await db.prepare(`INSERT INTO user_item_access (user_id, resource, action, scope) VALUES (2, 'casinos', 'read', 'assigned')`).run();
    await db.prepare(`INSERT INTO item_access_assignments (user_id, resource, item_id) VALUES (2, 'casinos', ?)`).bind(graph.casinoId).run();

    const editor = { user_id: 2, role: 'editor' };
    const result = await runReport(db, editor, 'ltv_analysis', { startDate: '2026-04-01', endDate: '2026-04-01' });
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].external_player_id, 'player-a');
  });
});
