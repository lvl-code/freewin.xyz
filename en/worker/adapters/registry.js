// Adapter registry -- brief §10's "AffiliateProvider" factory. Adding
// a real network's adapter later is: implement BaseAffiliateProvider
// in a new file, import it here, add one line to PROVIDERS. Nothing
// in sync.js or the provider_adapter_configs API needs to change.

import { GenericRestAdapter } from './generic-rest-adapter.js';

const PROVIDERS = {
  // The only adapter that can honestly ship without a specific
  // network's real API documentation -- see generic-rest-adapter.js
  // header comment. Suitable for any provider whose reporting API is
  // "GET a JSON array of conversions for a date range".
  generic_rest: GenericRestAdapter
};

export function listProviderKeys() {
  return Object.keys(PROVIDERS);
}

/**
 * @param {string} providerKey
 * @param {object} config - a provider_adapter_configs row.
 * @returns {BaseAffiliateProvider}
 */
export function getAdapter(providerKey, config) {
  const AdapterClass = PROVIDERS[providerKey];
  if (!AdapterClass) {
    throw new Error(`Unknown provider_key "${providerKey}". Registered adapters: ${listProviderKeys().join(', ')}`);
  }
  return new AdapterClass(config);
}
