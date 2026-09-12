// The core pipeline shared by the live postback route
// (worker/postback/handler.js), the CSV/JSON import pipeline
// (worker/imports/pipeline.js, source='import'), and the admin
// "test this postback" tool (worker/api.js
// /api/v1/postback-configs/:id/test) -- brief §25 requires the test
// tool to show the EXACT same resolution steps a real postback goes
// through, and brief §11 requires imports to go through the SAME
// attribution/commission/dedup logic as a live postback rather than a
// separate parser-specific implementation, so this is the one place
// that logic lives.

import { getClickAttribution, recordConversion } from '../database/analytics.js';
import { resolveApplicableTerm, calculateCommission } from '../database/affiliate-commercial-terms.js';

/**
 * @param {object} params
 * @param {object} params.config    - only account_id/program_id are
 *                                    actually read here. The live route
 *                                    passes a full postback_configs row
 *                                    (joined with its account); the
 *                                    import pipeline passes a plain
 *                                    { account_id, program_id } object
 *                                    for the account the admin selected.
 * @param {object} params.normalized - output of normalizeConversionPayload().
 * @param {string} [params.sourceIp]
 * @param {string} [params.source] - 'postback' (default) | 'import' --
 *   stored on analytics_conversions.source so the reconciliation report
 *   (worker/database/reports.js handleReconciliation) can tell the two
 *   channels apart. Never 'manual' here -- that value is reserved for
 *   the pre-existing direct/admin recordConversion() call sites this
 *   pipeline doesn't touch.
 * @param {boolean} [params.dryRun] - when true, resolves every step
 *   (click, tracking link, casino, partner, account, commercial term,
 *   commission) WITHOUT inserting a conversion row -- used by the
 *   admin test tool so testing never pollutes real conversion data.
 */
export async function ingestPostback(db, { config, normalized, sourceIp = null, dryRun = false, source = 'postback' }) {
  const attribution = normalized.click_id ? await getClickAttribution(db, normalized.click_id) : null;

  // Security boundary (brief §21/§23): a postback URL is scoped to one
  // account, which belongs to exactly one program. If the click_id it
  // references actually belongs to a DIFFERENT program's tracking
  // link, never silently credit it to this account -- that would let
  // a leaked/guessed postback URL for Program A attribute (and get
  // paid commission on) Program B's traffic. Treat it as unattributed
  // instead of trusting the click.
  const programMismatch = !!(attribution?.program_id != null && attribution.program_id !== config.program_id);
  const effectiveAttribution = programMismatch ? null : attribution;

  // Click-based casino resolution wins when available; an import row
  // with no click_id can still declare its casino directly (provider
  // statements usually name the brand, not our click_id) -- see
  // field-mapping.js DEFAULT_ALIASES.casino_id / casino_id_map.
  const casinoId = effectiveAttribution?.casino_id ?? normalized.casino_id ?? null;
  const geoCode = effectiveAttribution?.country_code ?? normalized.country_code ?? null;

  const steps = {
    postback_authenticated: true, // caller only reaches ingestPostback after auth succeeds
    click_found: !!attribution,
    program_mismatch: programMismatch,
    tracking_link_resolved: !!effectiveAttribution?.tracking_link_id,
    casino_resolved: !!casinoId,
    partner_resolved: !!effectiveAttribution?.partner_id,
    account_resolved: !!config.account_id
  };

  if (dryRun) {
    const term = await resolveApplicableTerm(db, {
      programId: config.program_id, accountId: config.account_id, casinoId, geoCode
    });
    const commission = calculateCommission(term, normalized.reported_value);
    return {
      outcome: effectiveAttribution ? 'would_accept' : 'would_be_unattributed',
      steps: {
        ...steps,
        commercial_term_resolved: !!term,
        commission_calculated: commission != null
      },
      term_id: term?.id ?? null,
      calculated_commission: commission,
      conversion_id: null
    };
  }

  const result = await recordConversion(db, {
    clickId: effectiveAttribution ? normalized.click_id : null,
    trackingLinkId: effectiveAttribution?.tracking_link_id ?? null,
    offerId: effectiveAttribution?.offer_id ?? null,
    casinoId,
    partnerId: effectiveAttribution?.partner_id ?? null,
    programId: config.program_id,
    accountId: config.account_id,
    conversionType: normalized.conversion_type,
    status: normalized.status,
    reportedValue: normalized.reported_value,
    currency: normalized.currency,
    countryCode: geoCode,
    externalReference: normalized.external_reference,
    createdBy: null,
    source,
    reportedCommission: normalized.reported_commission ?? null,
    externalPlayerId: normalized.external_player_id ?? null,
    onDuplicate: 'ignore'
  });

  if (result.duplicate) {
    return { outcome: 'duplicate', steps, conversion_id: null, calculated_commission: null, term_id: null };
  }

  return {
    outcome: effectiveAttribution ? 'accepted' : 'unattributed',
    steps: {
      ...steps,
      commercial_term_resolved: !!result.term,
      commission_calculated: result.calculatedCommission != null
    },
    conversion_id: result.meta?.last_row_id ?? null,
    calculated_commission: result.calculatedCommission,
    term_id: result.term?.id ?? null
  };
}
