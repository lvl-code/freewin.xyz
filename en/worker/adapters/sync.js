// Orchestrates one provider_adapter_configs sync run -- brief §10's
// fetchConversions() plus brief §11's pipeline (validate -> normalize
// -> dedupe -> attribute -> commission -> reconciliation), reusing
// ingestPostback() exactly like the postback route and the CSV/JSON
// import pipeline do. An API-pulled conversion is recorded with
// source='import' (see migration 0034's reasoning: this platform only
// has two meaningful channels for reconciliation, "what we received in
// real time" vs "what a report/statement says" -- a scheduled API pull
// is the second one, same as a manually uploaded CSV, just
// automated) and tracked in the SAME import_batches table
// (format='api') so "Import History" shows manual and automatic
// imports side by side, per brief §24.

import { getAdapter } from './registry.js';
import { validateNormalized } from '../postback/field-mapping.js';
import { ingestPostback } from '../postback/ingest.js';
import { createImportBatch, finalizeImportBatch } from '../database/import-batches.js';
import { updateSyncStatus } from '../database/provider-adapters.js';

/**
 * @param {object} config - a provider_adapter_configs row joined with
 *   account_id/program_id (see worker/database/provider-adapters.js
 *   getActiveConfigsDueForSync/getProviderAdapterConfigById).
 */
export async function syncProviderConfig(db, env, config) {
  const adapter = getAdapter(config.provider_key, config);

  const untilISO = new Date().toISOString();
  // First sync ever: default to a 24h lookback rather than pulling a
  // provider's entire history unbounded -- an operator who needs more
  // back-history uses the CSV/JSON import pipeline for that, which has
  // no such window.
  const sinceISO = config.last_sync_at
    ? new Date(config.last_sync_at + 'Z').toISOString()
    : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const batchId = await createImportBatch(db, {
    accountId: config.account_id, label: `Auto-sync (${config.label || config.provider_key})`,
    format: 'api', createdBy: null
  });

  let rows;
  try {
    rows = await adapter.fetchConversions(env, { sinceISO, untilISO });
  } catch (e) {
    await finalizeImportBatch(db, batchId, { totalRows: 0, importedCount: 0, duplicateCount: 0, unattributedCount: 0, errors: [{ row: 0, message: e.message || 'fetchConversions failed' }] });
    await updateSyncStatus(db, config.id, { status: 'error', error: e.message || 'fetchConversions failed' });
    return { batchId, ok: false, error: e.message };
  }

  const ingestConfig = { account_id: config.account_id, program_id: config.program_id };
  const errors = [];
  let importedCount = 0, duplicateCount = 0, unattributedCount = 0;

  for (let i = 0; i < rows.length; i++) {
    try {
      const normalized = adapter.normalizeConversion(rows[i]);
      const validation = validateNormalized(normalized);
      if (!validation.valid) {
        errors.push({ row: i + 1, message: validation.errors.join('; ') });
        continue;
      }
      const result = await ingestPostback(db, { config: ingestConfig, normalized, source: 'import' });
      if (result.outcome === 'duplicate') duplicateCount++;
      else {
        importedCount++;
        if (result.outcome === 'unattributed') unattributedCount++;
      }
    } catch (e) {
      errors.push({ row: i + 1, message: e.message || 'Unknown error' });
    }
  }

  await finalizeImportBatch(db, batchId, { totalRows: rows.length, importedCount, duplicateCount, unattributedCount, errors });
  await updateSyncStatus(db, config.id, { status: 'ok', lastSyncAt: untilISO, error: null });

  return { batchId, ok: true, totalRows: rows.length, importedCount, duplicateCount, unattributedCount, errorCount: errors.length };
}

/**
 * Cron entry point (worker/cron.js runProviderSync) -- syncs every
 * enabled config whose sync_frequency_minutes has elapsed since
 * last_sync_at. Never lets one provider's failure block another's --
 * same "one bad row never aborts the batch" principle as the import
 * pipeline, one level up.
 */
export async function syncAllDueProviders(db, env, configs) {
  const results = [];
  for (const config of configs) {
    try {
      results.push({ configId: config.id, ...(await syncProviderConfig(db, env, config)) });
    } catch (e) {
      results.push({ configId: config.id, ok: false, error: e.message || 'sync failed' });
    }
  }
  return results;
}
