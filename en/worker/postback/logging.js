// Best-effort logging, same "never break the actual request" contract
// as worker/database/audit.js logAudit(). Stores a sanitized snapshot
// only -- never the raw request body, never a signature or secret
// value (brief §5 "never log secrets").

export async function logPostbackAttempt(db, {
  postbackConfigId = null, sourceIp = null, outcome, reason = null,
  clickId = null, externalReference = null, conversionId = null, normalized = null
}) {
  try {
    await db.prepare(`
      INSERT INTO postback_logs (
        postback_config_id, source_ip, outcome, reason,
        click_id, external_reference, conversion_id, normalized_payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      postbackConfigId, sourceIp, outcome, reason,
      clickId, externalReference, conversionId,
      normalized
        ? JSON.stringify({
            conversion_type: normalized.conversion_type,
            status: normalized.status,
            reported_value: normalized.reported_value,
            currency: normalized.currency,
            country_code: normalized.country_code
          })
        : null
    ).run();
  } catch (_) {
    // Logging must never break the response.
  }
}
