// Same credential-pointer discipline as postback-configs.js: never
// accepts or returns a plaintext secret, only credential_reference.

import { listProviderKeys } from '../adapters/registry.js';

function validateConfigFields(config) {
  if (!config.account_id) throw new Error('account_id is required');
  if (!config.label) throw new Error('label is required');
  if (!config.provider_key || !listProviderKeys().includes(config.provider_key)) {
    throw new Error(`Invalid provider_key: ${config.provider_key}. Registered adapters: ${listProviderKeys().join(', ')}`);
  }
  if (!config.api_base_url) throw new Error('api_base_url is required');
  if (!config.credential_reference) throw new Error('credential_reference is required (pointer to an env secret binding, never a plaintext secret)');
  if (config.field_mapping_json != null) {
    try { JSON.parse(config.field_mapping_json); } catch { throw new Error('field_mapping_json must be valid JSON'); }
  }
}

export async function createProviderAdapterConfig(db, config) {
  validateConfigFields(config);
  const result = await db.prepare(`
    INSERT INTO provider_adapter_configs (
      account_id, label, provider_key, api_base_url, credential_reference,
      auth_header_name, auth_scheme, conversions_path, date_param_since, date_param_until,
      response_array_path, field_mapping_json, sync_frequency_minutes, status, created_by, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    config.account_id, config.label, config.provider_key, config.api_base_url, config.credential_reference,
    config.auth_header_name || null, config.auth_scheme ?? null, config.conversions_path || null,
    config.date_param_since || null, config.date_param_until || null, config.response_array_path || null,
    config.field_mapping_json || null, config.sync_frequency_minutes ?? 60, config.status || 'active',
    config.created_by || null, config.created_by || null
  ).run();
  return result.meta.last_row_id;
}

export async function updateProviderAdapterConfig(db, id, config) {
  validateConfigFields(config);
  return await db.prepare(`
    UPDATE provider_adapter_configs SET
      account_id = ?, label = ?, provider_key = ?, api_base_url = ?, credential_reference = ?,
      auth_header_name = ?, auth_scheme = ?, conversions_path = ?, date_param_since = ?, date_param_until = ?,
      response_array_path = ?, field_mapping_json = ?, sync_frequency_minutes = ?, status = ?,
      updated_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    config.account_id, config.label, config.provider_key, config.api_base_url, config.credential_reference,
    config.auth_header_name || null, config.auth_scheme ?? null, config.conversions_path || null,
    config.date_param_since || null, config.date_param_until || null, config.response_array_path || null,
    config.field_mapping_json || null, config.sync_frequency_minutes ?? 60, config.status || 'active',
    config.updated_by || null, id
  ).run();
}

export async function archiveProviderAdapterConfig(db, id, updatedBy = null) {
  return await db.prepare(`UPDATE provider_adapter_configs SET status = 'disabled', updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(updatedBy, id).run();
}

export async function getProviderAdapterConfigById(db, id) {
  return await db.prepare(`
    SELECT pac.*, a.account_name, a.program_id
    FROM provider_adapter_configs pac
    JOIN affiliate_accounts a ON a.id = pac.account_id
    WHERE pac.id = ? LIMIT 1
  `).bind(id).first();
}

export async function listProviderAdapterConfigs(db, { accountId = null } = {}) {
  const conditions = [];
  const params = [];
  if (accountId != null) { conditions.push('pac.account_id = ?'); params.push(accountId); }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await db.prepare(`
    SELECT pac.*, a.account_name
    FROM provider_adapter_configs pac
    JOIN affiliate_accounts a ON a.id = pac.account_id
    ${whereClause}
    ORDER BY pac.label ASC
  `).bind(...params).all();
  return result.results || [];
}

/**
 * Configs the cron sync job should run right now: active, and either
 * never synced or past their sync_frequency_minutes interval. Done in
 * SQL rather than fetching everything and filtering in JS since this
 * is the one query a scheduled worker invocation actually needs to be
 * cheap.
 */
export async function getConfigsDueForSync(db) {
  const result = await db.prepare(`
    SELECT pac.*, a.account_name, a.program_id
    FROM provider_adapter_configs pac
    JOIN affiliate_accounts a ON a.id = pac.account_id
    WHERE pac.status = 'active'
      AND (
        pac.last_sync_at IS NULL
        OR pac.last_sync_at <= datetime('now', '-' || pac.sync_frequency_minutes || ' minutes')
      )
  `).all();
  return result.results || [];
}

export async function updateSyncStatus(db, id, { status, lastSyncAt = null, error = null }) {
  await db.prepare(`
    UPDATE provider_adapter_configs
    SET last_sync_status = ?, last_sync_error = ?, last_sync_at = COALESCE(?, last_sync_at), updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(status, error, lastSyncAt, id).run();
}
