// A configurable adapter for any provider whose reporting API is
// shaped like "GET a JSON array of conversions for a date range,
// authenticated with a static header". This is NOT a specific
// network's integration -- brief §10 is explicit: "do not invent APIs
// for providers that do not expose them". This adapter invents
// nothing; it's a thin, generic HTTP client whose endpoint path, auth
// header, date params, and response shape are all supplied via
// provider_adapter_configs, same spirit as postback_configs'
// field_mapping_json letting one config differ from another without a
// code change.
//
// A provider with a genuinely different shape (OAuth token exchange,
// paginated cursors, XML, SOAP, a bespoke SDK) needs its own adapter
// implementing BaseAffiliateProvider directly -- this one intentionally
// does not try to be everything.

import { BaseAffiliateProvider } from './base.js';

function getByPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

export class GenericRestAdapter extends BaseAffiliateProvider {
  constructor(config) {
    super(config);
    // fetchImpl is ONLY ever supplied directly in tests
    // (new GenericRestAdapter({...config, fetchImpl: mockFetch})) --
    // provider_adapter_configs rows from the database never contain
    // it, so production always uses the real global fetch.
    this._fetch = config.fetchImpl || fetch;
  }

  _resolveSecret(env) {
    const value = env?.[this.config.credential_reference];
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  _authHeaders(env) {
    const secret = this._resolveSecret(env);
    if (!secret) return null;
    const headerName = this.config.auth_header_name || 'Authorization';
    const scheme = this.config.auth_scheme != null ? this.config.auth_scheme : 'Bearer';
    return { [headerName]: scheme ? `${scheme} ${secret}` : secret };
  }

  async authenticate(env) {
    const headers = this._authHeaders(env);
    if (!headers) return { ok: false, error: 'credential_not_configured' };
    try {
      const res = await this._fetch(this.config.api_base_url, { headers });
      return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, error: e.message || 'network error' };
    }
  }

  async fetchConversions(env, { sinceISO, untilISO }) {
    const headers = this._authHeaders(env);
    if (!headers) throw new Error('credential_not_configured');

    const sinceParam = this.config.date_param_since || 'since';
    const untilParam = this.config.date_param_until || 'until';
    const path = this.config.conversions_path || '/conversions';

    const url = new URL(path, this.config.api_base_url);
    url.searchParams.set(sinceParam, sinceISO);
    url.searchParams.set(untilParam, untilISO);

    const res = await this._fetch(url.toString(), { headers });
    if (!res.ok) throw new Error(`Provider API returned HTTP ${res.status}`);
    const body = await res.json();

    const arrayPath = this.config.response_array_path;
    const rows = arrayPath
      ? getByPath(body, arrayPath)
      : (Array.isArray(body) ? body : (body?.data || body?.conversions || body?.rows));

    if (!Array.isArray(rows)) {
      throw new Error('Provider response did not contain a recognizable array of conversions -- set response_array_path');
    }
    return rows;
  }

  // fetchRevenue/fetchCommissions/fetchReports intentionally NOT
  // overridden -- this adapter's shape is "one endpoint returns
  // everything needed per conversion row" (reported_value AND
  // reported_commission are both fields fetchConversions' rows can
  // carry, via field_mapping_json same as postbacks/imports). A
  // provider genuinely splitting these across separate endpoints needs
  // its own adapter.

  async healthCheck(env) {
    const auth = await this.authenticate(env);
    return auth.ok ? { healthy: true } : { healthy: false, detail: auth.error };
  }
}
