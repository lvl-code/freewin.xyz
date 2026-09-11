// test/postback.test.js
//
// Covers brief §28's postback-relevant scenarios: click_id generation/
// attribution, postback authentication (valid + invalid), valid
// conversion, duplicate conversion, unattributed conversion, CPA/
// RevShare/Hybrid calculation, commercial-term precedence (incl. GEO),
// and the cross-account "program_mismatch" security boundary.
//
// Talks to the real worker modules (not reimplemented test doubles)
// through the D1 shim, same convention as every other test file here.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { logEvent, getClickAttribution, recordConversion } from '../worker/database/analytics.js';
import { createCommercialTerm } from '../worker/database/affiliate-commercial-terms.js';
import { createPostbackConfig, getActiveConfigByToken } from '../worker/database/postback-configs.js';
import { verifyPostbackAuth } from '../worker/postback/auth.js';
import { normalizeConversionPayload, validateNormalized } from '../worker/postback/field-mapping.js';
import { ingestPostback } from '../worker/postback/ingest.js';

// Minimal affiliate graph: one partner -> one program -> two accounts
// (so program_mismatch has something real to fail against), one
// casino, one tracking link carrying partner_id/program_id (exactly
// what worker/controllers.js now writes onto analytics_events).
async function seedAffiliateGraph(db) {
  await db.prepare(`INSERT INTO users (id, email, password_hash, role) VALUES (1, 'admin@test.local', 'x', 'admin')`).run();
  await db.prepare(`INSERT INTO affiliate_partners (id, name, slug, status, created_by) VALUES (1, 'Partner A', 'partner-a', 'active', 1)`).run();
  await db.prepare(`INSERT INTO affiliate_programs (id, partner_id, name, status, created_by) VALUES (10, 1, 'Program A', 'active', 1)`).run();
  await db.prepare(`INSERT INTO affiliate_programs (id, partner_id, name, status, created_by) VALUES (11, 1, 'Program B', 'active', 1)`).run();
  await db.prepare(`INSERT INTO affiliate_accounts (id, program_id, account_name, status, credential_reference, created_by) VALUES (100, 10, 'Account A', 'active', 'POSTBACK_SECRET_A', 1)`).run();
  await db.prepare(`INSERT INTO affiliate_accounts (id, program_id, account_name, status, credential_reference, created_by) VALUES (101, 11, 'Account B', 'active', 'POSTBACK_SECRET_B', 1)`).run();
  await db.prepare(`INSERT INTO casinos (id, name, slug, website_url, affiliate_url, created_by) VALUES (200, 'Casino X', 'casino-x', 'https://x.example', 'https://aff.example/x', 1)`).run();
  await db.prepare(`
    INSERT INTO tracking_links (id, internal_name, tracking_code, destination_url, casino_id, partner_id, program_id, status)
    VALUES (300, 'Program A link', 'proga-link', 'https://out.example/a', 200, 1, 10, 'active')
  `).run();
  return { partnerId: 1, programAId: 10, programBId: 11, accountAId: 100, accountBId: 101, casinoId: 200, trackingLinkId: 300 };
}

describe('click attribution -- exact click_id match only (brief §6)', () => {
  let db;
  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    await seedAffiliateGraph(db);
  });

  test('a real click is found by click_id, with partner/program carried from the tracking link', async () => {
    await logEvent(db, {
      eventType: 'TRACKING_LINK_CLICK', casinoId: 200, trackingLinkId: 300,
      partnerId: 1, programId: 10, countryCode: 'DE', clickId: 'click-abc123'
    });

    const attribution = await getClickAttribution(db, 'click-abc123');
    assert.ok(attribution, 'expected a match');
    assert.equal(attribution.tracking_link_id, 300);
    assert.equal(attribution.casino_id, 200);
    assert.equal(attribution.partner_id, 1);
    assert.equal(attribution.program_id, 10);
    assert.equal(attribution.country_code, 'DE');
  });

  test('an unknown click_id resolves to null -- never guessed via time-window or last-touch', async () => {
    await logEvent(db, { eventType: 'TRACKING_LINK_CLICK', casinoId: 200, trackingLinkId: 300, clickId: 'click-real' });
    const attribution = await getClickAttribution(db, 'click-does-not-exist');
    assert.equal(attribution, null);
  });

  test('a null click_id short-circuits to null without querying', async () => {
    assert.equal(await getClickAttribution(db, null), null);
  });
});

describe('postback authentication (brief §5)', () => {
  const env = { POSTBACK_SECRET_A: 'shh-a-secret', POSTBACK_SECRET_B: 'shh-b-secret' };

  test('hmac_sha256: correct signature over the raw body verifies', async () => {
    const config = { auth_method: 'hmac_sha256', credential_reference: 'POSTBACK_SECRET_A', signature_param: 'sig', timestamp_param: null };
    const rawBody = JSON.stringify({ click_id: 'abc', event: 'ftd', amount: 100 });

    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('shh-a-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
    const sig = Array.from(new Uint8Array(sigBytes), b => b.toString(16).padStart(2, '0')).join('');

    const result = await verifyPostbackAuth(env, config, { rawParams: { sig }, rawBody, sourceIp: '1.2.3.4' });
    assert.equal(result.valid, true);
  });

  test('hmac_sha256: tampered body fails signature verification', async () => {
    const config = { auth_method: 'hmac_sha256', credential_reference: 'POSTBACK_SECRET_A', signature_param: 'sig', timestamp_param: null };
    const result = await verifyPostbackAuth(env, config, { rawParams: { sig: 'deadbeef'.repeat(8) }, rawBody: '{"tampered":true}', sourceIp: '1.2.3.4' });
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'signature_mismatch');
  });

  test('shared_secret: correct secret verifies, wrong secret is rejected without leaking why', async () => {
    const config = { auth_method: 'shared_secret', credential_reference: 'POSTBACK_SECRET_A', signature_param: 'secret' };
    const ok = await verifyPostbackAuth(env, config, { rawParams: { secret: 'shh-a-secret' }, rawBody: '', sourceIp: null });
    assert.equal(ok.valid, true);

    const bad = await verifyPostbackAuth(env, config, { rawParams: { secret: 'guessed' }, rawBody: '', sourceIp: null });
    assert.equal(bad.valid, false);
    assert.equal(bad.reason, 'secret_mismatch');
  });

  test('an unconfigured/missing credential fails closed, never treated as "no auth required"', async () => {
    const config = { auth_method: 'shared_secret', credential_reference: 'MISSING_ENV_KEY', signature_param: 'secret' };
    const result = await verifyPostbackAuth(env, config, { rawParams: { secret: 'anything' }, rawBody: '', sourceIp: null });
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'credential_not_configured');
  });

  test('IP allowlist rejects a source IP outside the configured list', async () => {
    const config = { auth_method: 'shared_secret', credential_reference: 'POSTBACK_SECRET_A', signature_param: 'secret', allowed_ips: JSON.stringify(['9.9.9.9']) };
    const result = await verifyPostbackAuth(env, config, { rawParams: { secret: 'shh-a-secret' }, rawBody: '', sourceIp: '1.2.3.4' });
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'ip_not_allowlisted');
  });

  test('timestamp outside tolerance window is rejected (replay protection)', async () => {
    const config = { auth_method: 'shared_secret', credential_reference: 'POSTBACK_SECRET_A', signature_param: 'secret', timestamp_param: 'ts', timestamp_tolerance_seconds: 60 };
    const staleTs = Math.floor((Date.now() - 10 * 60 * 1000) / 1000); // 10 minutes ago
    const result = await verifyPostbackAuth(env, config, { rawParams: { secret: 'shh-a-secret', ts: String(staleTs) }, rawBody: '', sourceIp: null });
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'timestamp_out_of_tolerance');
  });
});

describe('field mapping / normalization (brief §4)', () => {
  test('default aliases pick up common provider field name variants with no config', () => {
    const normalized = normalizeConversionPayload({ subid: 'click-1', event: 'ftd', amount: '150', country: 'de', transaction_id: 'GG-1' });
    assert.equal(normalized.click_id, 'click-1');
    assert.equal(normalized.conversion_type, 'ftd');
    assert.equal(normalized.reported_value, 150);
    assert.equal(normalized.country_code, 'DE');
    assert.equal(normalized.external_reference, 'GG-1');
    assert.equal(normalized.status, 'pending'); // no status field sent -> safe default
  });

  test('a per-config mapping overrides the defaults, including value-level type/status maps', () => {
    const mapping = JSON.stringify({
      click_id: 'my_click', conversion_type: 'evt', status: 'st',
      conversion_type_map: { reg: 'registration' }, status_map: { approved: 'confirmed' }
    });
    const normalized = normalizeConversionPayload({ my_click: 'abc', evt: 'reg', st: 'approved' }, mapping);
    assert.equal(normalized.click_id, 'abc');
    assert.equal(normalized.conversion_type, 'registration');
    assert.equal(normalized.status, 'confirmed');
  });

  test('validation rejects an unknown conversion_type, bad currency, and negative value on a non-refund type', () => {
    const v1 = validateNormalized({ conversion_type: 'not_real', status: 'pending', click_id: 'x', currency: 'USD' });
    assert.equal(v1.valid, false);

    const v2 = validateNormalized({ conversion_type: 'ftd', status: 'pending', click_id: 'x', currency: 'US' });
    assert.equal(v2.valid, false);

    const v3 = validateNormalized({ conversion_type: 'ftd', status: 'pending', click_id: 'x', currency: 'USD', reported_value: -50 });
    assert.equal(v3.valid, false);
  });

  test('validation allows a negative value for refund/chargeback/adjustment', () => {
    const v = validateNormalized({ conversion_type: 'refund', status: 'confirmed', click_id: 'x', currency: 'USD', reported_value: -50 });
    assert.equal(v.valid, true);
  });

  test('validation requires at least a click_id or an external_reference', () => {
    const v = validateNormalized({ conversion_type: 'ftd', status: 'pending', currency: 'USD' });
    assert.equal(v.valid, false);
    assert.ok(v.errors.some(e => /click_id or external_reference/.test(e)));
  });
});

describe('commission engine -- reuses resolveApplicableTerm, GEO-aware precedence (brief §8)', () => {
  let db, graph;
  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    graph = await seedAffiliateGraph(db);
  });

  test('CPA term: calculated_commission is the flat CPA amount, ignoring reported_value', async () => {
    await createCommercialTerm(db, { program_id: graph.programAId, account_id: graph.accountAId, term_type: 'cpa', cpa_amount: 40, effective_date: '2020-01-01', created_by: 1 });
    const result = await recordConversion(db, {
      clickId: null, trackingLinkId: graph.trackingLinkId, offerId: null, casinoId: graph.casinoId,
      partnerId: graph.partnerId, programId: graph.programAId, accountId: graph.accountAId,
      conversionType: 'ftd', status: 'confirmed', reportedValue: 9999, currency: 'USD'
    });
    assert.equal(result.calculatedCommission, 40);
  });

  test('RevShare term: calculated_commission is reportedValue * percent/100', async () => {
    await createCommercialTerm(db, { program_id: graph.programAId, account_id: graph.accountAId, term_type: 'revshare', revshare_percent: 30, effective_date: '2020-01-01', created_by: 1 });
    const result = await recordConversion(db, {
      trackingLinkId: graph.trackingLinkId, casinoId: graph.casinoId, partnerId: graph.partnerId,
      programId: graph.programAId, accountId: graph.accountAId,
      conversionType: 'revshare', status: 'confirmed', reportedValue: 1000, currency: 'USD'
    });
    assert.equal(result.calculatedCommission, 300);
  });

  test('Hybrid term: fixed CPA component plus revshare component', async () => {
    await createCommercialTerm(db, { program_id: graph.programAId, account_id: graph.accountAId, term_type: 'hybrid', hybrid_cpa_amount: 20, hybrid_revshare_percent: 10, effective_date: '2020-01-01', created_by: 1 });
    const result = await recordConversion(db, {
      trackingLinkId: graph.trackingLinkId, casinoId: graph.casinoId, partnerId: graph.partnerId,
      programId: graph.programAId, accountId: graph.accountAId,
      conversionType: 'hybrid', status: 'confirmed', reportedValue: 500, currency: 'USD'
    });
    assert.equal(result.calculatedCommission, 20 + 500 * 0.10);
  });

  test('precedence: an account+casino+GEO term beats an account-only term for the same conversion', async () => {
    await createCommercialTerm(db, { program_id: graph.programAId, account_id: graph.accountAId, term_type: 'cpa', cpa_amount: 25, effective_date: '2020-01-01', created_by: 1 });
    await createCommercialTerm(db, { program_id: graph.programAId, account_id: graph.accountAId, casino_id: graph.casinoId, geo_code: 'DE', term_type: 'cpa', cpa_amount: 60, effective_date: '2020-01-01', created_by: 1 });

    const result = await recordConversion(db, {
      trackingLinkId: graph.trackingLinkId, casinoId: graph.casinoId, partnerId: graph.partnerId,
      programId: graph.programAId, accountId: graph.accountAId, geoCode: 'DE',
      conversionType: 'ftd', status: 'confirmed', reportedValue: 100, currency: 'USD'
    });
    assert.equal(result.calculatedCommission, 60, 'the more specific account+casino+GEO term should have won');
    assert.equal(result.term.geo_code, 'DE');
  });

  test('a conversion for a different GEO than any GEO-scoped term falls back to the account-only term', async () => {
    await createCommercialTerm(db, { program_id: graph.programAId, account_id: graph.accountAId, term_type: 'cpa', cpa_amount: 25, effective_date: '2020-01-01', created_by: 1 });
    await createCommercialTerm(db, { program_id: graph.programAId, account_id: graph.accountAId, casino_id: graph.casinoId, geo_code: 'DE', term_type: 'cpa', cpa_amount: 60, effective_date: '2020-01-01', created_by: 1 });

    const result = await recordConversion(db, {
      trackingLinkId: graph.trackingLinkId, casinoId: graph.casinoId, partnerId: graph.partnerId,
      programId: graph.programAId, accountId: graph.accountAId, geoCode: 'FR',
      conversionType: 'ftd', status: 'confirmed', reportedValue: 100, currency: 'USD'
    });
    assert.equal(result.calculatedCommission, 25);
  });
});

describe('duplicate conversion handling (brief §11/§28)', () => {
  let db, graph;
  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    graph = await seedAffiliateGraph(db);
    await createCommercialTerm(db, { program_id: graph.programAId, account_id: graph.accountAId, term_type: 'cpa', cpa_amount: 40, effective_date: '2020-01-01', created_by: 1 });
  });

  test('the same (account_id, external_reference) pair recorded twice throws by default (unchanged admin behavior)', async () => {
    const args = {
      trackingLinkId: graph.trackingLinkId, casinoId: graph.casinoId, partnerId: graph.partnerId,
      programId: graph.programAId, accountId: graph.accountAId, conversionType: 'ftd', status: 'confirmed',
      reportedValue: 100, currency: 'USD', externalReference: 'GG-DUP-1'
    };
    await recordConversion(db, args);
    await assert.rejects(() => recordConversion(db, args));
  });

  test('with onDuplicate: "ignore" (the postback path), a repeat returns { duplicate: true } instead of throwing', async () => {
    const args = {
      trackingLinkId: graph.trackingLinkId, casinoId: graph.casinoId, partnerId: graph.partnerId,
      programId: graph.programAId, accountId: graph.accountAId, conversionType: 'ftd', status: 'confirmed',
      reportedValue: 100, currency: 'USD', externalReference: 'GG-DUP-2', onDuplicate: 'ignore'
    };
    const first = await recordConversion(db, args);
    assert.equal(first.duplicate, false);
    const second = await recordConversion(db, args);
    assert.equal(second.duplicate, true);
  });
});

describe('ingestPostback -- end-to-end orchestration (brief §6, §21, §25)', () => {
  let db, graph, config;
  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    graph = await seedAffiliateGraph(db);
    await createCommercialTerm(db, { program_id: graph.programAId, account_id: graph.accountAId, term_type: 'cpa', cpa_amount: 40, effective_date: '2020-01-01', created_by: 1 });

    const created = await createPostbackConfig(db, {
      account_id: graph.accountAId, label: 'Test integration', auth_method: 'shared_secret',
      credential_reference: 'POSTBACK_SECRET_A', signature_param: 'secret', created_by: 1
    });
    config = await getActiveConfigByToken(db, created.endpoint_token);
  });

  test('an attributed click produces an accepted conversion with commission calculated', async () => {
    await logEvent(db, { eventType: 'TRACKING_LINK_CLICK', casinoId: graph.casinoId, trackingLinkId: graph.trackingLinkId, partnerId: graph.partnerId, programId: graph.programAId, countryCode: 'DE', clickId: 'click-e2e-1' });

    const normalized = normalizeConversionPayload({ click_id: 'click-e2e-1', conversion_type: 'ftd', status: 'confirmed', reported_value: 200, currency: 'EUR' });
    const result = await ingestPostback(db, { config, normalized });

    assert.equal(result.outcome, 'accepted');
    assert.equal(result.calculated_commission, 40);
    assert.ok(result.conversion_id);
    assert.equal(result.steps.click_found, true);
    assert.equal(result.steps.casino_resolved, true);
  });

  test('a click_id with no matching event is recorded as unattributed, never guessed', async () => {
    const normalized = normalizeConversionPayload({ click_id: 'click-never-happened', conversion_type: 'ftd', status: 'confirmed', reported_value: 200, currency: 'EUR' });
    const result = await ingestPostback(db, { config, normalized });
    assert.equal(result.outcome, 'unattributed');
    assert.equal(result.steps.click_found, false);
  });

  test('SECURITY: a click belonging to a DIFFERENT program is never attributed through this account\'s postback URL', async () => {
    // click-e2e-1's tracking link belongs to Program A (graph.programAId).
    // Build a second config for Account B, which belongs to Program B.
    const createdB = await createPostbackConfig(db, {
      account_id: graph.accountBId, label: 'Account B integration', auth_method: 'shared_secret',
      credential_reference: 'POSTBACK_SECRET_B', signature_param: 'secret', created_by: 1
    });
    const configB = await getActiveConfigByToken(db, createdB.endpoint_token);

    await logEvent(db, { eventType: 'TRACKING_LINK_CLICK', casinoId: graph.casinoId, trackingLinkId: graph.trackingLinkId, partnerId: graph.partnerId, programId: graph.programAId, clickId: 'click-cross-program' });

    const normalized = normalizeConversionPayload({ click_id: 'click-cross-program', conversion_type: 'ftd', status: 'confirmed', reported_value: 500, currency: 'EUR' });
    const result = await ingestPostback(db, { config: configB, normalized });

    assert.equal(result.steps.program_mismatch, true);
    assert.equal(result.outcome, 'unattributed', 'a cross-program click must never be credited, even though click_id matched something');
  });

  test('dryRun mode (the admin test tool) resolves every step but inserts nothing', async () => {
    await logEvent(db, { eventType: 'TRACKING_LINK_CLICK', casinoId: graph.casinoId, trackingLinkId: graph.trackingLinkId, partnerId: graph.partnerId, programId: graph.programAId, clickId: 'click-dryrun' });
    const before = await db.prepare('SELECT COUNT(*) AS c FROM analytics_conversions').first();

    const normalized = normalizeConversionPayload({ click_id: 'click-dryrun', conversion_type: 'ftd', status: 'confirmed', reported_value: 200, currency: 'EUR' });
    const result = await ingestPostback(db, { config, normalized, dryRun: true });

    const after = await db.prepare('SELECT COUNT(*) AS c FROM analytics_conversions').first();
    assert.equal(after.c, before.c, 'dry run must not insert a conversion row');
    assert.equal(result.outcome, 'would_accept');
    assert.equal(result.calculated_commission, 40);
    assert.equal(result.steps.commercial_term_resolved, true);
  });
});
