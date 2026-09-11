// Normalizes an arbitrary external postback payload into the shape
// analytics.recordConversion() expects. See brief §4: different
// networks use different field names for the same concept, so this
// is alias-driven and configurable per postback_configs row rather
// than one hardcoded parser per network.
//
// A postback_configs.field_mapping_json value looks like:
//   {
//     "click_id": "subid",
//     "conversion_type": "event",
//     "status": "status",
//     "reported_value": "amount",
//     "external_reference": "transaction_id",
//     "conversion_type_map": { "reg": "registration", "dep1": "ftd" },
//     "status_map": { "approved": "confirmed", "declined": "rejected" }
//   }
// Any field a config omits falls back to DEFAULT_ALIASES below, so a
// config only needs to specify what's actually non-standard for that
// network -- not a full parser rewrite.

// First alias found (in order) wins, for a provider that sends a
// canonically-named param without any config at all.
export const DEFAULT_ALIASES = {
  click_id: ['click_id', 'clickid', 'subid', 'sub_id', 'aff_click_id'],
  conversion_type: ['conversion_type', 'event', 'type'],
  status: ['status'],
  reported_value: ['reported_value', 'amount', 'value', 'revenue'],
  currency: ['currency'],
  country_code: ['country_code', 'country', 'geo'],
  external_reference: ['external_reference', 'transaction_id', 'conversion_id'],
  occurred_at: ['occurred_at', 'timestamp'],
  // Provider statements (imports) very often name the brand/casino
  // directly rather than echoing back our click_id -- this is a
  // fallback attribution source ONLY, used in
  // worker/postback/ingest.js when click-based attribution finds
  // nothing (never overrides a real click_id match). Expected to be
  // OUR internal numeric casino id; use casino_id_map (below) to
  // translate a provider's own brand code/slug into it.
  casino_id: ['casino_id'],
  // Only ever read for source='import' rows (statement/report imports,
  // worker/imports/pipeline.js) -- the network's OWN commission figure,
  // used strictly as the comparison side of reconciliation. The live
  // postback path never reads this alias into calculated_commission --
  // see field-mapping.js header comment.
  reported_commission: ['reported_commission', 'commission']
};

const VALID_CONVERSION_TYPES = new Set([
  'registration', 'qualified_lead', 'ftd', 'deposit', 'cpa_conversion',
  'revshare', 'hybrid', 'adjustment', 'refund', 'chargeback'
]);

const VALID_STATUSES = new Set(['pending', 'confirmed', 'rejected']);

// calculated_commission is intentionally NEVER filled from an inbound
// field -- brief §8/§4: recordConversion() always computes it itself
// from affiliate_commercial_terms. A provider's own "commission" value
// IS accepted (see reported_commission above), but only ever lands in
// analytics_conversions.reported_commission -- a separate column read
// only by the reconciliation report (worker/database/reports.js
// handleReconciliation) to compare against our own calculated figure,
// never written into calculated_commission itself.

function firstPresent(rawParams, keys) {
  for (const key of keys) {
    if (rawParams[key] !== undefined && rawParams[key] !== null && rawParams[key] !== '') {
      return rawParams[key];
    }
  }
  return null;
}

function readField(rawParams, mapping, field) {
  const mappedKey = mapping?.[field];
  if (mappedKey) {
    const v = rawParams[mappedKey];
    return v === undefined || v === null || v === '' ? null : v;
  }
  return firstPresent(rawParams, DEFAULT_ALIASES[field]);
}

/**
 * Normalizes a raw postback payload (already parsed from JSON or
 * form-encoding into a flat string-keyed object) into the canonical
 * shape used everywhere downstream. Never throws on unrecognized
 * extra fields -- they're just ignored. Value-level validation
 * (enum membership, numeric parsing) happens in validateNormalized()
 * below, kept separate so callers can normalize first and decide how
 * to report validation failures.
 */
export function normalizeConversionPayload(rawParams, fieldMapping = null) {
  let mapping = null;
  let conversionTypeMap = null;
  let statusMap = null;
  let casinoIdMap = null;
  if (fieldMapping) {
    const parsed = typeof fieldMapping === 'string' ? JSON.parse(fieldMapping) : fieldMapping;
    mapping = parsed;
    conversionTypeMap = parsed.conversion_type_map || null;
    statusMap = parsed.status_map || null;
    casinoIdMap = parsed.casino_id_map || null;
  }

  const rawType = readField(rawParams, mapping, 'conversion_type');
  const rawStatus = readField(rawParams, mapping, 'status');
  const rawValue = readField(rawParams, mapping, 'reported_value');
  const rawCountry = readField(rawParams, mapping, 'country_code');
  const rawReportedCommission = readField(rawParams, mapping, 'reported_commission');
  const rawCasinoId = readField(rawParams, mapping, 'casino_id');
  const mappedCasinoId = rawCasinoId != null && casinoIdMap?.[rawCasinoId] != null ? casinoIdMap[rawCasinoId] : rawCasinoId;

  return {
    click_id: readField(rawParams, mapping, 'click_id'),
    conversion_type: rawType != null && conversionTypeMap?.[rawType] ? conversionTypeMap[rawType] : rawType,
    status: rawStatus != null && statusMap?.[rawStatus] ? statusMap[rawStatus] : (rawStatus || 'pending'),
    reported_value: rawValue != null ? Number(rawValue) : null,
    currency: (readField(rawParams, mapping, 'currency') || 'USD').toUpperCase(),
    country_code: rawCountry ? String(rawCountry).toUpperCase().slice(0, 2) : null,
    external_reference: readField(rawParams, mapping, 'external_reference'),
    occurred_at: readField(rawParams, mapping, 'occurred_at'),
    reported_commission: rawReportedCommission != null ? Number(rawReportedCommission) : null,
    casino_id: mappedCasinoId != null && Number.isFinite(Number(mappedCasinoId)) ? Number(mappedCasinoId) : null
  };
}

/**
 * Validates a normalized payload. Returns { valid: true } or
 * { valid: false, errors: [...] } -- never throws, so the HTTP layer
 * can always return a clean 4xx with a reason instead of a raw 500
 * (brief §5 "safe error responses" / §20 data quality).
 */
export function validateNormalized(payload) {
  const errors = [];

  if (!payload.conversion_type) {
    errors.push('conversion_type is required');
  } else if (!VALID_CONVERSION_TYPES.has(payload.conversion_type)) {
    errors.push(`conversion_type must be one of: ${[...VALID_CONVERSION_TYPES].join(', ')}`);
  }

  if (!VALID_STATUSES.has(payload.status)) {
    errors.push(`status must be one of: ${[...VALID_STATUSES].join(', ')}`);
  }

  if (payload.reported_value != null && !Number.isFinite(payload.reported_value)) {
    errors.push('reported_value must be numeric');
  }
  // Negative values are only legitimate for refund/chargeback/adjustment
  // (brief §20: "impossible negative values except explicitly supported
  // adjustments/refunds").
  if (
    payload.reported_value != null && payload.reported_value < 0 &&
    !['refund', 'chargeback', 'adjustment'].includes(payload.conversion_type)
  ) {
    errors.push(`negative reported_value is not allowed for conversion_type "${payload.conversion_type}"`);
  }

  if (payload.currency && !/^[A-Z]{3}$/.test(payload.currency)) {
    errors.push('currency must be a 3-letter ISO code');
  }

  if (!payload.click_id && !payload.external_reference) {
    errors.push('at least one of click_id or external_reference is required');
  }

  if (payload.occurred_at && Number.isNaN(Date.parse(payload.occurred_at))) {
    errors.push('occurred_at is not a valid timestamp');
  }

  return errors.length ? { valid: false, errors } : { valid: true, errors: [] };
}
