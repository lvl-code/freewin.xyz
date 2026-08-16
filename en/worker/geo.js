export const geoEngine = {
  process(request, edgeGeo) {
    const url = new URL(request.url);
    
    // DEV OVERRIDE TOOL: Allows you to force-simulate any country via URL parameters
    // Example: example.com/en/casino/levelup?geo=CA
    const overrideCountry = url.searchParams.get('geo');
    
    const country = overrideCountry ? overrideCountry.toUpperCase() : (edgeGeo.country || 'RW');
    const city = overrideCountry ? 'Simulated City' : (edgeGeo.city || 'Unknown');

    return {
      country,
      city,
      isSimulated: !!overrideCountry,
      timestamp: new Date().toISOString()
    };
  },

  /**
   * Evaluates country status against a casino's geo-distribution rule matrix
   */
  evaluateAccess(geoRules, userCountry) {
    const rule = geoRules.find(r => r.country === userCountry);
    
    if (rule) {
      return {
        status: rule.status, // 'allowed', 'blocked', 'restricted'
        bonusOverride: rule.bonus_override || null,
        notes: rule.notes || ''
      };
    }

    return {
      status: 'allowed',
      bonusOverride: null,
      notes: 'Default settings applied'
    };
  }
};
