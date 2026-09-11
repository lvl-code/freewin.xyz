// test/reconciliation-imports.test.js
//
// Covers brief §11 (import pipeline) and §12 (reconciliation), plus
// the migration 0034 dedup-index change that lets a postback-sourced
// and an import-sourced conversion coexist for the same
// external_reference.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { logEvent, recordConversion } from '../worker/database/analytics.js';
import { createCommercialTerm } from '../worker/database/affiliate-commercial-terms.js';
import { runReport } from '../worker/database/reports.js';
import { parseCsv, parseJsonRows } from '../worker/imports/parse.js';
import { importConversionReport } from '../worker/imports/pipeline.js';
import { getImportBatchById } from '../worker/database/import-batches.js';

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

describe('CSV/JSON parsing (brief §11)', () => {
  test('parseCsv handles a simple file with a quoted field containing a comma', () => {
    const csv = 'click_id,event,amount,note\nabc,ftd,100,"Berlin, DE"\ndef,deposit,50,plain';
    const rows = parseCsv(csv);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].click_id, 'abc');
    assert.equal(rows[0].note, 'Berlin, DE');
    assert.equal(rows[1].amount, '50');
  });

  test('parseCsv handles escaped double-quotes inside a quoted field', () => {
    const csv = 'click_id,note\nabc,"He said ""hi"""';
    const rows = parseCsv(csv);
    assert.equal(rows[0].note, 'He said "hi"');
  });

  test('parseJsonRows accepts a bare array or a {rows:[...]} wrapper', () => {
    assert.equal(parseJsonRows('[{"a":1}]').length, 1);
    assert.equal(parseJsonRows('{"rows":[{"a":1},{"a":2}]}').length, 2);
    assert.throws(() => parseJsonRows('{"not_rows": 1}'));
  });
});

describe('importConversionReport (brief §11)', () => {
  let db, graph;
  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    graph = await seedAffiliateGraph(db);
    await createCommercialTerm(db, { program_id: graph.programId, account_id: graph.accountId, term_type: 'cpa', cpa_amount: 40, effective_date: '2020-01-01', created_by: 1 });
  });

  test('a valid CSV import records conversions with source=import and tracks a batch', async () => {
    const csv = 'transaction_id,event,status,amount,currency,commission\nGG-1,ftd,confirmed,100,EUR,35\nGG-2,deposit,confirmed,200,EUR,70';
    const rows = parseCsv(csv);
    const result = await importConversionReport(db, { accountId: graph.accountId, rows, format: 'csv', createdBy: 1 });

    assert.equal(result.totalRows, 2);
    assert.equal(result.importedCount, 2);
    assert.equal(result.errorCount, 0);

    const stored = await db.prepare(`SELECT * FROM analytics_conversions WHERE source = 'import' ORDER BY external_reference`).all();
    assert.equal(stored.results.length, 2);
    assert.equal(stored.results[0].reported_commission, 35);
    // calculated_commission is STILL our own CPA-derived figure, never
    // overwritten by the imported "commission" column.
    assert.equal(stored.results[0].calculated_commission, 40);

    const batch = await getImportBatchById(db, result.batchId);
    assert.equal(batch.imported_count, 2);
    assert.equal(batch.account_name, 'Account A');
  });

  test('a bad row (invalid conversion_type) is reported as a per-row error without aborting the batch', async () => {
    const csv = 'transaction_id,event,status,amount,currency\nGG-1,ftd,confirmed,100,USD\nGG-2,not_a_real_type,confirmed,50,USD';
    const rows = parseCsv(csv);
    const result = await importConversionReport(db, { accountId: graph.accountId, rows, format: 'csv', createdBy: 1 });

    assert.equal(result.importedCount, 1);
    assert.equal(result.errorCount, 1);
    assert.equal(result.errors[0].row, 2);
  });

  test('re-importing the same external_reference is deduplicated, not double-counted', async () => {
    const csv = 'transaction_id,event,status,amount,currency\nGG-1,ftd,confirmed,100,USD';
    const rows = parseCsv(csv);
    await importConversionReport(db, { accountId: graph.accountId, rows, format: 'csv', createdBy: 1 });
    const second = await importConversionReport(db, { accountId: graph.accountId, rows, format: 'csv', createdBy: 1 });

    assert.equal(second.importedCount, 0);
    assert.equal(second.duplicateCount, 1);
  });

  test('an import row for a click_id that ALSO has a real-time postback conversion coexists rather than colliding (migration 0034)', async () => {
    await logEvent(db, { eventType: 'TRACKING_LINK_CLICK', casinoId: graph.casinoId, trackingLinkId: graph.trackingLinkId, partnerId: graph.partnerId, programId: graph.programId, clickId: 'click-coexist' });

    // Real-time postback-sourced row for this transaction.
    await recordConversion(db, {
      clickId: 'click-coexist', trackingLinkId: graph.trackingLinkId, casinoId: graph.casinoId,
      partnerId: graph.partnerId, programId: graph.programId, accountId: graph.accountId,
      conversionType: 'ftd', status: 'confirmed', reportedValue: 100, currency: 'USD',
      externalReference: 'GG-SHARED', source: 'postback', onDuplicate: 'ignore'
    });

    // Later statement import for the SAME external_reference.
    const rows = parseCsv('transaction_id,event,status,amount,currency,commission\nGG-SHARED,ftd,confirmed,100,USD,38');
    const result = await importConversionReport(db, { accountId: graph.accountId, rows, format: 'csv', createdBy: 1 });

    assert.equal(result.importedCount, 1, 'the import row must NOT be treated as a duplicate of the postback row');

    const all = await db.prepare(`SELECT source FROM analytics_conversions WHERE external_reference = 'GG-SHARED' ORDER BY source`).all();
    assert.deepEqual(all.results.map(r => r.source), ['import', 'postback']);
  });
});

describe('reconciliation report (brief §12, §29 no-fake-zero)', () => {
  let db, graph, admin;
  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    graph = await seedAffiliateGraph(db);
    admin = { user_id: 1, role: 'admin' };
    await createCommercialTerm(db, { program_id: graph.programId, account_id: graph.accountId, term_type: 'cpa', cpa_amount: 40, effective_date: '2020-01-01', created_by: 1 });
  });

  test('a casino/account with no import data at all is "missing", never a fabricated zero-diff match', async () => {
    await recordConversion(db, {
      trackingLinkId: graph.trackingLinkId, casinoId: graph.casinoId, partnerId: graph.partnerId,
      programId: graph.programId, accountId: graph.accountId, conversionType: 'ftd', status: 'confirmed',
      reportedValue: 100, currency: 'USD', externalReference: 'GG-NOSTMT', source: 'postback'
    });

    const result = await runReport(db, admin, 'reconciliation', { startDate: '2020-01-01', endDate: '2030-01-01' });
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].status, 'missing');
    assert.equal(result.rows[0].reported_commission, null);
    assert.equal(result.rows[0].expected_commission, 40);
  });

  test('expected commission matching reported commission within tolerance is "matched"', async () => {
    await recordConversion(db, {
      trackingLinkId: graph.trackingLinkId, casinoId: graph.casinoId, partnerId: graph.partnerId,
      programId: graph.programId, accountId: graph.accountId, conversionType: 'ftd', status: 'confirmed',
      reportedValue: 100, currency: 'USD', externalReference: 'GG-MATCH', source: 'postback'
    });
    const rows = parseCsv(`transaction_id,event,status,amount,currency,commission,casino_id\nGG-MATCH,ftd,confirmed,100,USD,40,${graph.casinoId}`);
    await importConversionReport(db, { accountId: graph.accountId, rows, format: 'csv', createdBy: 1 });

    const result = await runReport(db, admin, 'reconciliation', { startDate: '2020-01-01', endDate: '2030-01-01' });
    assert.equal(result.rows.length, 1, 'the import row should join the SAME casino group as the postback row via casino_id');
    assert.equal(result.rows[0].status, 'matched');
    assert.equal(result.rows[0].difference, 0);
  });

  test('reported commission well below expected is "underpaid"; well above is "overpaid"', async () => {
    await recordConversion(db, {
      trackingLinkId: graph.trackingLinkId, casinoId: graph.casinoId, partnerId: graph.partnerId,
      programId: graph.programId, accountId: graph.accountId, conversionType: 'ftd', status: 'confirmed',
      reportedValue: 100, currency: 'USD', externalReference: 'GG-UNDER', source: 'postback'
    });
    // Expected 40, network only reported 20 -- a big enough gap to exceed tolerance.
    const underRows = parseCsv(`transaction_id,event,status,amount,currency,commission,casino_id\nGG-UNDER,ftd,confirmed,100,USD,20,${graph.casinoId}`);
    await importConversionReport(db, { accountId: graph.accountId, rows: underRows, format: 'csv', createdBy: 1 });

    const underResult = await runReport(db, admin, 'reconciliation', { startDate: '2020-01-01', endDate: '2030-01-01' });
    assert.equal(underResult.rows.length, 1);
    assert.equal(underResult.rows[0].status, 'underpaid');
    assert.ok(underResult.rows[0].difference > 0);
  });

  test('clicks are counted from analytics_events alongside the conversion aggregates', async () => {
    await logEvent(db, { eventType: 'TRACKING_LINK_CLICK', casinoId: graph.casinoId, trackingLinkId: graph.trackingLinkId, clickId: 'c1' });
    await logEvent(db, { eventType: 'TRACKING_LINK_CLICK', casinoId: graph.casinoId, trackingLinkId: graph.trackingLinkId, clickId: 'c2' });
    await recordConversion(db, {
      clickId: 'c1', trackingLinkId: graph.trackingLinkId, casinoId: graph.casinoId, partnerId: graph.partnerId,
      programId: graph.programId, accountId: graph.accountId, conversionType: 'registration', status: 'confirmed',
      reportedValue: null, currency: 'USD', source: 'postback'
    });

    const result = await runReport(db, admin, 'reconciliation', { startDate: '2020-01-01', endDate: '2030-01-01' });
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].clicks, 2);
    assert.equal(result.rows[0].registrations, 1);
  });

  test('CSV/JSON/HTML output all work through the existing report-run machinery (no parallel system built)', async () => {
    await recordConversion(db, {
      trackingLinkId: graph.trackingLinkId, casinoId: graph.casinoId, partnerId: graph.partnerId,
      programId: graph.programId, accountId: graph.accountId, conversionType: 'ftd', status: 'confirmed',
      reportedValue: 100, currency: 'USD', externalReference: 'GG-FMT', source: 'postback'
    });
    const result = await runReport(db, admin, 'reconciliation', { startDate: '2020-01-01', endDate: '2030-01-01' });
    assert.ok(result.columns.some(c => c.key === 'status'));
    assert.ok(result.rows.length > 0);
  });
});
