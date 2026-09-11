// Universal provider/API adapter interface -- brief §10.
//
// "Do not hard-code every network into one giant handler. Build the
// generic framework now and add provider-specific adapters only where
// credentials/API specifications actually exist." This file IS the
// framework. It ships with exactly one concrete adapter
// (generic-rest-adapter.js) because that's the only shape genuinely
// implementable without inventing an API: a configurable "GET
// conversions as JSON" polling adapter. GG.BET/PIN-UP/BetMGM/NetRefer/
// Affilka/Income Access/Partnerize-specific adapters are NOT included
// -- each would require that network's actual API documentation and
// credentials, which this environment has none of. Adding one later
// means implementing this exact interface and registering it in
// registry.js; nothing else in the sync/ingest pipeline needs to
// change.
//
// Every method throws "not implemented" by default so a half-written
// adapter fails loudly (at registration/use time) rather than
// silently no-op-ing and reporting a fake healthy sync.

import { normalizeConversionPayload } from '../postback/field-mapping.js';

export class BaseAffiliateProvider {
  /** @param {object} config - the provider_adapter_configs row (joined with its account) this instance serves. */
  constructor(config) {
    this.config = config;
  }

  /**
   * Verifies stored credentials are valid RIGHT NOW (a lightweight
   * call, not a full data pull). Returns { ok: boolean, error?: string }.
   * Never throws for an auth failure -- that's a normal, expected
   * result this method reports, not an exceptional one.
   */
  async authenticate(env) {
    throw new Error(`${this.constructor.name} does not implement authenticate()`);
  }

  /**
   * Fetches raw conversion rows for [sinceISO, untilISO) from the
   * provider's own API. Returns an array of PROVIDER-SHAPED objects
   * (whatever that network's API returns) -- normalization into this
   * platform's canonical shape happens separately via
   * normalizeConversion(), same separation of concerns as the postback
   * pipeline's field-mapping.js.
   */
  async fetchConversions(env, { sinceISO, untilISO }) {
    throw new Error(`${this.constructor.name} does not implement fetchConversions()`);
  }

  /** Optional: a provider whose revenue/commission reporting is a separate endpoint from conversions can implement this; adapters that report both in fetchConversions() may leave this unimplemented and sync.js will skip it. */
  async fetchRevenue(env, { sinceISO, untilISO }) {
    throw new Error(`${this.constructor.name} does not implement fetchRevenue()`);
  }

  /** Optional, same reasoning as fetchRevenue(). */
  async fetchCommissions(env, { sinceISO, untilISO }) {
    throw new Error(`${this.constructor.name} does not implement fetchCommissions()`);
  }

  /** Optional: a provider exposing pre-built statement/report downloads (as opposed to a raw conversions feed) can implement this instead of fetchConversions(). */
  async fetchReports(env, { sinceISO, untilISO }) {
    throw new Error(`${this.constructor.name} does not implement fetchReports()`);
  }

  /**
   * Converts ONE provider-shaped row (from fetchConversions) into this
   * platform's normalized shape -- the same shape
   * worker/postback/field-mapping.js normalizeConversionPayload()
   * produces, so it can be handed straight to ingestPostback(). Default
   * implementation reuses normalizeConversionPayload() against the
   * adapter config's field_mapping_json, which covers any provider
   * whose API returns simple flat JSON objects (the common case);
   * override only if a provider's response needs real reshaping
   * (nested objects, arrays-of-values, etc.) before that applies.
   */
  normalizeConversion(rawRow) {
    return normalizeConversionPayload(rawRow, this.config.field_mapping_json);
  }

  /**
   * Cheap current-state check for the dashboard/health metrics (brief
   * §14's "API last successful sync" / "API sync failures" concept) --
   * distinct from authenticate(): a provider can authenticate fine but
   * still be reporting stale data. Returns { healthy: boolean, detail?: string }.
   */
  async healthCheck(env) {
    throw new Error(`${this.constructor.name} does not implement healthCheck()`);
  }
}
