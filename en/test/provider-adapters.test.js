// test/provider-adapters.test.js
//
// Covers brief §10 (adapter interface/registry/generic REST adapter)
// and its integration with the SAME attribution/commission/dedup
// pipeline postbacks and imports use. No real network calls -- the
// adapter's fetch is injected, same principle as this repo having no
// npm dependencies and no live Cloudflare access in tests.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { logEvent } from '../worker/database/analytics.js';
import { createCommercialTerm } from '../worker/database/affiliate-commercial-terms.js';
import { BaseAffiliateProvider } from '../worker/adapters/base.js';
import { getAdapter, listProviderKeys } from '../worker/adapters/registry.js';
import { GenericRestAdapter } from '../worker/adapters/generic-rest-adapter.js';
import { syncProviderConfig, syncAllDueProviders } from '../worker/adapters/sync.js';
import { createProviderAdapterConfig, getProviderAdapterConfigById, getConfigsDueForSync } from '../worker/database/provider-adapters.js';
import { listImportBatches } from '../worker/database/import-batches.js';

async function seedAffiliateGraph(db) {
  await db.prepare(`INSERT INTO users (id, email, password_hash, role) VALUES (1, 'admin@test.local', 'x', 'admin')`).run();
  await db.prepare(`INSERT INTO affiliate_partners (id, name, slug, status, created_by) VALUES (1, 'Partner A', 'partner-a', 'active', 1)`).run();
  await db.prepare(`INSERT INTO affiliate_programs (id, partner_id, name, status, created_by) VALUES (10, 1, 'Program A', 'active', 1)`).run();
  await db.prepare(`INSERT INTO affiliate_accounts (id, program_id, account_name, status, credential_reference, created_by) VALUES (100, 10, 'Account A', 'active', 'PROVIDER_SECRET_A', 1)`).run();
  await db.prepare(`INSERT INTO casinos (id, name, slug, website_url, affiliate_url, created_by) VALUES (200, 'Casino X', 'casino-x', 'https://x.example', 'https://aff.example/x', 1)`).run();
  await db.prepare(`
    INSERT INTO tracking_links (id, internal_name, tracking_code, destination_url, casino_id, partner_id, program_id, status)
    VALUES (300, 'Program A link', 'proga-link', 'https://out.example/a', 200, 1, 10, 'active')
  `).run();
  return { partnerId: 1, programId: 10, accountId: 100, casinoId: 200, trackingLinkId: 300 };
}

// A minimal fetch stand-in: returns whatever canned response matches
// the requested URL, and records every call so tests can assert on
// headers/params without a real network.
function makeMockFetch(responsesByPath) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const u = new URL(url);
    calls.push({ url: u, options });
    const entry = responsesByPath[u.pathname];
    if (!entry) return { ok: false, status: 404, json: async () => ({}) };
    if (typeof entry === 'function') return entry(u, options);
    return { ok: true, status: 200, json: async () => entry };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

describe('BaseAffiliateProvider (brief §10 interface contract)', () => {
  test('an adapter that implements nothing throws "not implemented" for every method, never silently no-ops', async () => {
    const base = new BaseAffiliateProvider({});
    await assert.rejects(() => base.authenticate({}), /does not implement authenticate/);
    await assert.rejects(() => base.fetchConversions({}, {}), /does not implement fetchConversions/);
    await assert.rejects(() => base.healthCheck({}), /does not implement healthCheck/);
  });
});

describe('adapter registry', () => {
  test('listProviderKeys reports the generic_rest adapter and nothing invented', () => {
    assert.deepEqual(listProviderKeys(), ['generic_rest']);
  });

  test('getAdapter returns a working instance for a registered key', () => {
    const adapter = getAdapter('generic_rest', { api_base_url: 'https://api.example.com', credential_reference: 'X' });
    assert.ok(adapter instanceof GenericRestAdapter);
  });

  test('getAdapter throws a clear error for an unregistered provider_key -- never silently falls back to a real network call', () => {
    assert.throws(() => getAdapter('totally_made_up_network', {}), /Unknown provider_key/);
  });
});

describe('GenericRestAdapter (mocked fetch -- no real network)', () => {
  test('authenticate() succeeds when the mock endpoint returns ok, using the resolved secret in the auth header', async () => {
    const fetchImpl = makeMockFetch({ '/': async (url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer shh-secret');
      return { ok: true, status: 200, json: async () => ({}) };
    } });
    const adapter = new GenericRestAdapter({ api_base_url: 'https://api.example.com/', credential_reference: 'PROVIDER_SECRET_A', fetchImpl });
    const result = await adapter.authenticate({ PROVIDER_SECRET_A: 'shh-secret' });
    assert.equal(result.ok, true);
  });

  test('authenticate() fails closed when the credential is not configured in env', async () => {
    const fetchImpl = makeMockFetch({});
    const adapter = new GenericRestAdapter({ api_base_url: 'https://api.example.com/', credential_reference: 'MISSING_KEY', fetchImpl });
    const result = await adapter.authenticate({});
    assert.equal(result.ok, false);
    assert.equal(result.error, 'credential_not_configured');
  });

  test('fetchConversions() passes since/until as query params and returns the parsed array', async () => {
    const fetchImpl = makeMockFetch({
      '/conversions': (url) => {
        assert.equal(url.searchParams.get('since'), '2026-01-01T00:00:00.000Z');
        assert.equal(url.searchParams.get('until'), '2026-01-02T00:00:00.000Z');
        return { ok: true, status: 200, json: async () => ({ data: [{ click_id: 'a1', event: 'ftd', amount: 100 }] }) };
      }
    });
    const adapter = new GenericRestAdapter({ api_base_url: 'https://api.example.com', credential_reference: 'K', conversions_path: '/conversions', fetchImpl });
    const rows = await adapter.fetchConversions({ K: 'secret' }, { sinceISO: '2026-01-01T00:00:00.000Z', untilISO: '2026-01-02T00:00:00.000Z' });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].click_id, 'a1');
  });

  test('fetchConversions() honors a custom response_array_path for a nested response shape', async () => {
    const fetchImpl = makeMockFetch({ '/conversions': { result: { items: [{ click_id: 'x' }] } } });
    const adapter = new GenericRestAdapter({ api_base_url: 'https://api.example.com', credential_reference: 'K', conversions_path: '/conversions', response_array_path: 'result.items', fetchImpl });
    const rows = await adapter.fetchConversions({ K: 'secret' }, { sinceISO: 'a', untilISO: 'b' });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].click_id, 'x');
  });

  test('fetchConversions() throws a clear error when the response has no recognizable array, rather than silently returning nothing', async () => {
    const fetchImpl = makeMockFetch({ '/conversions': { unexpected: 'shape' } });
    const adapter = new GenericRestAdapter({ api_base_url: 'https://api.example.com', credential_reference: 'K', conversions_path: '/conversions', fetchImpl });
    await assert.rejects(() => adapter.fetchConversions({ K: 'secret' }, { sinceISO: 'a', untilISO: 'b' }), /did not contain a recognizable array/);
  });

  test('normalizeConversion() reuses the SAME field-mapping engine as postbacks/imports', () => {
    const adapter = new GenericRestAdapter({ api_base_url: 'https://api.example.com', credential_reference: 'K', field_mapping_json: JSON.stringify({ click_id: 'subid' }) });
    const normalized = adapter.normalizeConversion({ subid: 'abc', event: 'ftd', amount: 50 });
    assert.equal(normalized.click_id, 'abc');
    assert.equal(normalized.conversion_type, 'ftd');
    assert.equal(normalized.reported_value, 50);
  });
});

describe('syncProviderConfig -- full pipeline through the real ingest engine', () => {
  let db, graph;
  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    graph = await seedAffiliateGraph(db);
    await createCommercialTerm(db, { program_id: graph.programId, account_id: graph.accountId, term_type: 'cpa', cpa_amount: 40, effective_date: '2020-01-01', created_by: 1 });
  });

  test('a real click_id fetched from the provider attributes correctly and records a conversion', async () => {
    await logEvent(db, { eventType: 'TRACKING_LINK_CLICK', casinoId: graph.casinoId, trackingLinkId: graph.trackingLinkId, partnerId: graph.partnerId, programId: graph.programId, clickId: 'sync-click-1' });

    const fetchImpl = makeMockFetch({ '/conversions': { data: [
      { click_id: 'sync-click-1', event: 'ftd', status: 'confirmed', amount: 100, currency: 'USD', transaction_id: 'PROV-1' }
    ] } });

    const configId = await createProviderAdapterConfig(db, {
      account_id: graph.accountId, label: 'Test API sync', provider_key: 'generic_rest',
      api_base_url: 'https://api.example.com', credential_reference: 'PROVIDER_SECRET_A',
      conversions_path: '/conversions', created_by: 1
    });
    const config = await getProviderAdapterConfigById(db, configId);
    config.fetchImpl = fetchImpl; // test-only injection, never present on a real DB row

    const result = await syncProviderConfig(db, { PROVIDER_SECRET_A: 'shh' }, config);

    assert.equal(result.ok, true);
    assert.equal(result.importedCount, 1);

    const stored = await db.prepare(`SELECT * FROM analytics_conversions WHERE external_reference = 'PROV-1'`).first();
    assert.equal(stored.source, 'import', 'an API-synced conversion is recorded as source=import, same reconciliation channel as a CSV upload');
    assert.equal(stored.calculated_commission, 40);
    assert.equal(stored.tracking_link_id, graph.trackingLinkId);
  });

  test('an API-synced batch shows up in the SAME import_batches history as a manual CSV import (format=api)', async () => {
    const fetchImpl = makeMockFetch({ '/conversions': { data: [] } });
    const configId = await createProviderAdapterConfig(db, {
      account_id: graph.accountId, label: 'Test API sync', provider_key: 'generic_rest',
      api_base_url: 'https://api.example.com', credential_reference: 'PROVIDER_SECRET_A',
      conversions_path: '/conversions', created_by: 1
    });
    const config = await getProviderAdapterConfigById(db, configId);
    config.fetchImpl = fetchImpl;

    await syncProviderConfig(db, { PROVIDER_SECRET_A: 'shh' }, config);
    const batches = await listImportBatches(db, { accountId: graph.accountId });
    assert.equal(batches.length, 1);
    assert.equal(batches[0].format, 'api');
  });

  test('a fetchConversions() failure is recorded on the config (last_sync_status) and never crashes the sync', async () => {
    const fetchImpl = makeMockFetch({}); // /conversions not mocked -> 404 -> adapter throws "Provider API returned HTTP 404"
    const configId = await createProviderAdapterConfig(db, {
      account_id: graph.accountId, label: 'Broken sync', provider_key: 'generic_rest',
      api_base_url: 'https://api.example.com', credential_reference: 'PROVIDER_SECRET_A',
      conversions_path: '/conversions', created_by: 1
    });
    const config = await getProviderAdapterConfigById(db, configId);
    config.fetchImpl = fetchImpl;

    const result = await syncProviderConfig(db, { PROVIDER_SECRET_A: 'shh' }, config);
    assert.equal(result.ok, false);

    const updated = await getProviderAdapterConfigById(db, configId);
    assert.equal(updated.last_sync_status, 'error');
    assert.match(updated.last_sync_error, /404/);
  });

  test('a bad row from the provider is reported as a per-row import error, not an aborted sync', async () => {
    const fetchImpl = makeMockFetch({ '/conversions': { data: [
      { click_id: 'a', event: 'ftd', amount: 100, transaction_id: 'OK-1' },
      { click_id: 'b', event: 'not_a_real_type', amount: 50, transaction_id: 'BAD-1' }
    ] } });
    const configId = await createProviderAdapterConfig(db, {
      account_id: graph.accountId, label: 'Test API sync', provider_key: 'generic_rest',
      api_base_url: 'https://api.example.com', credential_reference: 'PROVIDER_SECRET_A',
      conversions_path: '/conversions', created_by: 1
    });
    const config = await getProviderAdapterConfigById(db, configId);
    config.fetchImpl = fetchImpl;

    const result = await syncProviderConfig(db, { PROVIDER_SECRET_A: 'shh' }, config);
    assert.equal(result.importedCount, 1);
    assert.equal(result.errorCount, 1);
  });
});

describe('getConfigsDueForSync / syncAllDueProviders', () => {
  let db, graph;
  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    graph = await seedAffiliateGraph(db);
  });

  test('a never-synced active config is due; a disabled config is never due', async () => {
    const activeId = await createProviderAdapterConfig(db, { account_id: graph.accountId, label: 'A', provider_key: 'generic_rest', api_base_url: 'https://a.example.com', credential_reference: 'K', created_by: 1 });
    await createProviderAdapterConfig(db, { account_id: graph.accountId, label: 'B', provider_key: 'generic_rest', api_base_url: 'https://b.example.com', credential_reference: 'K', status: 'disabled', created_by: 1 });

    const due = await getConfigsDueForSync(db);
    assert.equal(due.length, 1);
    assert.equal(due[0].id, activeId);
  });

  test('a recently-synced config within its frequency window is not due again yet', async () => {
    const id = await createProviderAdapterConfig(db, { account_id: graph.accountId, label: 'A', provider_key: 'generic_rest', api_base_url: 'https://a.example.com', credential_reference: 'K', sync_frequency_minutes: 60, created_by: 1 });
    await db.prepare(`UPDATE provider_adapter_configs SET last_sync_at = datetime('now', '-5 minutes') WHERE id = ?`).bind(id).run();

    const due = await getConfigsDueForSync(db);
    assert.equal(due.length, 0);
  });

  test('syncAllDueProviders keeps going after one config throws (e.g. unknown provider_key)', async () => {
    await db.prepare(`INSERT INTO provider_adapter_configs (account_id, label, provider_key, api_base_url, credential_reference, status) VALUES (?, 'Broken', 'nonexistent_provider', 'https://x.example.com', 'K', 'active')`).bind(graph.accountId).run();
    const configs = await getConfigsDueForSync(db);
    const results = await syncAllDueProviders(db, {}, configs);
    assert.equal(results.length, 1);
    assert.equal(results[0].ok, false);
  });
});
