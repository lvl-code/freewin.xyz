// Postback integration configs -- one row per external network/account
// allowed to POST conversions in. See migrations/0033_conversion_postback.sql
// for the design rationale.
//
// IMPORTANT: same rule as affiliate-accounts.js -- this module never
// accepts or returns a plaintext secret. `credential_reference` is a
// pointer (Cloudflare secret binding name) resolved elsewhere
// (worker/postback/auth.js) only at the moment a postback is verified,
// and is never logged.

const AUTH_METHODS = ['hmac_sha256', 'shared_secret', 'api_key', 'signed_query'];

function generateEndpointToken() {
  // 32 bytes of randomness, hex-encoded -- unguessable path segment.
  // crypto.getRandomValues is available in both the Workers runtime
  // and Node 22 (test environment), same as crypto.randomUUID
  // elsewhere in this codebase (see worker/controllers.js).
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function validateConfigFields(config) {
  if (!config.account_id) throw new Error('account_id is required');
  if (!config.label) throw new Error('label is required');
  if (!AUTH_METHODS.includes(config.auth_method)) {
    throw new Error(`Invalid auth_method: ${config.auth_method}. Must be one of: ${AUTH_METHODS.join(', ')}`);
  }
  if (!config.credential_reference) {
    throw new Error('credential_reference is required (pointer to an env secret binding, never a plaintext secret)');
  }
  if (config.field_mapping_json != null) {
    try {
      JSON.parse(config.field_mapping_json);
    } catch {
      throw new Error('field_mapping_json must be valid JSON');
    }
  }
  if (config.allowed_ips != null) {
    try {
      const parsed = JSON.parse(config.allowed_ips);
      if (!Array.isArray(parsed)) throw new Error();
    } catch {
      throw new Error('allowed_ips must be a JSON array of IP/CIDR strings');
    }
  }
}

export async function createPostbackConfig(db, config) {
  validateConfigFields(config);
  const endpointToken = config.endpoint_token || generateEndpointToken();

  const result = await db
    .prepare(`
      INSERT INTO postback_configs (
        account_id, label, endpoint_token, auth_method, credential_reference,
        signature_param, timestamp_param, timestamp_tolerance_seconds,
        allowed_ips, field_mapping_json, status, created_by, updated_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      config.account_id,
      config.label,
      endpointToken,
      config.auth_method,
      config.credential_reference,
      config.signature_param || null,
      config.timestamp_param || null,
      config.timestamp_tolerance_seconds ?? 300,
      config.allowed_ips || null,
      config.field_mapping_json || null,
      config.status || 'active',
      config.created_by || null,
      config.created_by || null
    )
    .run();

  return { id: result.meta.last_row_id, endpoint_token: endpointToken };
}

export async function updatePostbackConfig(db, id, config) {
  validateConfigFields(config);
  return await db
    .prepare(`
      UPDATE postback_configs
      SET
        account_id = ?, label = ?, auth_method = ?, credential_reference = ?,
        signature_param = ?, timestamp_param = ?, timestamp_tolerance_seconds = ?,
        allowed_ips = ?, field_mapping_json = ?, status = ?,
        updated_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .bind(
      config.account_id,
      config.label,
      config.auth_method,
      config.credential_reference,
      config.signature_param || null,
      config.timestamp_param || null,
      config.timestamp_tolerance_seconds ?? 300,
      config.allowed_ips || null,
      config.field_mapping_json || null,
      config.status || 'active',
      config.updated_by || null,
      id
    )
    .run();
}

// Rotates the URL token without touching auth/credential settings --
// the only recovery path if a postback URL leaks.
export async function rotateEndpointToken(db, id, updatedBy = null) {
  const newToken = generateEndpointToken();
  await db
    .prepare(`UPDATE postback_configs SET endpoint_token = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .bind(newToken, updatedBy, id)
    .run();
  return newToken;
}

export async function getPostbackConfigById(db, id) {
  return await db
    .prepare(`
      SELECT pc.*, a.account_name, a.program_id, p.name AS program_name
      FROM postback_configs pc
      JOIN affiliate_accounts a ON a.id = pc.account_id
      JOIN affiliate_programs p ON p.id = a.program_id
      WHERE pc.id = ?
      LIMIT 1
    `)
    .bind(id)
    .first();
}

// The ONLY lookup the live postback route uses. Returns the account's
// program_id alongside the config so the ingest pipeline can validate
// that click attribution actually belongs to the same program (see
// worker/postback/ingest.js "program_mismatch" check) before ever
// crediting a conversion through it.
export async function getActiveConfigByToken(db, endpointToken) {
  return await db
    .prepare(`
      SELECT pc.*, a.account_name, a.program_id, a.status AS account_status
      FROM postback_configs pc
      JOIN affiliate_accounts a ON a.id = pc.account_id
      WHERE pc.endpoint_token = ? AND pc.status = 'active'
      LIMIT 1
    `)
    .bind(endpointToken)
    .first();
}

export async function listPostbackConfigs(db, { accountId = null, status = null } = {}) {
  const conditions = [];
  const params = [];
  if (accountId != null) {
    conditions.push('pc.account_id = ?');
    params.push(accountId);
  }
  if (status) {
    conditions.push('pc.status = ?');
    params.push(status);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await db
    .prepare(`
      SELECT pc.*, a.account_name
      FROM postback_configs pc
      JOIN affiliate_accounts a ON a.id = pc.account_id
      ${whereClause}
      ORDER BY pc.label ASC
    `)
    .bind(...params)
    .all();

  return result.results || [];
}

export async function archivePostbackConfig(db, id, updatedBy = null) {
  return await db
    .prepare(`UPDATE postback_configs SET status = 'disabled', updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .bind(updatedBy, id)
    .run();
}

// ── Health metrics (brief §14: conversion health, distinct from
//    tracking-link health) ──────────────────────────────────────

export async function getConversionHealth(db, postbackConfigId) {
  const totals = await db
    .prepare(`
      SELECT
        COUNT(*) AS total_received,
        COUNT(*) FILTER (WHERE outcome = 'accepted') AS accepted,
        COUNT(*) FILTER (WHERE outcome = 'duplicate') AS duplicate,
        COUNT(*) FILTER (WHERE outcome = 'unattributed') AS unattributed,
        COUNT(*) FILTER (WHERE outcome LIKE 'rejected%') AS rejected,
        MAX(received_at) FILTER (WHERE outcome = 'accepted') AS last_successful_postback
      FROM postback_logs
      WHERE postback_config_id = ?
    `)
    .bind(postbackConfigId)
    .first();

  if (!totals || totals.total_received === 0) {
    // brief §29: "no data" must never render as a real zero.
    return { has_data: false };
  }

  return {
    has_data: true,
    total_received: totals.total_received,
    accepted: totals.accepted,
    duplicate: totals.duplicate,
    unattributed: totals.unattributed,
    rejected: totals.rejected,
    attributed_rate: totals.accepted > 0 ? 1 - (totals.unattributed / totals.accepted) : 0,
    last_successful_postback: totals.last_successful_postback
  };
}
