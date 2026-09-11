// CSV/JSON conversion report import pipeline -- brief §11.
//
// Deliberately goes through the EXACT SAME ingestPostback() pipeline a
// live postback uses (attribution, program-mismatch guard, commercial-
// term resolution, dedup) with source='import' -- an imported
// statement row is just a conversion that arrived by a different
// transport, not a different kind of data needing its own logic.
//
// Pipeline order (brief §11): raw data -> validation -> normalization
// -> deduplication -> attribution -> commission calculation ->
// reconciliation. Dedup happens naturally via the (account_id,
// external_reference, source) unique index from migration 0034 --
// every imported row without an external_reference is accepted as-is
// (some statements only have a click_id), since D1/SQLite's UNIQUE
// ignores NULLs, matching the same intentional behavior documented in
// migration 0028 for postbacks.

import { getAccountById } from '../database/affiliate-accounts.js';
import { normalizeConversionPayload, validateNormalized } from '../postback/field-mapping.js';
import { ingestPostback } from '../postback/ingest.js';
import { createImportBatch, finalizeImportBatch } from '../database/import-batches.js';

/**
 * @param {object} params
 * @param {number} params.accountId - which affiliate_accounts row this
 *   statement belongs to (chosen explicitly by the admin running the
 *   import -- there's no URL token to infer it from, unlike postbacks).
 * @param {Array<object>} params.rows - already-parsed rows (from
 *   worker/imports/parse.js parseCsv/parseJsonRows).
 * @param {string} params.format - 'csv' | 'json', for the import_batches record.
 * @param {object|string|null} [params.fieldMapping] - same shape as
 *   postback_configs.field_mapping_json; omit to use DEFAULT_ALIASES.
 * @param {string} [params.label]
 * @param {number} [params.createdBy]
 */
export async function importConversionReport(db, { accountId, rows, format, fieldMapping = null, label = null, createdBy = null }) {
  const account = await getAccountById(db, accountId);
  if (!account) throw new Error('Affiliate account not found');

  const batchId = await createImportBatch(db, { accountId, label, format, createdBy });

  const config = { account_id: accountId, program_id: account.program_id };
  const errors = [];
  let importedCount = 0;
  let duplicateCount = 0;
  let unattributedCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 1; // 1-based, matches what a spreadsheet user expects
    try {
      const normalized = normalizeConversionPayload(rows[i], fieldMapping);
      const validation = validateNormalized(normalized);
      if (!validation.valid) {
        errors.push({ row: rowNumber, message: validation.errors.join('; ') });
        continue;
      }

      const result = await ingestPostback(db, { config, normalized, source: 'import' });
      if (result.outcome === 'duplicate') {
        duplicateCount++;
      } else {
        importedCount++;
        if (result.outcome === 'unattributed') unattributedCount++;
      }
    } catch (e) {
      // A single malformed row must never abort the whole batch --
      // brief §11 "show import errors clearly" means per-row errors,
      // not an all-or-nothing file rejection.
      errors.push({ row: rowNumber, message: e.message || 'Unknown error' });
    }
  }

  await finalizeImportBatch(db, batchId, {
    totalRows: rows.length, importedCount, duplicateCount, unattributedCount, errors
  });

  return {
    batchId, totalRows: rows.length, importedCount, duplicateCount,
    unattributedCount, errorCount: errors.length, errors: errors.slice(0, 50)
  };
}
