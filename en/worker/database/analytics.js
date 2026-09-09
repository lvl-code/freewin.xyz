// worker/database/analytics.js
// Phase 2/4/5: Canonical event logging + KPI engine.
//
// Hard rule (audit §31 / brief §31): every scoped query in this file
// resolves the caller's accessible dimension IDs FIRST via the
// existing worker/database/item-access.js registry, then constrains
// the SQL WHERE clause with them, THEN aggregates. Never aggregate
// first and filter the result — that leaks totals across tenants'
// item-access boundaries even when individual rows are hidden.
//
// This module never runs an unscoped analytics query. If a future
// caller needs one (e.g. a true admin dashboard-wide summary), that
// still goes through getAccessibleWhereClause() — for an admin user
// item-access.js already returns 'all' access, so the SQL condition
// becomes unconditionally true rather than this module special-casing
// "is admin" itself. One code path, no shortcuts.

import { getAccessibleIdCondition } from './item-access.js';

const VALID_EVENT_TYPES = new Set([
  'PAGE_VIEW', 'CASINO_VIEW', 'REVIEW_VIEW', 'OFFER_VIEW', 'OFFER_CLICK',
  'TRACKING_LINK_CLICK', 'AFFILIATE_REDIRECT', 'OUTBOUND_CLICK',
  'CONTENT_VIEW', 'CTA_CLICK', 'BANNER_VIEW', 'BANNER_CLICK', 'SEARCH',
  'USER_LOGIN', 'USER_REGISTRATION'
]);

// ── Event logging ───────────────────────────────────

/**
 * Records one analytics event. Called from the async redirect/API
 * path (worker/tracking/redirect.js, worker/api.js) — never from a
 * public-page render function (audit §8 performance risk #3). Fire
 * this via ctx.waitUntil() at the call site so it never delays the
 * response the visitor is waiting on.
 *
 * Deliberately does not throw on bad event_type — logs are best-
 * effort telemetry, not a request-blocking concern, mirroring the
 * existing logAudit() convention in database/audit.js.
 */
export async function logEvent(db, event) {
  if (!VALID_EVENT_TYPES.has(event.eventType)) {
    console.error(`analytics.logEvent: unknown event_type "${event.eventType}", dropped`);
    return null;
  }

  try {
    return await db.prepare(`
      INSERT INTO analytics_events (
        event_type, casino_id, review_id, page_id, news_id,
        offer_id, offer_version_id, tracking_link_id, partner_id, program_id,
        account_id, campaign_id, country_code, region, city, device_type,
        browser, os, referrer, landing_page, utm_source, utm_medium,
        utm_campaign, utm_term, utm_content, session_id, visitor_hash,
        click_id, user_id, value, currency, metadata, is_bot, is_duplicate
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      event.eventType,
      event.casinoId ?? null, event.reviewId ?? null, event.pageId ?? null, event.newsId ?? null,
      event.offerId ?? null, event.offerVersionId ?? null, event.trackingLinkId ?? null,
      event.partnerId ?? null, event.programId ?? null, event.accountId ?? null, event.campaignId ?? null,
      event.countryCode ?? null, event.region ?? null, event.city ?? null, event.deviceType ?? null,
      event.browser ?? null, event.os ?? null, event.referrer ?? null, event.landingPage ?? null,
      event.utmSource ?? null, event.utmMedium ?? null, event.utmCampaign ?? null,
      event.utmTerm ?? null, event.utmContent ?? null, event.sessionId ?? null, event.visitorHash ?? null,
      event.clickId ?? null, event.userId ?? null, event.value ?? null, event.currency ?? null,
      event.metadata ? JSON.stringify(event.metadata) : null,
      event.isBot ? 1 : 0, event.isDuplicate ? 1 : 0
    ).run();
  } catch (e) {
    console.error('analytics.logEvent failed:', e.message);
    return null;
  }
}

// ── Safe KPI math (audit §8 / brief §8: never NaN/Infinity) ───────

/**
 * Divides a/b, returning 0 (not NaN or Infinity) when b is 0, null,
 * or undefined. Every ratio metric in this module goes through this.
 */
export function safeDivide(a, b) {
  const numerator = Number(a) || 0;
  const denominator = Number(b) || 0;
  if (denominator === 0) return 0;
  return numerator / denominator;
}

/**
 * Computes the standard KPI set from raw dimension totals.
 * Definitions (documented once here — see also docs/analytics.md):
 *   CTR = clicks / views
 *   CVR = conversions / clicks
 *   EPC = commission / clicks           (earnings per click)
 *   RPC = revenue / clicks              (revenue per click)
 *   CPA = commission / conversions      (average cost/earning per acquisition)
 *   RPM = (revenue / views) * 1000      (revenue per thousand views)
 */
export function computeKpis({ views = 0, clicks = 0, conversions = 0, revenue = 0, commission = 0 }) {
  return {
    views, clicks, conversions, revenue, commission,
    ctr: safeDivide(clicks, views),
    cvr: safeDivide(conversions, clicks),
    epc: safeDivide(commission, clicks),
    rpc: safeDivide(revenue, clicks),
    cpa: safeDivide(commission, conversions),
    rpm: safeDivide(revenue, views) * 1000
  };
}

// ── Scoped dimension resolution ─────────────────────

// Maps an analytics dimension name to the item-access resource that
// governs it. Kept as one small table so adding a new scoped
// dimension later is a one-line change, not a new code path.
const DIMENSION_RESOURCE_MAP = {
  casino: 'casinos',
  offer: 'offers',
  tracking_link: 'tracking_links',
  partner: 'affiliate_partners',
  program: 'affiliate_programs',
  account: 'affiliate_accounts',
  campaign: 'campaigns',
  // Content dimensions (added for Phase 7-9 content/traffic reporting).
  // Unlike casino/offer/etc., these aren't affiliate-revenue dimensions
  // -- they carry page_views only (conversions/revenue stay 0 for these
  // rows, which computeKpis already handles safely via safeDivide).
  review: 'reviews',
  news: 'news',
  page: 'pages'
};

/**
 * Resolves the WHERE-clause fragment restricting rows in a table
 * where `idColumn` holds a dimension's ID (analytics_daily.dimension_id,
 * or analytics_events.casino_id / offer_id / etc.) to what `user` is
 * permitted to see for a given dimension_type, via the shared
 * getAccessibleIdCondition() in item-access.js — same scope
 * resolution (`all`/`none`/`own`/`assigned`) used everywhere else in
 * the app, just pointed at the correct column name for this table.
 *
 * `country`, `content`, and `overall` dimension types have no
 * item-access resource registered (there is no per-country or
 * per-page ownership model in this codebase) and are intentionally
 * NOT included in DIMENSION_RESOURCE_MAP — callers requesting those
 * dimension types get an always-true '1=1' condition by design,
 * matching how country/page data is already surfaced elsewhere in
 * the admin dashboard today. If that changes, add the mapping here —
 * do not special-case it at each call site.
 */
export async function getScopedDimensionCondition(db, user, dimensionType, idColumn = 'dimension_id') {
  const resource = DIMENSION_RESOURCE_MAP[dimensionType];
  if (!resource) return { condition: '1=1', params: [] };

  return await getAccessibleIdCondition(db, user, resource, 'read', idColumn);
}

// ── KPI queries (read analytics_daily — never raw analytics_events
//    for ranges wider than "today", per audit §8 performance risk #5) ──

/**
 * Overview KPIs for a date range, permission-scoped, for ONE
 * dimension_type at a time (e.g. all casinos the user can see).
 * Returns per-dimension rows plus totals. Never accepts an unscoped
 * dimension_type without going through getScopedDimensionCondition.
 */
export async function getDimensionPerformance(db, user, { dimensionType, startDate, endDate, currency = null }) {
  const { condition, params } = await getScopedDimensionCondition(db, user, dimensionType);

  const currencyClause = currency ? 'AND currency = ?' : '';
  const bindParams = [dimensionType, startDate, endDate, ...params, ...(currency ? [currency] : [])];

  const result = await db.prepare(`
    SELECT
      dimension_id,
      currency,
      SUM(page_views) AS views,
      SUM(clicks) AS clicks,
      SUM(unique_clicks) AS unique_clicks,
      SUM(conversions) AS conversions,
      SUM(revenue) AS revenue,
      SUM(commission) AS commission
    FROM analytics_daily
    WHERE dimension_type = ?
      AND date BETWEEN ? AND ?
      AND ${condition}
      ${currencyClause}
    GROUP BY dimension_id, currency
    ORDER BY revenue DESC
  `).bind(...bindParams).all();

  const rows = (result.results || []).map(r => ({
    dimensionId: r.dimension_id,
    currency: r.currency,
    ...computeKpis({
      views: r.views, clicks: r.clicks, conversions: r.conversions,
      revenue: r.revenue, commission: r.commission
    })
  }));

  return rows;
}

/**
 * Daily time-series for a single dimension_type + optional single
 * dimension_id, permission-scoped identically to getDimensionPerformance.
 */
export async function getTimeSeries(db, user, { dimensionType, dimensionId = null, startDate, endDate, currency = null }) {
  const { condition, params } = await getScopedDimensionCondition(db, user, dimensionType);

  const idClause = dimensionId != null ? 'AND dimension_id = ?' : '';
  const currencyClause = currency ? 'AND currency = ?' : '';
  const bindParams = [
    dimensionType, startDate, endDate, ...params,
    ...(dimensionId != null ? [dimensionId] : []),
    ...(currency ? [currency] : [])
  ];

  const result = await db.prepare(`
    SELECT
      date,
      SUM(page_views) AS views,
      SUM(clicks) AS clicks,
      SUM(conversions) AS conversions,
      SUM(revenue) AS revenue,
      SUM(commission) AS commission
    FROM analytics_daily
    WHERE dimension_type = ?
      AND date BETWEEN ? AND ?
      AND ${condition}
      ${idClause}
      ${currencyClause}
    GROUP BY date
    ORDER BY date ASC
  `).bind(...bindParams).all();

  return (result.results || []).map(r => ({
    date: r.date,
    ...computeKpis({
      views: r.views, clicks: r.clicks, conversions: r.conversions,
      revenue: r.revenue, commission: r.commission
    })
  }));
}

/**
 * GEO breakdown. `country` has no item-access resource (see
 * DIMENSION_RESOURCE_MAP note above) so this instead scopes by
 * casino — a user can only see country rows for casinos they're
 * permitted to see — which is the actual leakage vector the brief's
 * §18 example describes ("infer Casino C revenue through aggregate
 * reports" — here, through a GEO report).
 */
export async function getGeoPerformance(db, user, { startDate, endDate, currency = null }) {
  const { condition, params } = await getAccessibleIdCondition(db, user, 'casinos', 'read', 'casino_id');

  // GEO rows are stored per-casino in analytics_daily only when
  // dimension_type = 'country' AND a companion casino_id-scoped join
  // exists; since analytics_daily is a flat dimension table (one
  // dimension per row, see 0027 design note), country x casino
  // breakdowns are read from analytics_events/analytics_conversions
  // directly for the requested range instead — acceptable per audit §8
  // because GEO reports are a bounded, explicitly-date-ranged admin
  // action, not a page-render-path query.
  //
  // Two independent queries merged in JS below, NOT a JOIN — joining
  // events to conversions on click_id before aggregating fans out
  // whenever a single click_id has more than one same-day conversion
  // (e.g. a registration AND an FTD off the same click), which would
  // silently inflate the click COUNT for that country. Same bug class
  // already fixed in aggregateOneDimension() and handleConversionFunnel().
  const traffic = await db.prepare(`
    SELECT
      country_code,
      COUNT(*) FILTER (WHERE event_type IN ('TRACKING_LINK_CLICK','OFFER_CLICK','AFFILIATE_REDIRECT')) AS clicks
    FROM analytics_events
    WHERE date(occurred_at) BETWEEN ? AND ?
      AND ${condition}
    GROUP BY country_code
  `).bind(startDate, endDate, ...params).all();

  const moneyCond = await getAccessibleIdCondition(db, user, 'casinos', 'read', 'casino_id');
  const currencyClause = currency ? 'AND currency = ?' : '';
  const money = await db.prepare(`
    SELECT
      country_code,
      COUNT(*) AS conversions,
      COALESCE(SUM(reported_value), 0) AS revenue,
      COALESCE(SUM(calculated_commission), 0) AS commission
    FROM analytics_conversions
    WHERE date(occurred_at) BETWEEN ? AND ?
      AND ${moneyCond.condition}
      AND status != 'rejected'
      ${currencyClause}
    GROUP BY country_code
  `).bind(startDate, endDate, ...moneyCond.params, ...(currency ? [currency] : [])).all();

  const moneyByCountry = new Map((money.results || []).map(r => [r.country_code, r]));

  return (traffic.results || []).map(r => {
    const m = moneyByCountry.get(r.country_code) || { conversions: 0, revenue: 0, commission: 0 };
    return {
      country: r.country_code,
      ...computeKpis({ views: 0, clicks: r.clicks, conversions: m.conversions, revenue: m.revenue, commission: m.commission })
    };
  });
}

// ── Conversion recording (Phase 3) ──────────────────

/**
 * Records a conversion. Looks up the applicable commercial_term
 * itself (never trusts a caller-supplied commission figure) using
 * the SAME precedence the existing offer-selection engine documents
 * for commercial_terms in migration 0023: casino-level > account-level
 * > program-level, most specific match wins, only rows where
 * effective_date <= now <= COALESCE(expiry_date, now) and status='active'.
 */
export async function recordConversion(db, {
  clickId = null, trackingLinkId, offerId, casinoId, partnerId, programId, accountId,
  campaignId = null, conversionType, reportedValue = null, currency = 'USD',
  countryCode = null, externalReference = null, createdBy = null
}) {
  const term = await db.prepare(`
    SELECT * FROM affiliate_commercial_terms
    WHERE program_id = ?
      AND (account_id = ? OR account_id IS NULL)
      AND (casino_id = ? OR casino_id IS NULL)
      AND status = 'active'
      AND effective_date <= date('now')
      AND (expiry_date IS NULL OR expiry_date >= date('now'))
    ORDER BY
      (casino_id IS NOT NULL) DESC,
      (account_id IS NOT NULL) DESC
    LIMIT 1
  `).bind(programId, accountId, casinoId).first();

  let calculatedCommission = null;
  if (term && reportedValue != null) {
    if (term.term_type === 'cpa') calculatedCommission = term.cpa_amount;
    else if (term.term_type === 'revshare') calculatedCommission = reportedValue * (term.revshare_percent / 100);
    else if (term.term_type === 'hybrid') {
      calculatedCommission = (term.hybrid_cpa_amount || 0) + reportedValue * ((term.hybrid_revshare_percent || 0) / 100);
    } else if (term.term_type === 'fixed_fee') calculatedCommission = term.fixed_fee_amount;
    // 'custom' term_type: calculatedCommission stays null — must be
    // computed by a human/admin action against custom_terms_json,
    // never guessed here.
  }

  return await db.prepare(`
    INSERT INTO analytics_conversions (
      click_id, tracking_link_id, offer_id, casino_id, partner_id, program_id,
      account_id, commercial_term_id, campaign_id, conversion_type, status,
      reported_value, calculated_commission, currency, country_code,
      external_reference, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)
  `).bind(
    clickId, trackingLinkId, offerId, casinoId, partnerId, programId, accountId,
    term?.id ?? null, campaignId, conversionType, reportedValue, calculatedCommission,
    currency, countryCode, externalReference, createdBy
  ).run();
}

// ── Scheduled aggregation (Phase 4) ─────────────────

const AGGREGATE_DIMENSIONS = [
  { type: 'casino', column: 'casino_id', hasConversions: true },
  { type: 'offer', column: 'offer_id', hasConversions: true },
  { type: 'tracking_link', column: 'tracking_link_id', hasConversions: true },
  { type: 'partner', column: 'partner_id', hasConversions: true },
  { type: 'program', column: 'program_id', hasConversions: true },
  { type: 'account', column: 'account_id', hasConversions: true },
  { type: 'campaign', column: 'campaign_id', hasConversions: true },
  // Content dimensions -- traffic only. analytics_conversions has no
  // review_id/news_id/page_id column at all (conversions only ever tie
  // to a casino/offer/tracking_link/etc.), so hasConversions: false
  // skips that query entirely rather than running it against a
  // nonexistent column.
  { type: 'review', column: 'review_id', hasConversions: false },
  { type: 'news', column: 'news_id', hasConversions: false },
  { type: 'page', column: 'page_id', hasConversions: false }
];

/**
 * Rolls one UTC calendar day of analytics_events + analytics_conversions
 * into analytics_daily, one dimension at a time. Idempotent: uses
 * INSERT ... ON CONFLICT DO UPDATE against the (date, dimension_type,
 * dimension_id, currency) unique index (0027), so re-running for the
 * same day (e.g. to pick up late-arriving conversions) overwrites
 * rather than double-counts. Feature-flagged identically to the
 * existing tracking-link health-check cron job (same
 * system_settings convention, same "no-op is always safe" contract).
 */
export async function aggregateAnalyticsDaily(db, { date = null } = {}) {
  const flag = await db.prepare(
    `SELECT value FROM system_settings WHERE key = 'analytics_aggregation_cron_enabled'`
  ).first();
  if (!flag || flag.value !== 'true') {
    return { skipped: true, reason: 'feature flag disabled' };
  }

  // Default: aggregate "yesterday" (UTC) — today is still accumulating
  // events and would produce a partial, misleadingly-final row.
  const targetDate = date || await db.prepare(`SELECT date('now', '-1 day') AS d`).first().then(r => r.d);

  const summary = [];
  for (const dim of AGGREGATE_DIMENSIONS) {
    const rowCount = await aggregateOneDimension(db, dim, targetDate);
    summary.push({ dimension: dim.type, rows: rowCount });
  }
  return { skipped: false, date: targetDate, dimensions: summary };
}

/**
 * Aggregates ONE dimension for ONE day. Two independent GROUP BY
 * queries (traffic from analytics_events, money from
 * analytics_conversions) merged in JS by (dimensionId, currency) —
 * deliberately NOT a single JOIN'd query, because joining events to
 * conversions on click_id before aggregating would fan out and
 * double- (or triple-) count page_views/clicks for any dimension
 * value that had more than one conversion that day.
 */
async function aggregateOneDimension(db, dim, targetDate) {
  const traffic = await db.prepare(`
    SELECT
      ${dim.column} AS dimension_id,
      COUNT(*) FILTER (WHERE event_type IN ('PAGE_VIEW','CASINO_VIEW','REVIEW_VIEW','OFFER_VIEW','CONTENT_VIEW')) AS page_views,
      COUNT(*) FILTER (WHERE event_type IN ('TRACKING_LINK_CLICK','OFFER_CLICK','AFFILIATE_REDIRECT','OUTBOUND_CLICK')) AS clicks,
      COUNT(DISTINCT CASE WHEN event_type IN ('TRACKING_LINK_CLICK','OFFER_CLICK','AFFILIATE_REDIRECT','OUTBOUND_CLICK')
                          THEN visitor_hash END) AS unique_clicks
    FROM analytics_events
    WHERE date(occurred_at) = ?
      AND ${dim.column} IS NOT NULL
      AND is_bot = 0
      AND is_duplicate = 0
    GROUP BY ${dim.column}
  `).bind(targetDate).all();

  const money = dim.hasConversions ? await db.prepare(`
    SELECT
      ${dim.column} AS dimension_id,
      currency,
      COUNT(*) AS conversions,
      COALESCE(SUM(reported_value), 0) AS revenue,
      COALESCE(SUM(calculated_commission), 0) AS commission
    FROM analytics_conversions
    WHERE date(occurred_at) = ?
      AND ${dim.column} IS NOT NULL
      AND status != 'rejected'
    GROUP BY ${dim.column}, currency
  `).bind(targetDate).all() : { results: [] };

  // Merge keyed by dimensionId + currency. A dimension with traffic
  // but no conversions that day still gets a row (currency defaults
  // to 'USD' per the analytics_daily UNIQUE index) rather than being
  // silently dropped.
  const byKey = new Map();
  for (const t of traffic.results || []) {
    byKey.set(`${t.dimension_id}::USD`, {
      dimensionId: t.dimension_id, currency: 'USD',
      pageViews: t.page_views, clicks: t.clicks, uniqueClicks: t.unique_clicks,
      conversions: 0, revenue: 0, commission: 0
    });
  }
  for (const m of money.results || []) {
    const key = `${m.dimension_id}::${m.currency}`;
    const existing = byKey.get(key) || {
      dimensionId: m.dimension_id, currency: m.currency,
      pageViews: 0, clicks: 0, uniqueClicks: 0, conversions: 0, revenue: 0, commission: 0
    };
    existing.conversions = m.conversions;
    existing.revenue = m.revenue;
    existing.commission = m.commission;
    byKey.set(key, existing);
  }

  for (const row of byKey.values()) {
    await db.prepare(`
      INSERT INTO analytics_daily (
        date, dimension_type, dimension_id, page_views, clicks,
        unique_clicks, conversions, revenue, commission, currency, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(date, dimension_type, dimension_id, currency) DO UPDATE SET
        page_views = excluded.page_views,
        clicks = excluded.clicks,
        unique_clicks = excluded.unique_clicks,
        conversions = excluded.conversions,
        revenue = excluded.revenue,
        commission = excluded.commission,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      targetDate, dim.type, row.dimensionId, row.pageViews, row.clicks,
      row.uniqueClicks, row.conversions, row.revenue, row.commission, row.currency
    ).run();
  }

  return byKey.size;
}
