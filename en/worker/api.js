// =====================================================
// LEVELCASINO API v1
// Cloudflare Worker Controller Layer
// =====================================================
import * as authorsDB from "./database/authors.js";
import * as casinos from "./database/casinos.js";
import * as reviews from "./database/reviews.js";
import * as pages from "./database/pages.js";
import * as geo from "./database/geo.js";
import * as settings from "./database/settings.js";
import * as ai from "./database/ai.js";
import * as categories from "./database/categories.js";
import * as news from "./database/news.js";
import * as platformUpdates from "./database/platform-updates.js";
import * as seoPages from "./database/seo-pages.js";
import * as adRulesDB from "./database/ad-rules.js";

import * as affiliatePartners from "./database/affiliate-partners.js";
import * as affiliatePrograms from "./database/affiliate-programs.js";
import * as affiliateAccounts from "./database/affiliate-accounts.js";
import * as commercialTerms from "./database/affiliate-commercial-terms.js";
import * as offersDB from "./database/offers.js";
import { resolveOfferForCasino, getCandidateOffers } from "./offers/selection.js";
import * as trackingLinksDB from "./database/tracking-links.js";
import { checkAndRecordLink } from "./tracking/health-check.js";
import { resolveRedirectTarget } from "./tracking/redirect.js";
import { logAudit } from "./database/audit.js";
import * as analyticsDB from "./database/analytics.js";
import * as reportsDB from "./database/reports.js";
import * as alertsDB from "./database/alerts.js";



import * as itemAccess from "./database/item-access.js";
import {
  handleGetUserItemAccess,
  handleSetUserItemAccess,
  handleDeleteUserItemAccess,
  handleAssignItem,
  handleUnassignItem,
  handleGetUserAssignments,
  handleGetItemAssignees,
  handleGetResources,
  handleGetDefaultScope,
  handleSetDefaultScope
} from "./database/item-access-api.js";


import { aiAssistant } from "./ai/assistant.js";

import {
  handleChat,
  handleChatStream,
  handleClearChat
} from "./ai/api.js";

import {
  login,
  logout,
  register,
  getCurrentUser
}
from "./auth.js";
import { dashboardStatsAPI } from "./controllers.js";
import { aiEngine } from "./ai.js";
import * as componentsDB from "./database/components.js";
import * as reviewBlocksDB from "./database/review_blocks.js";
import * as seoMetaDB from "./database/seo_meta.js";
import * as mediaDB from "./database/media_library.js";
import * as navDB from "./database/nav.js";
import * as permDB from "./database/permissions.js";
import * as userDash from "./database/user_dashboard.js";
import * as adminTools from "./database/admin_tools.js";
import * as bannerDB from "./database/banners.js";
import { sanitizeUrl } from "./sanitize.js";
import { getCached, setCached, CACHE_KEYS, invalidateCasinos, invalidateNews, invalidateCountries, invalidateCategories, invalidateNav } from "./cache.js";
import {
  deleteCached
} from "./cache.js";
import {
    handleUpload,
    handleDelete,
    serveMedia,
} from './media-upload.js';
import {
    createFolder,
    getFolderById,
    getFolderBySlug,
    listFolders,
    listRootFolders,
    listChildFolders,
    updateFolder,
    deleteFolder,
    buildFolderTree,
    countMediaInFolder,
} from './database/media_folders.js';
import {
    createMediaItem,
    getMediaById,
    searchMedia,
    listMedia,
    updateMediaItem,
    deleteMediaItem,
    countMedia,
} from './database/media_library.js';



// =====================================================
// MAIN API HANDLER
// =====================================================

export async function handleAPI(
  request,
  env,
  path,
  user = null
) {

  // ----------------------------------
  // Require Login
  // ----------------------------------
  if(path === "/api/v1/auth/login"){
  return login(request,env);
}

if (path === "/api/v1/auth/register") {
  return register(request, env);
}

if(path === "/api/v1/auth/logout"){
  return logout(request,env);
}


if (path === "/api/v1/geo/check") {  
  const url = new URL(request.url);  
  const slug = url.searchParams.get("slug");  
  if (!slug) return failure("slug is required");  
  
  const country = request.cf?.country || null;  
    
  // Get ALL rules for this casino  
  const allRules = await env.DB.prepare(`  
    SELECT country_code, status FROM geo_rules  
    WHERE casino_slug = ?  
  `).bind(slug).all();  
    
  const rules = allRules.results || [];  
    
  // Check if this specific country has a rule  
  const countryRule = rules.find(r => r.country_code === country);  
    
  let status;  
  if (countryRule) {  
    status = countryRule.status;  
  } else if (rules.length === 0) {  
    // No rules at all → blocked  
    status = "blocked";  
  } else {  
    // No rule for this country — infer  
    const hasAllowed = rules.some(r => r.status === "allowed");  
    const hasBlocked = rules.some(r => r.status === "blocked");  
      
    if (hasAllowed && !hasBlocked) {  
      status = "blocked"; // Allowlist mode → blocked  
    } else if (hasBlocked && !hasAllowed) {  
      status = "allowed"; // Blocklist mode → allowed  
    } else {  
      status = "blocked"; // Mixed → blocked  
    }  
  }  
  
  const COUNTRY_NAMES = {RW:"Rwanda",US:"United States",CA:"Canada",GB:"United Kingdom",DE:"Germany",FR:"France",IT:"Italy",ES:"Spain",NL:"Netherlands",AU:"Australia",NZ:"New Zealand",JP:"Japan",CN:"China",IN:"India",BR:"Brazil",MX:"Mexico",ZA:"South Africa",NG:"Nigeria",KE:"Kenya",EG:"Egypt",SE:"Sweden",NO:"Norway",DK:"Denmark",FI:"Finland",PL:"Poland",PT:"Portugal",GR:"Greece",TR:"Turkey",RU:"Russia",UA:"Ukraine",AE:"United Arab Emirates",SA:"Saudi Arabia",QA:"Qatar",KR:"South Korea",TH:"Thailand",VN:"Vietnam",PH:"Philippines",ID:"Indonesia",MY:"Malaysia",SG:"Singapore",AR:"Argentina",CL:"Chile",CO:"Colombia",PE:"Peru",AT:"Austria",CH:"Switzerland",IE:"Ireland",BE:"Belgium",CZ:"Czech Republic",HU:"Hungary",RO:"Romania",BG:"Bulgaria",HR:"Croatia",MT:"Malta",CY:"Cyprus",LU:"Luxembourg",IS:"Iceland"};
  return json({
    status,
    country,
    countryName: COUNTRY_NAMES[country] || country,
    bonusOverride: countryRule?.bonus_override || null
  }); 
}  
  // One-time admin bootstrap — DELETE after first use
  if (path === "/api/v1/setup/admin" && request.method === "POST") {
    const body = await request.json();
    if (!body.email || !body.password) {
      return failure("Email and password required");
    }
    const existing = await env.DB.prepare(
      "SELECT COUNT(*) c FROM users WHERE role = 'admin'"
    ).first();
    if (existing.c > 0) {
      return failure("Admin already exists. Remove this endpoint for security.", 403);
    }
    const { hashPassword } = await import("./auth.js");
    const hash = await hashPassword(body.password);
    await env.DB.prepare(
      "INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'admin')"
    ).bind(body.email, hash).run();
    return json({ success: true, message: "Admin created. Remove this endpoint now." });
  }

if (path === "/api/v1/public/reviews/list") {
  const result = await env.DB.prepare(`
    SELECT r.*, c.name as casino_name, c.logo as casino_logo
    FROM reviews r
    LEFT JOIN casinos c ON c.slug = r.casino_slug
    WHERE r.published = 1
    ORDER BY r.created_at DESC
  `).all();
  return json({ reviews: result.results });
}

if (path === "/api/v1/public/casino-reviews") {
  const url = new URL(request.url);
  const casinoSlug = url.searchParams.get("casino_slug");
  if (!casinoSlug) return json({ reviews: [] });
  const result = await env.DB.prepare(`
    SELECT * FROM reviews
    WHERE casino_slug = ? AND published = 1
    ORDER BY created_at DESC
  `).bind(casinoSlug).all();
  return json({ reviews: result.results });
}

if (path === "/api/v1/public/casinos/list") {
  let casinos = await getCached(env, CACHE_KEYS.PUBLIC_CASINOS);
  if (!casinos) {
    const result = await env.DB.prepare(`
      SELECT slug, name, logo, rating FROM casinos
      WHERE published = 1 AND status = 'published'
      ORDER BY featured DESC, sort_order ASC, rating DESC
    `).all();
    casinos = result.results || [];
    await setCached(env, CACHE_KEYS.PUBLIC_CASINOS, casinos);
  }
  return json({ casinos });
}

if (path === "/api/v1/public/news/list") {
  let newsList = await getCached(env, CACHE_KEYS.PUBLIC_NEWS);

  if (!newsList) {
    newsList = await news.getAllNews(env.DB);

    await setCached(
      env,
      CACHE_KEYS.PUBLIC_NEWS,
      newsList
    );
  }

  return json({ news: newsList });
}
if (path === "/api/v1/public/newsbackup/list") {
  let news = await getCached(env, CACHE_KEYS.PUBLIC_NEWS);
  if (!news) {
    const result = await env.DB.prepare(`
      SELECT * FROM news
      WHERE published = 1
      ORDER BY created_at DESC
    `).all();
    news = result.results || [];
    await setCached(env, CACHE_KEYS.PUBLIC_NEWS, news);
  }
  return json({ news });
}

if (path === "/api/v1/public/casinos/geo") {
  const country = request.cf?.country || null;

  // Try cached casinos + geo rules
  let casinoList = await getCached(env, CACHE_KEYS.PUBLIC_CASINOS);
  let allRules = await getCached(env, CACHE_KEYS.PUBLIC_GEO_RULES);

  if (!casinoList) {
    const result = await env.DB.prepare(`
      SELECT slug, name, logo, rating, bonus_title, bonus_value, website_url
      FROM casinos
      WHERE published = 1 AND status = 'published'
      ORDER BY featured DESC, sort_order ASC, rating DESC
    `).all();
    casinoList = result.results || [];
    await setCached(env, CACHE_KEYS.PUBLIC_CASINOS, casinoList);
  }

  if (!allRules) {
    const rulesResult = await env.DB.prepare(`
      SELECT casino_slug, country_code, status FROM geo_rules
    `).all();
    allRules = rulesResult.results || [];
    await setCached(env, CACHE_KEYS.PUBLIC_GEO_RULES, allRules);
  }

  if (casinoList.length === 0) return json({ casinos: [], country });

  // Group rules by casino slug
  const rulesByCasino = {};
  for (const row of allRules) {
    if (!rulesByCasino[row.casino_slug]) rulesByCasino[row.casino_slug] = [];
    rulesByCasino[row.casino_slug].push(row);
  }

  // Compute geo status per casino
  const geoCasinos = casinoList.map(casino => {
    const rules = rulesByCasino[casino.slug] || [];
    let geoStatus = "blocked";

    if (rules.length === 0) {
      geoStatus = "blocked";
    } else {
      const countryRule = rules.find(r => r.country_code === country);
      if (countryRule) {
        geoStatus = countryRule.status;
      } else {
        const hasAllowed = rules.some(r => r.status === "allowed");
        const hasBlocked = rules.some(r => r.status === "blocked");
        if (hasAllowed && !hasBlocked) geoStatus = "blocked";
        else if (hasBlocked && !hasAllowed) geoStatus = "allowed";
        else geoStatus = "blocked";
      }
    }

    return { ...casino, geo_status: geoStatus };
  });

  // Sort: available first (by rating desc), then unavailable (by rating desc)
  geoCasinos.sort((a, b) => {
    const aAvail = a.geo_status === "allowed" ? 1 : 0;
    const bAvail = b.geo_status === "allowed" ? 1 : 0;
    if (aAvail !== bAvail) return bAvail - aAvail;
    return (b.rating || 0) - (a.rating || 0);
  });

  return json({ casinos: geoCasinos, country });
}



if (path === "/api/v1/public/reviews/geo") {
  const country = request.cf?.country || null;
  const result = await env.DB.prepare(`
    SELECT r.*, c.name as casino_name, c.logo as casino_logo, c.slug as casino_slug
    FROM reviews r
    LEFT JOIN casinos c ON c.slug = r.casino_slug
    WHERE r.published = 1
    ORDER BY r.created_at DESC
  `).all();

  const reviews = result.results || [];
  if (reviews.length === 0) return json({ reviews: [] });

  // Get geo rules for all casinos referenced by reviews
  const casinoSlugs = [...new Set(reviews.filter(r => r.casino_slug).map(r => r.casino_slug))];
  if (casinoSlugs.length === 0) return json({ reviews, country });

  const placeholders = casinoSlugs.map(() => '?').join(',');
  const rulesResult = await env.DB.prepare(`
    SELECT casino_slug, country_code, status FROM geo_rules
    WHERE casino_slug IN (${placeholders})
  `).bind(...casinoSlugs).all();

  const rulesByCasino = {};
  for (const row of (rulesResult.results || [])) {
    if (!rulesByCasino[row.casino_slug]) rulesByCasino[row.casino_slug] = [];
    rulesByCasino[row.casino_slug].push(row);
  }

  const geoReviews = reviews.map(review => {
    if (!review.casino_slug) return { ...review, geo_status: "unknown" };
    const rules = rulesByCasino[review.casino_slug] || [];
    let geoStatus = "blocked";

    if (rules.length === 0) {
      geoStatus = "blocked";
    } else {
      const countryRule = rules.find(r => r.country_code === country);
      if (countryRule) {
        geoStatus = countryRule.status;
      } else {
        const hasAllowed = rules.some(r => r.status === "allowed");
        const hasBlocked = rules.some(r => r.status === "blocked");
        if (hasAllowed && !hasBlocked) geoStatus = "blocked";
        else if (hasBlocked && !hasAllowed) geoStatus = "allowed";
        else geoStatus = "blocked";
      }
    }

    return { ...review, geo_status: geoStatus };
  });
    // Geo-rank: available first (by rating desc), then unavailable (by rating desc)
  geoReviews.sort((a, b) => {
    const aAvail = a.geo_status === "allowed" ? 1 : 0;
    const bAvail = b.geo_status === "allowed" ? 1 : 0;
    if (aAvail !== bAvail) return bAvail - aAvail;
    return (b.rating || 0) - (a.rating || 0);
  });

  return json({ reviews: geoReviews, country });
}

if (path === "/api/v1/public/categories/list") {
  let categories = await getCached(env, CACHE_KEYS.PUBLIC_CATEGORIES);
  if (!categories) {
    const result = await env.DB.prepare(`
      SELECT * FROM categories ORDER BY name
    `).all();
    categories = result.results || [];
    await setCached(env, CACHE_KEYS.PUBLIC_CATEGORIES, categories, 600);
  }
  return json({ categories });
}

if (path === "/api/v1/public/countries/list") {
  let countries = await getCached(env, CACHE_KEYS.PUBLIC_COUNTRIES);
  if (!countries) {
    const result = await env.DB.prepare(`
      SELECT * FROM countries ORDER BY name
    `).all();
    countries = result.results || [];
    await setCached(env, CACHE_KEYS.PUBLIC_COUNTRIES, countries, 600);
  }
  return json({ countries });
}




  if (!user &&
 path !== "/api/v1/ai/chat") {
    return failure("Unauthorized", 401);
  }


    const userPermissions = await permDB.getPermissionsForUser(env.DB, user);

  // ── READ permission gate (GET requests) ──
  // Previously unreachable because it was nested inside writeMethods.
    // ── READ permission gate (GET requests) ──
  if (request.method === "GET") {
    const readResourceMap = {
      // Casinos
      "/api/v1/casinos/list": "casinos",
      "/api/v1/casino/get": "casinos",
      "/api/v1/geo/list": "casinos",
      // Reviews
      "/api/v1/reviews/list": "reviews",
      "/api/v1/review-blocks/list": "reviews",
      // News
      "/api/v1/news/list": "news",
      // Pages
      "/api/v1/pages/list": "pages",
      // Categories
      "/api/v1/categories/list": "categories",
      "/api/v1/category/get-by-id": "categories",
      // Countries
      "/api/v1/countries/list": "countries",
      "/api/v1/country/get-by-id": "countries",
      "/api/v1/country/get-by-code": "countries",
      // Authors
      "/api/v1/authors/list": "authors",
      "/api/v1/author/get": "authors",
      "/api/v1/author/content": "authors",
      // Components
      "/api/v1/components/list": "components",
      "/api/v1/component/get": "components",
      "/api/v1/components/page": "components",
      // SEO
      "/api/v1/seo/list": "seo",
      "/api/v1/seo/get": "seo",
      // Media
      "/api/v1/media/list": "media",
      "/api/v1/media/browse": "media",
      "/api/v1/media/search": "media",
      "/api/v1/media/get": "media",
      "/api/v1/media/folders": "media",
      "/api/v1/media/folders/tree": "media",
      "/api/v1/media/folder/count": "media",
      // Nav
      "/api/v1/nav/list": "nav",
      "/api/v1/nav/geo/list": "nav",
      // Settings
      "/api/v1/settings/get": "settings",
      // Permissions
      "/api/v1/permissions/list": "permissions",
      // Platform Updates
      "/api/v1/platform-updates/list": "platform-updates",
      // SEO landing pages
      "/api/v1/seo-pages/list": "seo_pages",
      "/api/v1/seo-pages/get": "seo_pages",
      "/api/v1/seo-pages/countries-search": "seo_pages",
      "/api/v1/seo-pages/eligible-casinos": "seo_pages",
      "/api/v1/seo-pages/discover": "seo_pages",
      // Ad Rules
      "/api/v1/ad-rules/list": "ad-rules",
      // Banners
      "/api/v1/banners/list": "banners",
      // Affiliate Partners (System 1 -- handlers land in Phase 3E)
      "/api/v1/affiliate-partners/list": "affiliate_partners",
      "/api/v1/affiliate-partner/get": "affiliate_partners",
      "/api/v1/affiliate-partner/contacts": "affiliate_partners",
      // Affiliate Programs
      "/api/v1/affiliate-programs/list": "affiliate_programs",
      "/api/v1/affiliate-program/get": "affiliate_programs",
      "/api/v1/affiliate-program/casinos": "affiliate_programs",
      "/api/v1/casino/affiliate-programs": "affiliate_programs",
      // Affiliate Accounts
      "/api/v1/affiliate-accounts/list": "affiliate_accounts",
      "/api/v1/affiliate-account/get": "affiliate_accounts",
      // Commercial Terms
      "/api/v1/commercial-terms/list": "commercial_terms",
      "/api/v1/commercial-terms/history": "commercial_terms",
      "/api/v1/commercial-terms/resolve": "commercial_terms",
      "/api/v1/commercial-term/get": "commercial_terms",
      // Offers (System 2)
      "/api/v1/offers/list": "offers",
      "/api/v1/offer/get": "offers",
      "/api/v1/offer/history": "offers",
      "/api/v1/offer/as-of": "offers",
      "/api/v1/offer/candidates": "offers",
      "/api/v1/offer/resolve": "offers",
      // Tracking Links (System 3)
      "/api/v1/tracking-links/list": "tracking_links",
      "/api/v1/tracking-link/get": "tracking_links",
      "/api/v1/tracking-link/geo-destinations": "tracking_links",
      "/api/v1/tracking-link/health-history": "tracking_links",
      "/api/v1/tracking-link/resolve-preview": "tracking_links",
      // Analytics / Reporting (Phase 5)
      "/api/v1/analytics/overview": "analytics",
      "/api/v1/analytics/timeseries": "analytics",
      "/api/v1/analytics/geo": "analytics",
      "/api/v1/analytics/conversions/list": "analytics_conversions",
      "/api/v1/campaigns/list": "campaigns",
      "/api/v1/campaign/get": "campaigns",
      "/api/v1/reports/list": "reports",
      "/api/v1/report/get": "reports",
      "/api/v1/report/runs/list": "reports",
      "/api/v1/analytics/alerts/list": "analytics_alerts",
      "/api/v1/analytics/alert-rules/list": "analytics_alerts",
    };

    for (const [readPath, res] of Object.entries(readResourceMap)) {
      if (path === readPath) {
        if (!permDB.checkPermission(userPermissions, res, "read")) {
          return json({
            success: false,
            error: `Forbidden: ${user.role} role cannot read ${res}`
          }, 403);
        }
        break;
      }
    }
  }

  // ── WRITE permission gate (POST, PUT, DELETE) ──
  const writeMethods = ["POST", "PUT", "DELETE"];
  if (writeMethods.includes(request.method)) {
    const resourceMap = {
      "/api/v1/casino": "casinos",
      "/api/v1/casinos": "casinos",
      "/api/v1/review": "reviews",
      "/api/v1/reviews": "reviews",
      "/api/v1/news": "news",
      "/api/v1/page": "pages",
      "/api/v1/pages": "pages",
      "/api/v1/category": "categories",
      "/api/v1/categories": "categories",
      "/api/v1/country": "countries",
      "/api/v1/countries": "countries",
      "/api/v1/author": "authors",
      "/api/v1/authors": "authors",
      "/api/v1/component": "components",
      "/api/v1/components": "components",
      "/api/v1/seo-pages": "seo_pages",
      "/api/v1/seo": "seo",
      "/api/v1/settings": "settings",
      "/api/v1/geo": "casinos",
      "/api/v1/media": "media",
      "/api/v1/nav": "nav",
      "/api/v1/platform-updates": "platform-updates",
      "/api/v1/ad-rules": "ad-rules",
      // Affiliate Partner & Program Management (System 1 -- handlers land in Phase 3E)
      "/api/v1/affiliate-partner": "affiliate_partners",
      "/api/v1/affiliate-partners": "affiliate_partners",
      "/api/v1/affiliate-program": "affiliate_programs",
      "/api/v1/affiliate-programs": "affiliate_programs",
      "/api/v1/affiliate-account": "affiliate_accounts",
      "/api/v1/affiliate-accounts": "affiliate_accounts",
      "/api/v1/commercial-term": "commercial_terms",
      "/api/v1/commercial-terms": "commercial_terms",
      // Offers (System 2) -- note: intentionally no delete endpoint, see migration 0021
      "/api/v1/offer": "offers",
      "/api/v1/offers": "offers",
      // Tracking Links (System 3) -- note: intentionally no delete endpoint, see migration 0022
      "/api/v1/tracking-link": "tracking_links",
      "/api/v1/tracking-links": "tracking_links",
      // Analytics / Reporting (Phase 5)
      "/api/v1/campaign": "campaigns",
      "/api/v1/campaigns": "campaigns",
      "/api/v1/analytics/conversion": "analytics_conversions",
      "/api/v1/report": "reports",
      "/api/v1/reports": "reports",
      "/api/v1/analytics/alert": "analytics_alerts",
      "/api/v1/analytics/alert-rule": "analytics_alerts",
    };

    let resource = null;
    let action = "create";
    if (request.method === "DELETE") action = "delete";
    else if (request.method === "PUT") action = "update";

    for (const [prefix, res] of Object.entries(resourceMap)) {
      if (path.startsWith(prefix)) {
        resource = res;
        break;
      }
    }

    if (path.endsWith("/create") || path.endsWith("/save") || path.endsWith("/sync") || path.endsWith("/assign") || path.endsWith("/toggle") || path.endsWith("/reorder") || path.endsWith("/unassign") || path.endsWith("/bulk-assign") || path.endsWith("/update-assignment")) {
      action = "create";
    } else if (path.endsWith("/update")) {
      action = "update";
    } else if (path.endsWith("/delete")) {
      action = "delete";
    }

    if (resource && !permDB.checkPermission(userPermissions, resource, action)) {
      return json({
        success: false,
        error: `Forbidden: ${user.role} role cannot ${action} ${resource}`
      }, 403);
    }
  }


if (path === "/api/v1/dashboard") {
  return dashboardStatsAPI(request, env);
}


if (path === "/api/v1/old/geo/check") {
    const url = new URL(request.url);
    const slug = url.searchParams.get("slug");
    if (!slug) return failure("slug is required");

    const country = request.cf?.country || null;
    const rule = await geo.getGeoRule(env.DB, slug, country);

    if (rule) {
      return json({
        status: rule.status,
        country,
        bonusOverride: rule.bonus_override || null
      });
    }

    return json({
      status: "allowed",
      country,
      bonusOverride: null
    });
  }

  try {

    // ==================================
    // CASINOS
    // ==================================

    if (
      path === "/api/v1/casino/create" &&
      request.method === "POST"
    ) {
      return createCasino(request, env, user);
    }

    if (
      path === "/api/v1/casino/update" &&
      request.method === "POST"
    ) {
      return updateCasino(request, env, user);
    }

    if (
      path === "/api/v1/casino/delete" &&
      request.method === "POST"
    ) {
      return deleteCasino(request, env, user);
    }

if (path === "/api/v1/casinos/list") {
  const { condition, params } = await itemAccess.getAccessibleWhereClause(
    env.DB, user, 'casinos', 'read', ''
  );
  const whereClause = condition ? `WHERE ${condition}` : '';

  const casinos = await env.DB.prepare(
    `SELECT id, slug, name, rating, featured, sort_order, status, published
     FROM casinos ${whereClause}
     ORDER BY featured DESC, sort_order ASC, rating DESC`
  ).bind(...params).all();

  return json({ casinos: casinos.results });
}


if (path === "/api/v1/casino/get") {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");

  if (!slug) return failure("slug is required");

  const casino = await env.DB.prepare(`
    SELECT *
    FROM casinos
    WHERE slug = ?
    LIMIT 1
  `).bind(slug).first();

  if (!casino) return failure("Casino not found",404);
  // Item-level access check — prevents IDOR
  const canAccess = await itemAccess.canAccessItem(env.DB, user, 'casinos', 'read', casino);
  if (!canAccess) return failure("Casino not found", 404);

  const categoryRows = await env.DB.prepare(`
    SELECT category_id
    FROM casino_categories
    WHERE casino_id = ?
  `).bind(casino.id).all();

  casino.category_ids = (categoryRows.results || []).map(r => r.category_id);

  return json({
    success: true,
    casino
  });
}

// ==================================
// READ ENDPOINTS (add to api.js route handler)
// ==================================

// List reviews
if (path === "/api/v1/reviews/list") {
  const { condition, params } = await itemAccess.getAccessibleWhereClause(
    env.DB, user, 'reviews', 'read', ''
  );
  const whereParts = ['published = 1'];
  if (condition) whereParts.push(condition);
  const whereClause = 'WHERE ' + whereParts.join(' AND ');

  const result = await env.DB.prepare(
    `SELECT * FROM reviews ${whereClause} ORDER BY created_at DESC`
  ).bind(...params).all();
  return json({ reviews: result.results });
}

// List news
if (path === "/api/v1/news/list") {
  const { condition, params } = await itemAccess.getAccessibleWhereClause(
    env.DB, user, 'news', 'read', ''
  );
  const whereClause = condition ? `WHERE ${condition}` : '';

  const result = await env.DB.prepare(
    `SELECT n.*, m.url AS featured_image_url, m.thumbnail_url AS featured_image_thumbnail,
            m.alt_text AS featured_image_alt, a.name AS author_name, a.slug AS author_slug,
            a.avatar_url AS author_avatar, a.role AS author_role
     FROM news n
     LEFT JOIN media_library m ON m.id = n.featured_image
     LEFT JOIN authors a ON a.id = n.author_id
     ${whereClause}
     ORDER BY COALESCE(n.published_at, n.created_at) DESC`
  ).bind(...params).all();
  return json({ news: result.results });
}


if (path === "/api/v1/newsbackup2/list") {
  const { condition, params } = await itemAccess.getAccessibleWhereClause(
    env.DB, user, 'news', 'read', ''
  );
  const whereParts = ['1=1'];
//  const whereParts = ['n.published = 1'];
  if (condition) whereParts.push(condition);
  const whereClause = 'WHERE ' + whereParts.join(' AND ');

  const result = await env.DB.prepare(
    `SELECT n.*, m.url AS featured_image_url, m.thumbnail_url AS featured_image_thumbnail,
            m.alt_text AS featured_image_alt, a.name AS author_name, a.slug AS author_slug,
            a.avatar_url AS author_avatar, a.role AS author_role
     FROM news n
     LEFT JOIN media_library m ON m.id = n.featured_image
     LEFT JOIN authors a ON a.id = n.author_id
     ${whereClause}
     ORDER BY COALESCE(n.published_at, n.created_at) DESC`
  ).bind(...params).all();
  return json({ news: result.results });
}


if (path === "/api/v1/newsbackup/list") {
  const { condition, params } = await itemAccess.getAccessibleWhereClause(
    env.DB, user, 'news', 'read', ''
  );
  const whereParts = ['published = 1'];
  if (condition) whereParts.push(condition);
  const whereClause = 'WHERE ' + whereParts.join(' AND ');

  const result = await env.DB.prepare(
    `SELECT * FROM news ${whereClause} ORDER BY created_at DESC`
  ).bind(...params).all();
  return json({ news: result.results });
}

// List pages
if (path === "/api/v1/pages/list") {
  const { condition, params } = await itemAccess.getAccessibleWhereClause(
    env.DB, user, 'pages', 'read', ''
  );
  const whereClause = condition ? `WHERE ${condition}` : '';

  const result = await env.DB.prepare(
    `SELECT * FROM pages ${whereClause} ORDER BY created_at DESC`
  ).bind(...params).all();
  return json({ pages: result.results });
}


// List categories
if (path === "/api/v1/categories/list") {
  const result = await env.DB.prepare(`
    SELECT * FROM categories ORDER BY name
  `).all();
  return json({ categories: result.results });
}


// Get settings
if (path === "/api/v1/settings/get") {
  const result = await env.DB.prepare(`
    SELECT key, value FROM settings
  `).all();
  const settings = {};
  for (const row of result.results) {
    settings[row.key] = row.value;
  }
  return json({ settings });
}

// Get stats (already exists but move here for consistency)
if (path === "/api/v1/stats") {
  const casinos = await env.DB.prepare("SELECT COUNT(*) c FROM casinos").first();
  const reviews = await env.DB.prepare("SELECT COUNT(*) c FROM reviews").first();
  const clicks = await env.DB.prepare("SELECT COUNT(*) c FROM clicks").first();
  const pages = await env.DB.prepare("SELECT COUNT(*) c FROM pages").first();
  return json({
    casinos: casinos.c,
    reviews: reviews.c,
    clicks: clicks.c,
    pages: pages.c
  });
}
if (path === "/api/v1/stats/top-casinos") {
    const result = await env.DB.prepare(`
      SELECT casino_slug, COUNT(*) as clicks
      FROM clicks
      GROUP BY casino_slug
      ORDER BY clicks DESC
      LIMIT 20
    `).all();
    return json({ casinos: result.results });
  }

  if (path === "/api/v1/stats/countries") {
    const result = await env.DB.prepare(`
      SELECT country_code, COUNT(*) as clicks
      FROM clicks
      GROUP BY country_code
      ORDER BY clicks DESC
      LIMIT 100
    `).all();
    return json({ countries: result.results });
  }

    // ==================================
// NEWS
// ==================================

if (
  path === "/api/v1/news/create" &&
  request.method === "POST"
) {
  return createNews(request, env, user);
}

if (
  path === "/api/v1/news/update" &&
  request.method === "POST"
) {
  return updateNews(request, env, user);
}

if (
  path === "/api/v1/news/delete" &&
  request.method === "POST"
) {
  return deleteNews(request, env, user);
}

/* =========================================================
PLATFORM UPDATES ADMIN API========================================================= */
if (path === "/api/v1/platform-updates/list" &&request.method === "GET") {return listPlatformUpdates(request, env, user);}

if (path === "/api/v1/platform-updates/create" &&request.method === "POST") {return createPlatformUpdate(request, env, user);}

if (path === "/api/v1/platform-updates/update" &&request.method === "POST") {return updatePlatformUpdate(request, env, user);}

if (path === "/api/v1/platform-updates/delete" &&request.method === "POST") {return deletePlatformUpdate(request, env, user);}

/* =========================================================
SEO LANDING PAGES ADMIN API (country_custom / category_country)
========================================================= */
if (path === "/api/v1/seo-pages/list" && request.method === "GET") {return listSeoPagesEndpoint(request, env, user);}
if (path === "/api/v1/seo-pages/get" && request.method === "GET") {return getSeoPageEndpoint(request, env, user);}
if (path === "/api/v1/seo-pages/create" && request.method === "POST") {return createSeoPageEndpoint(request, env, user);}
if (path === "/api/v1/seo-pages/update" && request.method === "POST") {return updateSeoPageEndpoint(request, env, user);}
if (path === "/api/v1/seo-pages/delete" && request.method === "POST") {return deleteSeoPageEndpoint(request, env, user);}
if (path === "/api/v1/seo-pages/countries-search" && request.method === "GET") {return searchCountriesEndpoint(request, env, user);}
if (path === "/api/v1/seo-pages/eligible-casinos" && request.method === "GET") {return eligibleCasinosEndpoint(request, env, user);}
if (path === "/api/v1/seo-pages/discover" && request.method === "GET") {return discoverCategoryCountryEndpoint(request, env, user);}
if (path === "/api/v1/seo-pages/generate-draft" && request.method === "POST") {return generateCategoryCountryDraftEndpoint(request, env, user);}


    // ==================================
    // REVIEWS
    // ==================================

    if (
      path === "/api/v1/review/create" &&
      request.method === "POST"
    ) {
      return createReview(request, env, user);
    }

    if (
      path === "/api/v1/review/update" &&
      request.method === "POST"
    ) {
      return updateReview(request, env, user);
    }

    // ==================================
    // PAGES
    // ==================================

    if (
      path === "/api/v1/page/create" &&
      request.method === "POST"
    ) {
      return createPage(request, env, user);
    }

    if (
      path === "/api/v1/page/update" &&
      request.method === "POST"
    ) {
      return updatePage(request, env, user);
    }

    // ==================================
    // GEO RULES
    // ==================================
    if (
      path === "/api/v1/geo/save" &&
      request.method === "POST"
    ) {
      const result = await saveGeoRule(request, env);
      await invalidateCasinos(env);
      return result;
    }


        // ==================================
    // GEO RULES — BULK SYNC + LISTING
    // ==================================

    if (path === "/api/v1/geo/sync" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["casino_slug", "rules"]);
      const { setCasinoGeoRules } = await import("./database/geo.js");
      await setCasinoGeoRules(env.DB, body.casino_slug, body.rules);
      await invalidateCasinos(env);
      return success();
    }


    if (path === "/api/v1/geo/list" && request.method === "GET") {
      const url = new URL(request.url);
      const casinoSlug = url.searchParams.get("casino_slug");
      if (!casinoSlug) return failure("casino_slug is required");
      const { getGeoRulesForCasino } = await import("./database/geo.js");
      const rules = await getGeoRulesForCasino(env.DB, casinoSlug);
      return json({ rules });
    }


    // ==================================
    // AI REVIEW
    // ==================================

    if (
      path === "/api/v1/ai/review" &&
      request.method === "POST"
    ) {
      return generateReview(request, env);
    }


// ── LUMMET AI NON-STREAMING CHAT ──
if (path === "/api/v1/ai/chat" && request.method === "POST") {
  return handleChat(request, env, user);
}
    // ── LUMMET AI STREAMING CHAT ──
if (path === "/api/v1/ai/chat/stream" && request.method === "POST") {
  return handleChatStream(request, env, user);
}

// ── LUMMET AI CLEAR CONVERSATION ──
if (path === "/api/v1/ai/chat/clear" && request.method === "POST") {
  return handleClearChat(request, env, user);
}

    // ==================================
    // SETTINGS
    // ==================================

    if (
      path === "/api/v1/settings/save" &&
      request.method === "POST"
    ) {
      return saveSettings(request, env);
    }

    // ==================================
    // CATEGORIES CRUD
    // ==================================
    if (path === "/api/v1/category/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["slug", "name"]);
      await categories.createCategory(env.DB, body);
      await invalidateCategories(env);
      await invalidateNav(env);
      return success();
    }

    if (path === "/api/v1/category/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["slug", "name"]);
      const { updateCategory } = await import("./database/categories.js");
      await updateCategory(env.DB, body.slug, body);
      await invalidateCategories(env);
      await invalidateNav(env);
      return success();
    }
    if (path === "/api/v1/category/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["slug"]);
      const { deleteCategory } = await import("./database/categories.js");
      await deleteCategory(env.DB, body.slug);
      await invalidateCategories(env);
      await invalidateNav(env);
      return success();
    }

    // Section-level casino pickers on the base category hub page
    // (countries.html/categories.html "Content sections" builder)
    // have no country context, unlike seo-pages' eligible-casinos —
    // they pull every casino already in this category, matching
    // exactly what the category page's own automatic grid shows.
    if (path === "/api/v1/category/eligible-casinos" && request.method === "GET") {
      const urlObj = new URL(request.url);
      const slug = urlObj.searchParams.get("slug");
      if (!slug) return failure("slug is required", 422);
      const rows = await categories.getCategoryCasinos(env.DB, slug);
      return json({ success: true, casinos: rows });
    }



    // ==================================
    // COUNTRIES CRUD
    // ==================================
    if (path === "/api/v1/country/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["code", "name"]);
      const { createCountry } = await import("./database/countries.js");
      await createCountry(env.DB, body);
      await invalidateCountries(env);
      await invalidateNav(env);
      return success();
    }

    if (path === "/api/v1/country/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["code", "name"]);
      const { updateCountry } = await import("./database/countries.js");
      await updateCountry(env.DB, body.code, body);
      await invalidateCountries(env);
      await invalidateNav(env);
      return success();
    }

    if (path === "/api/v1/country/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["code"]);
      const { deleteCountry } = await import("./database/countries.js");
      await deleteCountry(env.DB, body.code);
      await invalidateCountries(env);
      await invalidateNav(env);
      return success();
    }


    if (path === "/api/v1/countries/list") {
      const result = await env.DB.prepare("SELECT * FROM countries ORDER BY name").all();
      return json({ countries: result.results });
    }


    // ==================================
    // REVIEW DELETE + PAGE DELETE
    // ==================================

    if (path === "/api/v1/review/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["slug"]);

      const existing = await itemAccess.getItemBySlug(env.DB, 'reviews', body.slug);
      if (!existing) return failure("Review not found", 404);
      const canDelete = await itemAccess.canAccessItem(env.DB, user, 'reviews', 'delete', existing);
      if (!canDelete) return failure("Review not found", 404);

      const { deleteReview } = await import("./database/reviews.js");
      await deleteReview(env.DB, body.slug);
      return success();
    }

    if (path === "/api/v1/page/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["slug"]);

      const existing = await itemAccess.getItemBySlug(env.DB, 'pages', body.slug);
      if (!existing) return failure("Page not found", 404);
      const canDelete = await itemAccess.canAccessItem(env.DB, user, 'pages', 'delete', existing);
      if (!canDelete) return failure("Page not found", 404);

      const { deletePage } = await import("./database/pages.js");
      await deletePage(env.DB, body.slug);
      return success();
    }

    // ==================================
    // COMPONENTS CRUD
    // ==================================

    if (path === "/api/v1/components/list") {
      const url = new URL(request.url);
      const type = url.searchParams.get("type");
      const result = await componentsDB.getAllComponents(env.DB, type);
      return json({ components: result });
    }

    if (path === "/api/v1/component/get" && request.method === "GET") {
      const url = new URL(request.url);
      const id = parseInt(url.searchParams.get("id"));
      if (!id) return failure("id is required");
      const component = await componentsDB.getComponent(env.DB, id);
      if (!component) return failure("Component not found", 404);
      return json({ success: true, component });
    }

    if (path === "/api/v1/component/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["name", "type"]);
      const id = await componentsDB.createComponent(env.DB, body);
      return json({ success: true, id });
    }

    if (path === "/api/v1/component/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "name", "type"]);
      await componentsDB.updateComponent(env.DB, body.id, body);
      return success();
    }

    if (path === "/api/v1/component/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      await componentsDB.deleteComponent(env.DB, body.id);
      return success();
    }

    // ==================================
    // PAGE-COMPONENT ASSIGNMENTS
    // ==================================

    if (path === "/api/v1/components/assign" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["page_type", "page_slug", "component_id"]);
      await componentsDB.assignComponentToPage(env.DB, body);
      return success();
    }

    if (path === "/api/v1/components/bulk-assign" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["page_type", "component_id"]);
      await componentsDB.bulkAssignComponent(env.DB, body);
      return success();
    }
    if (path === "/api/v1/components/unassign" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      await componentsDB.removePageComponent(env.DB, body.id);
      return success();
    }

    if (path === "/api/v1/components/page" && request.method === "GET") {
      const url = new URL(request.url);
      const pageType = url.searchParams.get("page_type");
      const pageSlug = url.searchParams.get("page_slug");
      if (!pageType || !pageSlug) return failure("page_type and page_slug are required");
      const assignments = await componentsDB.getAllPageAssignments(env.DB, pageType, pageSlug);
      return json({ assignments });
    }

    if (path === "/api/v1/components/reorder" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["items"]);
      for (const item of body.items) {
        await componentsDB.updatePageComponentPosition(env.DB, item.id, item.position);
      }
      return success();
    }

    if (path === "/api/v1/components/toggle" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "enabled"]);
      await componentsDB.togglePageComponent(env.DB, body.id, body.enabled);
      return success();
    }

    if (path === "/api/v1/components/update-assignment" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      await componentsDB.updatePageComponentAssignment(env.DB, body.id, body);
      return success();
    }

    // ============================================================
// AD RULES API — with authorization + validation
// ============================================================

// ── Authorization helper ─────────────────────────────────

async function requireAdAdmin(request, env) {
  const user = await getCurrentUser(request, env);
  if (!user) throw new Error('Authentication required');
  if (user.role !== 'admin' && user.role !== 'editor') {
    throw new Error('Insufficient permissions. Admin or editor role required.');
  }
  return user;
}

// ── Routes ───────────────────────────────────────────────
  if (path === "/api/v1/ad-rules/list" && request.method === "GET") {
    try {
      const user = await requireAdAdmin(request, env);
      const rules = await adRulesDB.getAllAdRules(env.DB);
      return json({ rules });
    } catch (e) {
      return json({ error: e.message }, 403);
    }
  }

  if (path === "/api/v1/ad-rules/create" && request.method === "POST") {
    try {
      await requireAdAdmin(request, env);
      const body = await request.json();
      await adRulesDB.createAdRule(env.DB, body);
      return json({ success: true });
    } catch (e) {
      return json({ error: e.message }, 400);
    }
  }

  if (path === "/api/v1/ad-rules/update" && request.method === "POST") {
    try {
      await requireAdAdmin(request, env);
      const body = await request.json();
      await adRulesDB.updateAdRule(env.DB, body.id, body);
      return json({ success: true });
    } catch (e) {
      return json({ error: e.message }, 400);
    }
  }

  if (path === "/api/v1/ad-rules/delete" && request.method === "POST") {
    try {
      await requireAdAdmin(request, env);
      const body = await request.json();
      await adRulesDB.deleteAdRule(env.DB, body.id);
      return json({ success: true });
    } catch (e) {
      return json({ error: e.message }, 400);
    }
  }

  if (path === "/api/v1/ad-rules/validate" && request.method === "POST") {
    try {
      await requireAdAdmin(request, env);
      const body = await request.json();
      const { VALID_PLACEMENTS, VALID_DEVICES, VALID_PAGE_TYPES } = adRulesDB;
      return json({
        valid_placements: VALID_PLACEMENTS,
        valid_devices: VALID_DEVICES,
        valid_page_types: VALID_PAGE_TYPES
      });
    } catch (e) {
      return json({ error: e.message }, 403);
    }
  }



    // ==================================
    // REVIEW BLOCKS CRUD
    // ==================================

    if (path === "/api/v1/review-blocks/list" && request.method === "GET") {
      const url = new URL(request.url);
      const reviewSlug = url.searchParams.get("review_slug");
      if (!reviewSlug) return failure("review_slug is required");
      const blocks = await reviewBlocksDB.getReviewBlocks(env.DB, reviewSlug);
      return json({ blocks });
    }

    if (path === "/api/v1/review-blocks/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["review_slug", "title", "content"]);
      const id = await reviewBlocksDB.createReviewBlock(env.DB, body);
      return json({ success: true, id });
    }

    if (path === "/api/v1/review-blocks/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "title", "content"]);
      await reviewBlocksDB.updateReviewBlock(env.DB, body.id, body);
      return success();
    }

    if (path === "/api/v1/review-blocks/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      await reviewBlocksDB.deleteReviewBlock(env.DB, body.id);
      return success();
    }

    if (path === "/api/v1/review-blocks/sync" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["review_slug", "blocks"]);
      await reviewBlocksDB.syncReviewBlocks(env.DB, body.review_slug, body.blocks);
      return success();
    }

    // ==================================
    // SEO META CRUD
    // ==================================

    if (path === "/api/v1/seo/list") {
      const result = await seoMetaDB.getAllSeoMeta(env.DB);
      return json({ seo: result });
    }

    if (path === "/api/v1/seo/get" && request.method === "GET") {
      const url = new URL(request.url);
      const pageType = url.searchParams.get("page_type");
      const pageSlug = url.searchParams.get("page_slug");
      if (!pageType || !pageSlug) return failure("page_type and page_slug are required");
      const seo = await seoMetaDB.getSeoMeta(env.DB, pageType, pageSlug);
      return json({ seo: seo || null });
    }

    if (path === "/api/v1/seo/save" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["page_type", "page_slug"]);
      await seoMetaDB.upsertSeoMeta(env.DB, body);
      return success();
    }

    if (path === "/api/v1/seo/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["page_type", "page_slug"]);
      await seoMetaDB.deleteSeoMeta(env.DB, body.page_type, body.page_slug);
      return success();
    }
    // ==================================
    // AUTHORS CRUD
    // ==================================

    if (path === "/api/v1/authors/list") {
      const result = await authorsDB.getAllAuthorsAdmin(env.DB);
      return json({ authors: result });
    }

    if (path === "/api/v1/author/get" && request.method === "GET") {
      const url = new URL(request.url);
      const id = parseInt(url.searchParams.get("id"));
      if (!id) return failure("id is required");
      const author = await authorsDB.getAuthorById(env.DB, id);
      if (!author) return failure("Author not found", 404);
      return json({ success: true, author });
    }

    if (path === "/api/v1/author/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["slug", "name"]);
      const id = await authorsDB.createAuthor(env.DB, body);
      return json({ success: true, id });
    }

    if (path === "/api/v1/author/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "slug", "name"]);
      await authorsDB.updateAuthor(env.DB, body.id, body);
      return success();
    }

    if (path === "/api/v1/author/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      await authorsDB.deleteAuthor(env.DB, body.id);
      return success();
    }

    if (path === "/api/v1/author/content" && request.method === "GET") {
      const url = new URL(request.url);
      const id = parseInt(url.searchParams.get("id"));
      if (!id) return failure("id is required");
      const content = await authorsDB.getAuthorContent(env.DB, id);
      const stats = await authorsDB.getAuthorStats(env.DB, id);
      return json({ content, stats });
    }
        // ==================================
    // CATEGORY GET BY ID (for edit)
    // ==================================

    if (path === "/api/v1/category/get-by-id" && request.method === "GET") {
      const url = new URL(request.url);
      const id = parseInt(url.searchParams.get("id"));
      if (!id) return failure("id is required");
      const { getCategoryById } = await import("./database/categories.js");
      const category = await getCategoryById(env.DB, id);
      if (!category) return failure("Category not found", 404);
      return json({ success: true, category });
    }

    // ==================================
    // COUNTRY GET BY ID (for edit)
    // ==================================

    if (path === "/api/v1/country/get-by-id" && request.method === "GET") {
      const url = new URL(request.url);
      const id = parseInt(url.searchParams.get("id"));
      if (!id) return failure("id is required");
      const { getCountryById } = await import("./database/countries.js");
      const country = await getCountryById(env.DB, id);
      if (!country) return failure("Country not found", 404);
      return json({ success: true, country });
    }

    if (path === "/api/v1/country/get-by-code" && request.method === "GET") {
      const url = new URL(request.url);
      const code = url.searchParams.get("code");
      if (!code) return failure("code is required");
      const { getCountry } = await import("./database/countries.js");
      const country = await getCountry(env.DB, code.toUpperCase());
      if (!country) return failure("Country not found", 404);
      return json({ success: true, country });
    }
    // ==================================
    // MEDIA LIBRARY CRUD
    // ==================================

    if (path === "/api/v1/media/list") {
      const url = new URL(request.url);
      const folder = url.searchParams.get("folder");
      const result = await mediaDB.getAllMedia(env.DB, folder);
      return json({ media: result });
    }

    if (path === "/api/v1/media/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["filename", "url"]);
      const id = await mediaDB.createMedia(env.DB, {
        ...body,
        uploaded_by: user?.id || null
      });
      return json({ success: true, id });
    }

    if (path === "/api/v1/media/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      await mediaDB.updateMedia(env.DB, body.id, body);
      return success();
    }

    if (path === "/api/v1/media/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      await mediaDB.deleteMedia(env.DB, body.id);
      return success();
    }

    if (path === "/api/v1/media/folders") {
      const result = await mediaDB.getMediaFolders(env.DB);
      return json({ folders: result });
    }

    // ==================================
    // MEDIA LIBRARY — R2 UPLOAD & ENHANCED API (Phase 3)
    // All routes below use the same flat-if pattern, json/success/failure
    // helpers, and validate() as the rest of api.js.
    // Permission checks are handled by the existing resourceMap
    // ("/api/v1/media" → "media" resource) and action detection
    // (path ending in /create, /update, /delete).
    // ==================================

    // R2 file upload (multipart/form-data)
    // Permission: POST → "/api/v1/media" → "media" → "create"
    if (path === "/api/v1/media/upload" && request.method === "POST") {
      return await handleUpload(request, env, user);
    }

    // R2 file delete (removes from R2 bucket + D1 record)
    // Permission: POST → path ends with "/delete" → "media" → "delete"
    if (path === "/api/v1/media/r2/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      return await handleDelete(request, env, user, body.id);
    }

    // Enhanced media list with pagination, type filter, sort
    // Permission: GET → no write-method check needed
    if (path === "/api/v1/media/browse") {
      const url = new URL(request.url);
      const result = await listMedia(env, {
        type: url.searchParams.get("type") || null,
        folder: url.searchParams.get("folder") || null,
        uploaded_by: url.searchParams.get("uploaded_by") || null,
        limit: parseInt(url.searchParams.get("limit") || "50", 10),
        offset: parseInt(url.searchParams.get("offset") || "0", 10),
        sort: url.searchParams.get("sort") || "created_at",
        order: url.searchParams.get("order") || "DESC",
      });
      return json({ success: true, ...result });
    }

    // Media search by filename or alt text
    // Permission: GET → no write-method check needed
    if (path === "/api/v1/media/search") {
      const url = new URL(request.url);
      const query = url.searchParams.get("q") || "";
      const limit = parseInt(url.searchParams.get("limit") || "50", 10);
      const offset = parseInt(url.searchParams.get("offset") || "0", 10);
      if (!query.trim()) return json({ success: true, results: [] });
      const results = await searchMedia(env, query.trim(), limit, offset);
      return json({ success: true, results });
    }

    // Get single media item by ID
    // Permission: GET → no write-method check needed
    if (path === "/api/v1/media/get") {
      const url = new URL(request.url);
      const id = parseInt(url.searchParams.get("id"), 10);
      if (!id) return failure("id is required");
      const media = await getMediaById(env, id);
      if (!media) return failure("Media not found", 404);
      return json({ success: true, media });
    }

    // Update media metadata (alt_text, caption, folder, type)
    // Permission: POST → path ends with "/update" → "media" → "update"
    if (path === "/api/v1/media/meta/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      const updated = await updateMediaItem(env, body.id, {
        alt_text: body.alt_text,
        caption: body.caption,
        folder: body.folder,
        type: body.type,
      });
      if (!updated) return failure("Media not found or no changes", 404);
      return success();
    }

    // Enhanced folder tree for media library UI
    // Permission: GET → no write-method check needed
    if (path === "/api/v1/media/folders/tree") {
      const tree = await buildFolderTree(env);
      return json({ success: true, folders: tree });
    }

    // Folder create
    // Permission: POST → path ends with "/create" → "media" → "create"
    if (path === "/api/v1/media/folder/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["name", "slug"]);
      const slug = body.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (!slug) return failure("Invalid slug");
      const existing = await getFolderBySlug(env, slug);
      if (existing) return failure("A folder with this slug already exists", 409);
      const folder = await createFolder(env, body.name, slug, body.parent_id || null);
      return json({ success: true, folder });
    }

    // Folder rename
    // Permission: POST → path ends with "/update" → "media" → "update"
    if (path === "/api/v1/media/folder/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "name"]);
      const slug = (body.slug || body.name).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      const existing = await getFolderBySlug(env, slug);
      if (existing && existing.id !== body.id) return failure("A folder with this slug already exists", 409);
      const updated = await updateFolder(env, body.id, body.name, slug);
      if (!updated) return failure("Folder not found", 404);
      return success();
    }

    // Folder delete
    // Permission: POST → path ends with "/delete" → "media" → "delete"
    if (path === "/api/v1/media/folder/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      const folder = await getFolderById(env, body.id);
      if (!folder) return failure("Folder not found", 404);
      if (['general', 'logos', 'banners', 'reviews', 'news', 'pages', 'videos'].includes(folder.slug)) {
        return failure("Cannot delete default folders");
      }
      const deleted = await deleteFolder(env, body.id);
      if (!deleted) return failure("Folder not found", 404);
      return success();
    }

    // Count media in folder
    // Permission: GET → no write-method check needed
    if (path === "/api/v1/media/folder/count") {
      const url = new URL(request.url);
      const id = parseInt(url.searchParams.get("id"), 10);
      if (!id) return failure("id is required");
      const folder = await getFolderById(env, id);
      if (!folder) return failure("Folder not found", 404);
      const count = await countMediaInFolder(env, folder.slug);
      return json({ success: true, count });
    }


    // ==================================
    // NAVIGATION CRUD
    // ==================================


    // ==================================
    // NAVIGATION CRUD
    // ==================================

    if (path === "/api/v1/nav/list") {
      const url = new URL(request.url);
      const location = url.searchParams.get("location");
      const result = location
        ? await navDB.getNavItems(env.DB, location)
        : await navDB.getAllNavItems(env.DB);
      return json({ nav: result });
    }

    if (path === "/api/v1/nav/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["label", "url", "location"]);

      // Reuse the existing URL sanitizer (sanitize.js) — blocks
      // javascript:/vbscript:/unsafe data: schemes while allowing
      // legitimate internal and external URLs. Applies to every
      // nav location (header/footer/mobile/page) equally.
      const safeUrl = sanitizeUrl(body.url, false);
      if (!safeUrl) {
        return failure("Invalid or unsafe URL");
      }
      body.url = safeUrl;

      const id = await navDB.createNavItem(env.DB, body);
      await invalidateNav(env);
      return json({ success: true, id });
    }

    if (path === "/api/v1/nav/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "label", "url", "location"]);

      const safeUrl = sanitizeUrl(body.url, false);
      if (!safeUrl) {
        return failure("Invalid or unsafe URL");
      }
      body.url = safeUrl;

      await navDB.updateNavItem(env.DB, body.id, body);
      await invalidateNav(env);
      return success();
    }

    if (path === "/api/v1/nav/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);

      // Explicit cleanup of any PageNav GEO rules for this item.
      // We do not rely solely on page_nav_geo_rules' ON DELETE
      // CASCADE foreign key, since D1's SQLite foreign-key
      // enforcement is not guaranteed in every environment. This
      // is a no-op for nav items with no GEO rules (i.e. every
      // existing header/footer/mobile item today), so it does not
      // change existing deletion behavior for those locations.
      await navDB.deletePageNavGeoRulesForItem(env.DB, body.id);

      await navDB.deleteNavItem(env.DB, body.id);
      await invalidateNav(env);
      return success();
    }

    // ==================================
    // PAGE NAV — GEO RULES CRUD
    // ==================================
    // Uses the same "nav" permission resource as the rest of
    // nav CRUD above (see resourceMap/readResourceMap) — no new
    // permission resource was introduced.

    if (path === "/api/v1/nav/geo/list") {
      const url = new URL(request.url);
      const navItemId = parseInt(url.searchParams.get("nav_item_id"), 10);

      if (!navItemId || navItemId <= 0) {
        return failure("A valid nav_item_id is required");
      }

      const rules = await navDB.getPageNavGeoRules(env.DB, navItemId);
      return json({ rules });
    }

    if (path === "/api/v1/nav/geo/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["nav_item_id", "country_code", "status"]);

      const navItemId = parseInt(body.nav_item_id, 10);
      if (!navItemId || navItemId <= 0) {
        return failure("A valid nav_item_id is required");
      }

      const existingItem = await env.DB.prepare(`
        SELECT id FROM nav_items WHERE id = ?
      `).bind(navItemId).first();
      if (!existingItem) {
        return failure("Nav item not found", 404);
      }

      const countryCode = String(body.country_code || "").trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(countryCode)) {
        return failure("country_code must be a 2-letter ISO country code (e.g. CA, NZ, GB)");
      }

      const status = String(body.status || "").trim().toLowerCase();
      const allowedStatuses = ["allowed", "blocked", "restricted"];
      if (!allowedStatuses.includes(status)) {
        return failure(`status must be one of: ${allowedStatuses.join(", ")}`);
      }

      const id = await navDB.createPageNavGeoRule(env.DB, {
        nav_item_id: navItemId,
        country_code: countryCode,
        status
      });

      await invalidateNav(env);

      return json({ success: true, id });
    }

    if (path === "/api/v1/nav/geo/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);

      await navDB.deletePageNavGeoRule(env.DB, body.id);
      await invalidateNav(env);

      return success();
    }

    // CURRENT USER PERMISSIONS
    // Returns only the authenticated user's effective permissions.
    // This is intentionally separate from /permissions/list,
    // which exposes the full permission matrix to authorized users.

    if (path === "/api/v1/user/permissions" && request.method === "GET") {
      return json({
        success: true,
        permissions: userPermissions || {}
      });
    }

    // ==================================
    // PERMISSIONS MANAGEMENT
    // ==================================

    if (path === "/api/v1/permissions/list") {
      const matrix = await permDB.getPermissionMatrix(env.DB);
      return json({ permissions: matrix });
    }

    if (path === "/api/v1/permissions/save" && request.method === "POST") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const body = await request.json();
      validate(body, ["role", "resource", "action", "allowed"]);
      await permDB.setPermission(
        env.DB,
        body.role,
        body.resource,
        body.action,
        body.allowed
      );
      return success();
    }

    if (path === "/api/v1/permissions/bulk-save" && request.method === "POST") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const body = await request.json();
      validate(body, ["role", "permissions"]);
      for (const perm of body.permissions) {
        await permDB.setPermission(
          env.DB,
          body.role,
          perm.resource,
          perm.action,
          perm.allowed
        );
      }
      return success();
    }

    // ==================================
    // ITEM-LEVEL ACCESS MANAGEMENT (admin only)
    // ==================================

    if (path === "/api/v1/admin/item-access/user" && request.method === "GET") {
      return handleGetUserItemAccess(request, env, user);
    }
    if (path === "/api/v1/admin/item-access/set" && request.method === "POST") {
      return handleSetUserItemAccess(request, env, user);
    }
    if (path === "/api/v1/admin/item-access/delete" && request.method === "POST") {
      return handleDeleteUserItemAccess(request, env, user);
    }
    if (path === "/api/v1/admin/item-access/assign" && request.method === "POST") {
      return handleAssignItem(request, env, user);
    }
    if (path === "/api/v1/admin/item-access/unassign" && request.method === "POST") {
      return handleUnassignItem(request, env, user);
    }
    if (path === "/api/v1/admin/item-access/assignments" && request.method === "GET") {
      return handleGetUserAssignments(request, env, user);
    }
    if (path === "/api/v1/admin/item-access/assignees" && request.method === "GET") {
      return handleGetItemAssignees(request, env, user);
    }
    if (path === "/api/v1/admin/item-access/resources" && request.method === "GET") {
      return handleGetResources(request, env, user);
    }
    if (path === "/api/v1/admin/item-access/default-scope" && request.method === "GET") {
      return handleGetDefaultScope(request, env, user);
    }
    if (path === "/api/v1/admin/item-access/default-scope" && request.method === "POST") {
      return handleSetDefaultScope(request, env, user);
    }

    // ==================================
    // USER DASHBOARD — BOOKMARKS
    // ==================================

    if (path === "/api/v1/user/bookmarks" && request.method === "GET") {
      const bookmarks = await userDash.getBookmarks(env.DB, user.user_id);
      return json({ bookmarks });
    }

    if (path === "/api/v1/user/bookmark/add" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["casino_slug"]);
      await userDash.addBookmark(env.DB, user.user_id, body.casino_slug);
      return success();
    }

    if (path === "/api/v1/user/bookmark/remove" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["casino_slug"]);
      await userDash.removeBookmark(env.DB, user.user_id, body.casino_slug);
      return success();
    }

    // ==================================
    // USER DASHBOARD — INQUIRIES
    // ==================================

    if (path === "/api/v1/user/inquiries" && request.method === "GET") {
      const inquiries = await userDash.getInquiries(env.DB, user.user_id);
      return json({ inquiries });
    }

    if (path === "/api/v1/user/inquiry/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["subject", "message"]);
      const id = await userDash.createInquiry(env.DB, user.user_id, body.subject, body.message);
      return json({ success: true, id });
    }

    // ==================================
    // USER DASHBOARD — NOTIFICATIONS
    // ==================================

    if (path === "/api/v1/user/notifications" && request.method === "GET") {
      const notifications = await userDash.getNotifications(env.DB, user.user_id);
      return json({ notifications });
    }

    if (path === "/api/v1/user/notification/read" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      await userDash.markNotificationRead(env.DB, body.id);
      return success();
    }

    if (path === "/api/v1/user/notifications/read-all" && request.method === "POST") {
      await userDash.markAllNotificationsRead(env.DB, user.user_id);
      return success();
    }

    // ==================================
    // USER DASHBOARD — CASINO SUBMISSIONS
    // ==================================

    if (path === "/api/v1/user/submissions" && request.method === "GET") {
      const submissions = await userDash.getSubmissions(env.DB, user.user_id);
      return json({ submissions });
    }

    if (path === "/api/v1/user/submit-casino" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["name", "website_url"]);
      const id = await userDash.createSubmission(env.DB, user.user_id, body);
      return json({ success: true, id });
    }

    // ==================================
    // USER DASHBOARD — PROFILE
    // ==================================

    if (path === "/api/v1/user/profile" && request.method === "GET") {
      return json({
        user: {
          id: user.user_id,
          email: user.email,
          role: user.role
        }
      });
    }

    if (path === "/api/v1/user/profile/update" && request.method === "POST") {
      const body = await request.json();
      await userDash.updateUserProfile(env.DB, user.user_id, body);
      return success();
    }

    // ==================================
    // ADMIN — USER MANAGEMENT
    // ==================================

    if (path === "/api/v1/admin/users" && request.method === "GET") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const users = await adminTools.getAllUsers(env.DB);
      return json({ users });
    }

    if (path === "/api/v1/admin/user/update-role" && request.method === "POST") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const body = await request.json();
      validate(body, ["id", "role"]);
      if (!["admin", "editor", "viewer"].includes(body.role)) {
        return failure("Invalid role. Must be admin, editor, or viewer");
      }
      await adminTools.updateUserRole(env.DB, body.id, body.role);
      return success();
    }

    if (path === "/api/v1/admin/user/delete" && request.method === "POST") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const body = await request.json();
      validate(body, ["id"]);
      // Prevent self-deletion
      if (body.id === user.user_id) {
        return failure("Cannot delete your own account");
      }
      try {
        await adminTools.deleteUser(env.DB, body.id);
        return success();
      } catch (e) {
        return failure(e.message);
      }
    }

    // ==================================
    // ADMIN — SEND NOTIFICATIONS
    // ==================================

    if (path === "/api/v1/admin/notification/send" && request.method === "POST") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const body = await request.json();
      validate(body, ["title", "target"]);

      let count = 0;
      if (body.target === "all") {
        validate(body, ["title", "message"]);
        count = await adminTools.sendNotificationToAll(env.DB, body.title, body.message, body.link || null);
      } else if (body.target === "role") {
        validate(body, ["title", "message", "role"]);
        count = await adminTools.sendNotificationToRole(env.DB, body.role, body.title, body.message, body.link || null);
      } else if (body.target === "user") {
        validate(body, ["title", "message", "user_id"]);
        await adminTools.sendNotificationToUser(env.DB, body.user_id, body.title, body.message, body.link || null);
        count = 1;
      } else {
        return failure("Invalid target. Use 'all', 'role', or 'user'");
      }
      return json({ success: true, sent: count });
    }

    // ==================================
    // ADMIN — SUBMISSION MANAGEMENT
    // ==================================

    if (path === "/api/v1/admin/submissions" && request.method === "GET") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const submissions = await userDash.getAllSubmissions(env.DB);
      return json({ submissions });
    }

    if (path === "/api/v1/admin/submission/update" && request.method === "POST") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const body = await request.json();
      validate(body, ["id", "status"]);
      if (!["pending", "approved", "rejected"].includes(body.status)) {
        return failure("Invalid status. Use pending, approved, or rejected");
      }
      await userDash.updateSubmissionStatus(env.DB, body.id, body.status, body.admin_notes || null);

      // Notify the user about the status change
      const submission = await env.DB.prepare(
        "SELECT user_id, name FROM casino_submissions WHERE id = ?"
      ).bind(body.id).first();

      if (submission) {
        const statusMsg = body.status === "approved"
          ? `Your submission "${submission.name}" has been approved!`
          : `Your submission "${submission.name}" has been rejected.`;
        await adminTools.sendNotificationToUser(
          env.DB,
          submission.user_id,
          "Submission Update",
          body.admin_notes ? `${statusMsg} Note: ${body.admin_notes}` : statusMsg,
          "/en/user/submit-casino"
        );
      }
      return success();
    }

    // ==================================
    // ADMIN — INQUIRY MANAGEMENT
    // ==================================

    if (path === "/api/v1/admin/inquiries" && request.method === "GET") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const inquiries = await userDash.getAllInquiries(env.DB);
      return json({ inquiries });
    }

    if (path === "/api/v1/admin/inquiry/reply" && request.method === "POST") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const body = await request.json();
      validate(body, ["id", "reply"]);
      await userDash.replyToInquiry(env.DB, body.id, body.reply);

      // Notify user
      const inquiry = await env.DB.prepare(
        "SELECT user_id, subject FROM user_inquiries WHERE id = ?"
      ).bind(body.id).first();

      if (inquiry) {
        await adminTools.sendNotificationToUser(
          env.DB,
          inquiry.user_id,
          "Inquiry Answered",
          `Your inquiry "${inquiry.subject}" has been answered.`,
          "/en/user/inquiries"
        );
      }
      return success();
    }

    // ==================================
    // AFFILIATE PARTNERS
    // ==================================

    if (path === "/api/v1/affiliate-partners/list") {
      const { condition, params } = await itemAccess.getAccessibleWhereClause(
        env.DB, user, 'affiliate_partners', 'read', ''
      );
      const url = new URL(request.url);
      const status = url.searchParams.get("status");
      const search = url.searchParams.get("search");

      const clauses = [];
      const bindParams = [...params];
      if (condition) clauses.push(condition);
      if (status) { clauses.push("status = ?"); bindParams.push(status); }
      if (search) { clauses.push("(name LIKE ? OR slug LIKE ?)"); bindParams.push(`%${search}%`, `%${search}%`); }

      const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : '';
      const result = await env.DB.prepare(
        `SELECT * FROM affiliate_partners ${whereClause} ORDER BY name ASC`
      ).bind(...bindParams).all();

      return json({ success: true, partners: result.results || [] });
    }

    if (path === "/api/v1/affiliate-partner/get") {
      const url = new URL(request.url);
      const id = Number(url.searchParams.get("id"));
      if (!id) return failure("id is required");

      const partner = await affiliatePartners.getPartnerById(env.DB, id);
      if (!partner) return failure("Partner not found", 404);

      const canAccess = await itemAccess.canAccessItem(env.DB, user, 'affiliate_partners', 'read', partner);
      if (!canAccess) return failure("Partner not found", 404);

      partner.contacts = await affiliatePartners.getPartnerContacts(env.DB, id);
      return json({ success: true, partner });
    }

    if (path === "/api/v1/affiliate-partner/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["name"]);

      body.slug = body.slug
        ? body.slug
        : await affiliatePartners.generateUniquePartnerSlug(env.DB, body.name);

      // SECURITY: ownership set server-side, never trust body.created_by
      body.created_by = user.user_id;
      const id = await affiliatePartners.createPartner(env.DB, body);
      await logAudit(env.DB, { userId: user.user_id, action: 'create', entityType: 'affiliate_partner', entityId: id, metadata: { name: body.name, status: body.status || 'active' } });
      return success({ id });
    }

    if (path === "/api/v1/affiliate-partner/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "name"]);

      const existing = await itemAccess.getItemById(env.DB, 'affiliate_partners', body.id);
      if (!existing) return failure("Partner not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'affiliate_partners', 'update', existing);
      if (!canUpdate) return failure("Partner not found", 404);

      body.slug = body.slug || existing.slug;
      body.updated_by = user.user_id;
      await affiliatePartners.updatePartner(env.DB, body.id, body);
      await logAudit(env.DB, { userId: user.user_id, action: 'update', entityType: 'affiliate_partner', entityId: body.id, metadata: { name: body.name, status: body.status, previous_status: existing.status } });
      return success();
    }

    if (path === "/api/v1/affiliate-partner/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);

      const existing = await itemAccess.getItemById(env.DB, 'affiliate_partners', body.id);
      if (!existing) return failure("Partner not found", 404);
      const canDelete = await itemAccess.canAccessItem(env.DB, user, 'affiliate_partners', 'delete', existing);
      if (!canDelete) return failure("Partner not found", 404);

      const dependents = await affiliatePartners.getPartnerDependents(env.DB, body.id);
      if (dependents) {
        return failure(
          `Cannot delete: this partner has ${dependents.programs} affiliate program(s) attached. ` +
          `Archive the partner instead, or remove the programs first.`,
          409
        );
      }
      const trackingDependents = await trackingLinksDB.getPartnerTrackingLinkDependents(env.DB, body.id);
      if (trackingDependents) {
        return failure(
          `Cannot delete: this partner has ${trackingDependents.tracking_links} tracking link(s) directly attached. ` +
          `Archive the partner instead, or remove those tracking links first.`,
          409
        );
      }

      await affiliatePartners.deletePartner(env.DB, body.id);
      await logAudit(env.DB, { userId: user.user_id, action: 'delete', entityType: 'affiliate_partner', entityId: body.id, metadata: { name: existing.name } });
      return success();
    }

    if (path === "/api/v1/affiliate-partner/contact/add" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["partner_id", "name"]);

      const existing = await itemAccess.getItemById(env.DB, 'affiliate_partners', body.partner_id);
      if (!existing) return failure("Partner not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'affiliate_partners', 'update', existing);
      if (!canUpdate) return failure("Partner not found", 404);

      const contactId = await affiliatePartners.addPartnerContact(env.DB, body.partner_id, body);
      await logAudit(env.DB, { userId: user.user_id, action: 'create', entityType: 'affiliate_partner_contact', entityId: contactId, metadata: { partner_id: body.partner_id, name: body.name } });
      return success({ id: contactId });
    }

    if (path === "/api/v1/affiliate-partner/contact/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      await affiliatePartners.deletePartnerContact(env.DB, body.id);
      await logAudit(env.DB, { userId: user.user_id, action: 'delete', entityType: 'affiliate_partner_contact', entityId: body.id });
      return success();
    }

    // ==================================
    // AFFILIATE PROGRAMS
    // ==================================

    if (path === "/api/v1/affiliate-programs/list") {
      const url = new URL(request.url);
      const partnerId = url.searchParams.get("partner_id") ? Number(url.searchParams.get("partner_id")) : null;
      const status = url.searchParams.get("status");
      const search = url.searchParams.get("search");

      const programs = await affiliatePrograms.getAllProgramsAdmin(env.DB, { partnerId, status, search });
      return json({ success: true, programs });
    }

    if (path === "/api/v1/affiliate-program/get") {
      const url = new URL(request.url);
      const id = Number(url.searchParams.get("id"));
      if (!id) return failure("id is required");

      const program = await affiliatePrograms.getProgramById(env.DB, id);
      if (!program) return failure("Program not found", 404);

      const canAccess = await itemAccess.canAccessItem(env.DB, user, 'affiliate_programs', 'read', program);
      if (!canAccess) return failure("Program not found", 404);

      program.casinos = await affiliatePrograms.getProgramCasinos(env.DB, id);
      return json({ success: true, program });
    }

    if (path === "/api/v1/affiliate-program/casinos" && request.method === "GET") {
      const url = new URL(request.url);
      const programId = Number(url.searchParams.get("program_id"));
      if (!programId) return failure("program_id is required");

      const casinoList = await affiliatePrograms.getProgramCasinos(env.DB, programId);
      return json({ success: true, casinos: casinoList });
    }

    // Reverse lookup: every program covering a given casino (used by
    // the Offer admin UI in System 2 to scope the program picker).
    if (path === "/api/v1/casino/affiliate-programs") {
      const url = new URL(request.url);
      const casinoId = Number(url.searchParams.get("casino_id"));
      if (!casinoId) return failure("casino_id is required");

      const programList = await affiliatePrograms.getCasinoPrograms(env.DB, casinoId);
      return json({ success: true, programs: programList });
    }

    if (path === "/api/v1/affiliate-program/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["partner_id", "name"]);

      const partner = await affiliatePartners.getPartnerById(env.DB, body.partner_id);
      if (!partner) return failure("Affiliate partner not found", 404);

      body.created_by = user.user_id;
      const id = await affiliatePrograms.createProgram(env.DB, body);

      if (Array.isArray(body.casino_ids)) {
        await affiliatePrograms.setProgramCasinos(env.DB, id, body.casino_ids);
      }
      await logAudit(env.DB, { userId: user.user_id, action: 'create', entityType: 'affiliate_program', entityId: id, metadata: { name: body.name, partner_id: body.partner_id, casino_ids: body.casino_ids || [] } });
      return success({ id });
    }

    if (path === "/api/v1/affiliate-program/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "name"]);

      const existing = await itemAccess.getItemById(env.DB, 'affiliate_programs', body.id);
      if (!existing) return failure("Program not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'affiliate_programs', 'update', existing);
      if (!canUpdate) return failure("Program not found", 404);

      body.updated_by = user.user_id;
      await affiliatePrograms.updateProgram(env.DB, body.id, body);
      await logAudit(env.DB, { userId: user.user_id, action: 'update', entityType: 'affiliate_program', entityId: body.id, metadata: { name: body.name, status: body.status, previous_status: existing.status } });
      return success();
    }

    if (path === "/api/v1/affiliate-program/casinos/assign" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["program_id"]);

      const existing = await itemAccess.getItemById(env.DB, 'affiliate_programs', body.program_id);
      if (!existing) return failure("Program not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'affiliate_programs', 'update', existing);
      if (!canUpdate) return failure("Program not found", 404);

      await affiliatePrograms.setProgramCasinos(env.DB, body.program_id, body.casino_ids || []);
      await logAudit(env.DB, { userId: user.user_id, action: 'update', entityType: 'affiliate_program', entityId: body.program_id, metadata: { casino_ids: body.casino_ids || [] } });
      return success();
    }

    if (path === "/api/v1/affiliate-program/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);

      const existing = await itemAccess.getItemById(env.DB, 'affiliate_programs', body.id);
      if (!existing) return failure("Program not found", 404);
      const canDelete = await itemAccess.canAccessItem(env.DB, user, 'affiliate_programs', 'delete', existing);
      if (!canDelete) return failure("Program not found", 404);

      const dependents = await affiliatePrograms.getProgramDependents(env.DB, body.id);
      if (dependents) {
        const parts = Object.entries(dependents).map(([k, v]) => `${v} ${k}`).join(", ");
        return failure(
          `Cannot delete: this program has ${parts} attached. Archive it instead, or remove the dependents first.`,
          409
        );
      }
      const offerDependents = await offersDB.getProgramOfferDependents(env.DB, body.id);
      if (offerDependents) {
        return failure(
          `Cannot delete: this program has ${offerDependents.offers} offer(s) attached. Archive it instead, or remove those offers first.`,
          409
        );
      }
      const trackingDependents = await trackingLinksDB.getProgramTrackingLinkDependents(env.DB, body.id);
      if (trackingDependents) {
        return failure(
          `Cannot delete: this program has ${trackingDependents.tracking_links} tracking link(s) attached. Archive it instead, or remove those tracking links first.`,
          409
        );
      }

      await affiliatePrograms.deleteProgram(env.DB, body.id);
      await logAudit(env.DB, { userId: user.user_id, action: 'delete', entityType: 'affiliate_program', entityId: body.id, metadata: { name: existing.name } });
      return success();
    }

    // ==================================
    // AFFILIATE ACCOUNTS
    // ==================================

    if (path === "/api/v1/affiliate-accounts/list") {
      const url = new URL(request.url);
      const programId = url.searchParams.get("program_id") ? Number(url.searchParams.get("program_id")) : null;
      const status = url.searchParams.get("status");
      const search = url.searchParams.get("search");

      const accountList = await affiliateAccounts.getAllAccountsAdmin(env.DB, { programId, status, search });
      return json({ success: true, accounts: accountList });
    }

    if (path === "/api/v1/affiliate-account/get") {
      const url = new URL(request.url);
      const id = Number(url.searchParams.get("id"));
      if (!id) return failure("id is required");

      const account = await affiliateAccounts.getAccountById(env.DB, id);
      if (!account) return failure("Account not found", 404);

      const canAccess = await itemAccess.canAccessItem(env.DB, user, 'affiliate_accounts', 'read', account);
      if (!canAccess) return failure("Account not found", 404);

      return json({ success: true, account });
    }

    if (path === "/api/v1/affiliate-account/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["program_id", "account_name"]);

      const program = await affiliatePrograms.getProgramById(env.DB, body.program_id);
      if (!program) return failure("Affiliate program not found", 404);

      body.created_by = user.user_id;
      const id = await affiliateAccounts.createAccount(env.DB, body);
      await logAudit(env.DB, { userId: user.user_id, action: 'create', entityType: 'affiliate_account', entityId: id, metadata: { account_name: body.account_name, program_id: body.program_id } });
      return success({ id });
    }

    if (path === "/api/v1/affiliate-account/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "account_name"]);

      const existing = await itemAccess.getItemById(env.DB, 'affiliate_accounts', body.id);
      if (!existing) return failure("Account not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'affiliate_accounts', 'update', existing);
      if (!canUpdate) return failure("Account not found", 404);

      body.updated_by = user.user_id;
      await affiliateAccounts.updateAccount(env.DB, body.id, body);
      await logAudit(env.DB, { userId: user.user_id, action: 'update', entityType: 'affiliate_account', entityId: body.id, metadata: { account_name: body.account_name, status: body.status, previous_status: existing.status } });
      return success();
    }

    if (path === "/api/v1/affiliate-account/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);

      const existing = await itemAccess.getItemById(env.DB, 'affiliate_accounts', body.id);
      if (!existing) return failure("Account not found", 404);
      const canDelete = await itemAccess.canAccessItem(env.DB, user, 'affiliate_accounts', 'delete', existing);
      if (!canDelete) return failure("Account not found", 404);

      const dependents = await affiliateAccounts.getAccountDependents(env.DB, body.id);
      if (dependents) {
        return failure(
          `Cannot delete: this account has ${dependents.commercial_terms} commercial term(s) attached. ` +
          `Archive it instead, or remove the terms first.`,
          409
        );
      }

      await affiliateAccounts.deleteAccount(env.DB, body.id);
      await logAudit(env.DB, { userId: user.user_id, action: 'delete', entityType: 'affiliate_account', entityId: body.id, metadata: { account_name: existing.account_name } });
      return success();
    }

    // ==================================
    // COMMERCIAL TERMS
    // ==================================

    if (path === "/api/v1/commercial-terms/list" || path === "/api/v1/commercial-terms/history") {
      const url = new URL(request.url);
      const programId = Number(url.searchParams.get("program_id"));
      if (!programId) return failure("program_id is required");

      const accountId = url.searchParams.get("account_id") ? Number(url.searchParams.get("account_id")) : null;
      const casinoId = url.searchParams.get("casino_id") ? Number(url.searchParams.get("casino_id")) : null;

      const terms = await commercialTerms.getTermHistory(env.DB, { programId, accountId, casinoId });
      return json({ success: true, terms });
    }

    if (path === "/api/v1/commercial-terms/resolve") {
      const url = new URL(request.url);
      const programId = Number(url.searchParams.get("program_id"));
      if (!programId) return failure("program_id is required");

      const accountId = url.searchParams.get("account_id") ? Number(url.searchParams.get("account_id")) : null;
      const casinoId = url.searchParams.get("casino_id") ? Number(url.searchParams.get("casino_id")) : null;
      const geoCode = url.searchParams.get("geo_code") || null;
      const onDate = url.searchParams.get("date") || null;

      const term = await commercialTerms.resolveApplicableTerm(env.DB, { programId, accountId, casinoId, geoCode, onDate });
      return json({ success: true, term });
    }

    if (path === "/api/v1/commercial-term/get") {
      const url = new URL(request.url);
      const id = Number(url.searchParams.get("id"));
      if (!id) return failure("id is required");

      const term = await commercialTerms.getTermById(env.DB, id);
      if (!term) return failure("Commercial term not found", 404);

      return json({ success: true, term });
    }

    if (path === "/api/v1/commercial-term/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["program_id", "term_type", "effective_date"]);

      const program = await affiliatePrograms.getProgramById(env.DB, body.program_id);
      if (!program) return failure("Affiliate program not found", 404);

      body.created_by = user.user_id;
      try {
        const id = await commercialTerms.createCommercialTerm(env.DB, body);
        await logAudit(env.DB, {
          userId: user.user_id,
          action: 'create',
          entityType: 'commercial_term',
          entityId: id,
          metadata: {
            program_id: body.program_id, account_id: body.account_id ?? null,
            casino_id: body.casino_id ?? null, geo_code: body.geo_code ?? null,
            term_type: body.term_type, effective_date: body.effective_date
          }
        });
        return success({ id });
      } catch (error) {
        // Overlap conflicts and field-validation errors are client
        // errors, not server errors -- surface them as 409/422 rather
        // than falling into the generic 500 catch below.
        const isOverlap = /already covers this exact scope/.test(error.message);
        return failure(error.message, isOverlap ? 409 : 422);
      }
    }

    if (path === "/api/v1/commercial-term/supersede" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);

      const existing = await commercialTerms.getTermById(env.DB, body.id);
      if (!existing) return failure("Commercial term not found", 404);

      await commercialTerms.supersedeTerm(env.DB, body.id, body.expiry_date || null);
      await logAudit(env.DB, { userId: user.user_id, action: 'supersede', entityType: 'commercial_term', entityId: body.id, metadata: { program_id: existing.program_id, term_type: existing.term_type } });
      return success();
    }


    // ==================================
    // OFFERS
    // ==================================

    if (path === "/api/v1/offers/list") {
      const url = new URL(request.url);
      const casinoId = url.searchParams.get("casino_id") ? Number(url.searchParams.get("casino_id")) : null;
      const programId = url.searchParams.get("program_id") ? Number(url.searchParams.get("program_id")) : null;
      const status = url.searchParams.get("status");
      const search = url.searchParams.get("search");

      const offerList = await offersDB.getAllOffersAdmin(env.DB, { casinoId, programId, status, search });
      return json({ success: true, offers: offerList });
    }

    if (path === "/api/v1/offer/get") {
      const url = new URL(request.url);
      const id = Number(url.searchParams.get("id"));
      if (!id) return failure("id is required");

      const offer = await offersDB.getOfferById(env.DB, id);
      if (!offer) return failure("Offer not found", 404);

      const canAccess = await itemAccess.canAccessItem(env.DB, user, 'offers', 'read', offer);
      if (!canAccess) return failure("Offer not found", 404);

      return json({ success: true, offer });
    }

    if (path === "/api/v1/offer/history") {
      const url = new URL(request.url);
      const offerId = Number(url.searchParams.get("offer_id"));
      if (!offerId) return failure("offer_id is required");

      const history = await offersDB.getOfferVersionHistory(env.DB, offerId);
      return json({ success: true, history });
    }

    if (path === "/api/v1/offer/as-of") {
      const url = new URL(request.url);
      const offerId = Number(url.searchParams.get("offer_id"));
      const date = url.searchParams.get("date");
      if (!offerId || !date) return failure("offer_id and date are required");

      const snapshot = await offersDB.getOfferAsOfDate(env.DB, offerId, date);
      return json({ success: true, offer: snapshot });
    }

    // Admin eligibility preview: every active candidate for a casino,
    // in priority order -- lets an admin see the full ranking, not
    // just the single winner resolve() would return.
    if (path === "/api/v1/offer/candidates") {
      const url = new URL(request.url);
      const casinoId = Number(url.searchParams.get("casino_id"));
      if (!casinoId) return failure("casino_id is required");

      const candidates = await getCandidateOffers(env.DB, casinoId);
      return json({ success: true, candidates });
    }

    // Admin testing tool: preview exactly what a visitor from a given
    // country would see for a casino, using the real selection service
    // (the same one the public site will use) -- not a separate mock.
    if (path === "/api/v1/offer/resolve") {
      const url = new URL(request.url);
      const casinoSlug = url.searchParams.get("casino_slug");
      const countryCode = url.searchParams.get("country_code");
      if (!casinoSlug || !countryCode) return failure("casino_slug and country_code are required");

      const result = await resolveOfferForCasino(env.DB, { casinoSlug, countryCode: countryCode.toUpperCase() });
      return json({ success: true, ...result });
    }

    if (path === "/api/v1/offer/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["casino_id", "offer_type", "internal_name"]);

      const casino = await env.DB.prepare(`SELECT id FROM casinos WHERE id = ?`).bind(body.casino_id).first();
      if (!casino) return failure("Casino not found", 404);

      body.created_by = user.user_id;
      try {
        const id = await offersDB.createOffer(env.DB, body);
        await logAudit(env.DB, {
          userId: user.user_id, action: 'create', entityType: 'offer', entityId: id,
          metadata: { casino_id: body.casino_id, offer_type: body.offer_type, internal_name: body.internal_name, status: body.status || 'draft' }
        });
        return success({ id });
      } catch (error) {
        return failure(error.message, 422);
      }
    }

    if (path === "/api/v1/offer/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);

      const existing = await itemAccess.getItemById(env.DB, 'offers', body.id);
      if (!existing) return failure("Offer not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'offers', 'update', existing);
      if (!canUpdate) return failure("Offer not found", 404);

      try {
        await offersDB.updateOffer(env.DB, body.id, body, { changedBy: user.user_id, changeReason: body.change_reason || null });
        await logAudit(env.DB, {
          userId: user.user_id, action: 'update', entityType: 'offer', entityId: body.id,
          metadata: { previous_status: existing.status, new_status: body.status || existing.status }
        });
        return success();
      } catch (error) {
        return failure(error.message, 422);
      }
    }

    if (path === "/api/v1/offer/status/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "status"]);

      const existing = await itemAccess.getItemById(env.DB, 'offers', body.id);
      if (!existing) return failure("Offer not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'offers', 'update', existing);
      if (!canUpdate) return failure("Offer not found", 404);

      try {
        await offersDB.transitionOfferStatus(env.DB, body.id, body.status, { changedBy: user.user_id, changeReason: body.change_reason || null });
        await logAudit(env.DB, {
          userId: user.user_id, action: 'status_change', entityType: 'offer', entityId: body.id,
          metadata: { from: existing.status, to: body.status, reason: body.change_reason || null }
        });
        return success();
      } catch (error) {
        return failure(error.message, 422);
      }
    }


    // ==================================
    // TRACKING LINKS
    // ==================================

    if (path === "/api/v1/tracking-links/list") {
      const url = new URL(request.url);
      const casinoId = url.searchParams.get("casino_id") ? Number(url.searchParams.get("casino_id")) : null;
      const status = url.searchParams.get("status");
      const healthStatus = url.searchParams.get("health_status");
      const search = url.searchParams.get("search");

      const links = await trackingLinksDB.getAllTrackingLinksAdmin(env.DB, { casinoId, status, healthStatus, search });
      return json({ success: true, tracking_links: links });
    }

    if (path === "/api/v1/tracking-link/get") {
      const url = new URL(request.url);
      const id = Number(url.searchParams.get("id"));
      if (!id) return failure("id is required");

      const link = await trackingLinksDB.getTrackingLinkById(env.DB, id);
      if (!link) return failure("Tracking link not found", 404);

      const canAccess = await itemAccess.canAccessItem(env.DB, user, 'tracking_links', 'read', link);
      if (!canAccess) return failure("Tracking link not found", 404);

      link.geo_destinations = await trackingLinksDB.getGeoDestinations(env.DB, id);
      return json({ success: true, tracking_link: link });
    }

    if (path === "/api/v1/tracking-link/geo-destinations" && request.method === "GET") {
      const url = new URL(request.url);
      const linkId = Number(url.searchParams.get("tracking_link_id"));
      if (!linkId) return failure("tracking_link_id is required");

      const destinations = await trackingLinksDB.getGeoDestinations(env.DB, linkId);
      return json({ success: true, geo_destinations: destinations });
    }

    if (path === "/api/v1/tracking-link/health-history") {
      const url = new URL(request.url);
      const linkId = Number(url.searchParams.get("tracking_link_id"));
      if (!linkId) return failure("tracking_link_id is required");

      const result = await env.DB.prepare(`
        SELECT * FROM tracking_link_health_checks WHERE tracking_link_id = ? ORDER BY checked_at DESC LIMIT 50
      `).bind(linkId).all();
      return json({ success: true, history: result.results || [] });
    }

    // Admin testing tool: preview exactly what /en/go/:identifier would
    // do for a given country, using the REAL resolution service --
    // not a separate mock of the redirect logic.
    if (path === "/api/v1/tracking-link/resolve-preview") {
      const url = new URL(request.url);
      const identifier = url.searchParams.get("identifier");
      const countryCode = url.searchParams.get("country_code");
      if (!identifier || !countryCode) return failure("identifier and country_code are required");

      const result = await resolveRedirectTarget(env.DB, { identifier, countryCode: countryCode.toUpperCase() });
      return json({ success: true, ...result });
    }

    if (path === "/api/v1/tracking-link/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["internal_name", "destination_url"]);

      body.created_by = user.user_id;
      const ownDomains = [new URL(request.url).hostname];
      try {
        const created = await trackingLinksDB.createTrackingLink(env.DB, body, { ownDomains });
        await logAudit(env.DB, {
          userId: user.user_id, action: 'create', entityType: 'tracking_link', entityId: created.id,
          metadata: { tracking_code: created.tracking_code, casino_id: body.casino_id ?? null, destination_url: body.destination_url }
        });
        return success(created);
      } catch (error) {
        return failure(error.message, 422);
      }
    }

    if (path === "/api/v1/tracking-link/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);

      const existing = await itemAccess.getItemById(env.DB, 'tracking_links', body.id);
      if (!existing) return failure("Tracking link not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'tracking_links', 'update', existing);
      if (!canUpdate) return failure("Tracking link not found", 404);

      body.updated_by = user.user_id;
      const ownDomains = [new URL(request.url).hostname];
      try {
        await trackingLinksDB.updateTrackingLink(env.DB, body.id, body, { ownDomains });
        await logAudit(env.DB, {
          userId: user.user_id, action: 'update', entityType: 'tracking_link', entityId: body.id,
          metadata: { internal_name: body.internal_name || existing.internal_name }
        });
        return success();
      } catch (error) {
        return failure(error.message, 422);
      }
    }

    if (path === "/api/v1/tracking-link/status/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "status"]);

      const existing = await itemAccess.getItemById(env.DB, 'tracking_links', body.id);
      if (!existing) return failure("Tracking link not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'tracking_links', 'update', existing);
      if (!canUpdate) return failure("Tracking link not found", 404);

      try {
        await trackingLinksDB.setLinkStatus(env.DB, body.id, body.status, user.user_id);
        await logAudit(env.DB, {
          userId: user.user_id, action: 'status_change', entityType: 'tracking_link', entityId: body.id,
          metadata: { from: existing.status, to: body.status }
        });
        return success();
      } catch (error) {
        return failure(error.message, 422);
      }
    }

    if (path === "/api/v1/tracking-link/geo-destinations/assign" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["tracking_link_id"]);

      const existing = await itemAccess.getItemById(env.DB, 'tracking_links', body.tracking_link_id);
      if (!existing) return failure("Tracking link not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'tracking_links', 'update', existing);
      if (!canUpdate) return failure("Tracking link not found", 404);

      const ownDomains = [new URL(request.url).hostname];
      try {
        await trackingLinksDB.setGeoDestinations(env.DB, body.tracking_link_id, body.destinations || [], { ownDomains });
        await logAudit(env.DB, {
          userId: user.user_id, action: 'update', entityType: 'tracking_link', entityId: body.tracking_link_id,
          metadata: { geo_destinations_count: (body.destinations || []).length }
        });
        return success();
      } catch (error) {
        return failure(error.message, 422);
      }
    }

    // Manual, admin-triggered health check -- the ONLY place a health
    // check is allowed to run synchronously within a request, since
    // it's an explicit one-off admin action, not a visitor redirect.
    if (path === "/api/v1/tracking-link/health-check/run" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);

      const link = await trackingLinksDB.getTrackingLinkById(env.DB, body.id);
      if (!link) return failure("Tracking link not found", 404);
      const canAccess = await itemAccess.canAccessItem(env.DB, user, 'tracking_links', 'read', link);
      if (!canAccess) return failure("Tracking link not found", 404);

      const result = await checkAndRecordLink(env.DB, link);
      await logAudit(env.DB, {
        userId: user.user_id, action: 'health_check', entityType: 'tracking_link', entityId: body.id,
        metadata: { health_status: result.healthStatus, http_status: result.httpStatus }
      });
      return json({ success: true, result });
    }

        // ==================================
    // ANALYTICS / REPORTING (Phase 5)
    // ==================================
    // Read endpoints are gated by the "analytics" / "analytics_conversions"
    // resource via readResourceMap above (role-level check, already run
    // before this point in handleAPI). Item-access scoping happens INSIDE
    // analyticsDB — every query below resolves the caller's accessible
    // dimension IDs before aggregating (see worker/database/analytics.js
    // header comment). No handler here re-derives or bypasses that.

    if (path === "/api/v1/analytics/overview") {
      const url = new URL(request.url);
      const dimensionType = url.searchParams.get("dimension_type") || "casino";
      const startDate = url.searchParams.get("start_date");
      const endDate = url.searchParams.get("end_date");
      const currency = url.searchParams.get("currency") || null;
      if (!startDate || !endDate) return failure("start_date and end_date are required");

      const rows = await analyticsDB.getDimensionPerformance(env.DB, user, {
        dimensionType, startDate, endDate, currency
      });
      return json({ success: true, dimension_type: dimensionType, rows });
    }

    if (path === "/api/v1/analytics/timeseries") {
      const url = new URL(request.url);
      const dimensionType = url.searchParams.get("dimension_type") || "casino";
      const dimensionId = url.searchParams.get("dimension_id") ? Number(url.searchParams.get("dimension_id")) : null;
      const startDate = url.searchParams.get("start_date");
      const endDate = url.searchParams.get("end_date");
      const currency = url.searchParams.get("currency") || null;
      if (!startDate || !endDate) return failure("start_date and end_date are required");

      const series = await analyticsDB.getTimeSeries(env.DB, user, {
        dimensionType, dimensionId, startDate, endDate, currency
      });
      return json({ success: true, series });
    }

    if (path === "/api/v1/analytics/geo") {
      const url = new URL(request.url);
      const startDate = url.searchParams.get("start_date");
      const endDate = url.searchParams.get("end_date");
      const currency = url.searchParams.get("currency") || null;
      if (!startDate || !endDate) return failure("start_date and end_date are required");

      const rows = await analyticsDB.getGeoPerformance(env.DB, user, { startDate, endDate, currency });
      return json({ success: true, rows });
    }

    // Records a partner-reported conversion. Never accepts a caller-
    // supplied commission figure — recordConversion() looks up the
    // applicable affiliate_commercial_terms row itself. This is an
    // internal/admin-triggered entry point (e.g. manual postback
    // reconciliation); an unauthenticated public postback endpoint is
    // a separate, not-yet-built concern (would need its own signature
    // verification, distinct from session auth) and is intentionally
    // out of scope here.
    if (path === "/api/v1/analytics/conversion/record" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["programId", "conversionType"]);

      const created = await analyticsDB.recordConversion(env.DB, {
        clickId: body.clickId ?? null,
        trackingLinkId: body.trackingLinkId ?? null,
        offerId: body.offerId ?? null,
        casinoId: body.casinoId ?? null,
        partnerId: body.partnerId ?? null,
        programId: body.programId,
        accountId: body.accountId ?? null,
        campaignId: body.campaignId ?? null,
        conversionType: body.conversionType,
        reportedValue: body.reportedValue ?? null,
        currency: body.currency || "USD",
        countryCode: body.countryCode ?? null,
        externalReference: body.externalReference ?? null,
        createdBy: user.user_id
      });
      await logAudit(env.DB, {
        userId: user.user_id, action: "create", entityType: "analytics_conversion",
        entityId: created?.meta?.last_row_id ?? null,
        metadata: { conversion_type: body.conversionType, program_id: body.programId }
      });
      return json({ success: true });
    }

    // ==================================
    // CAMPAIGNS (Phase 10)
    // ==================================

    if (path === "/api/v1/campaigns/list") {
      const url = new URL(request.url);
      const status = url.searchParams.get("status");
      const { condition, params } = await itemAccess.getAccessibleWhereClause(env.DB, user, "campaigns", "read");
      const statusClause = status ? "AND status = ?" : "";
      const result = await env.DB.prepare(`
        SELECT * FROM campaigns
        WHERE 1=1 ${condition ? "AND " + condition : ""} ${statusClause}
        ORDER BY created_at DESC
      `).bind(...params, ...(status ? [status] : [])).all();
      return json({ success: true, campaigns: result.results || [] });
    }

    if (path === "/api/v1/campaign/get") {
      const url = new URL(request.url);
      const id = Number(url.searchParams.get("id"));
      if (!id) return failure("id is required");

      const campaign = await itemAccess.getItemById(env.DB, "campaigns", id);
      if (!campaign) return failure("Campaign not found", 404);
      const canAccess = await itemAccess.canAccessItem(env.DB, user, "campaigns", "read", campaign);
      if (!canAccess) return failure("Campaign not found", 404);

      return json({ success: true, campaign });
    }

    if (path === "/api/v1/campaign/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["name"]);

      const result = await env.DB.prepare(`
        INSERT INTO campaigns (name, utm_source, utm_medium, utm_campaign, utm_term, utm_content, status, start_date, end_date, notes, created_by, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        body.name, body.utmSource ?? null, body.utmMedium ?? null, body.utmCampaign ?? null,
        body.utmTerm ?? null, body.utmContent ?? null, body.status || "active",
        body.startDate ?? null, body.endDate ?? null, body.notes ?? null,
        user.user_id, user.user_id
      ).run();

      await logAudit(env.DB, {
        userId: user.user_id, action: "create", entityType: "campaign",
        entityId: result.meta.last_row_id, metadata: { name: body.name }
      });
      return json({ success: true, id: result.meta.last_row_id });
    }

    if (path === "/api/v1/campaign/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);

      const existing = await itemAccess.getItemById(env.DB, "campaigns", body.id);
      if (!existing) return failure("Campaign not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, "campaigns", "update", existing);
      if (!canUpdate) return failure("Campaign not found", 404);

      await env.DB.prepare(`
        UPDATE campaigns SET
          name = ?, utm_source = ?, utm_medium = ?, utm_campaign = ?, utm_term = ?, utm_content = ?,
          status = ?, start_date = ?, end_date = ?, notes = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        body.name ?? existing.name, body.utmSource ?? existing.utm_source, body.utmMedium ?? existing.utm_medium,
        body.utmCampaign ?? existing.utm_campaign, body.utmTerm ?? existing.utm_term, body.utmContent ?? existing.utm_content,
        body.status ?? existing.status, body.startDate ?? existing.start_date, body.endDate ?? existing.end_date,
        body.notes ?? existing.notes, user.user_id, body.id
      ).run();

      await logAudit(env.DB, {
        userId: user.user_id, action: "update", entityType: "campaign", entityId: body.id, metadata: {}
      });
      return json({ success: true });
    }

    // ==================================
    // REPORTS (Phase 7-9)
    // ==================================
    // filters_json on a saved report_definitions row is NEVER trusted as
    // an authorization boundary -- every /report/run call below passes
    // the REQUESTING user into reportsDB.executeReportRun(), which
    // re-resolves item-access at execution time via the same helpers
    // analytics.js uses. A saved report cannot be used to read data the
    // runner no longer has access to.

    if (path === "/api/v1/reports/list") {
      const url = new URL(request.url);
      const reportType = url.searchParams.get("report_type");
      const { condition, params } = await itemAccess.getAccessibleWhereClause(env.DB, user, "report_definitions", "read");
      const typeClause = reportType ? "AND report_type = ?" : "";
      const result = await env.DB.prepare(`
        SELECT * FROM report_definitions
        WHERE status = 'active' ${condition ? "AND " + condition : ""} ${typeClause}
        ORDER BY created_at DESC
      `).bind(...params, ...(reportType ? [reportType] : [])).all();
      return json({ success: true, reports: result.results || [] });
    }

    if (path === "/api/v1/report/get") {
      const url = new URL(request.url);
      const id = Number(url.searchParams.get("id"));
      if (!id) return failure("id is required");

      const report = await itemAccess.getItemById(env.DB, "report_definitions", id);
      if (!report) return failure("Report not found", 404);
      const canAccess = await itemAccess.canAccessItem(env.DB, user, "report_definitions", "read", report);
      if (!canAccess) return failure("Report not found", 404);

      const schedules = await env.DB.prepare(`SELECT * FROM report_schedules WHERE report_id = ?`).bind(id).all();
      return json({ success: true, report, schedules: schedules.results || [] });
    }

    if (path === "/api/v1/report/runs/list") {
      const url = new URL(request.url);
      const reportId = Number(url.searchParams.get("report_id"));
      if (!reportId) return failure("report_id is required");

      const report = await itemAccess.getItemById(env.DB, "report_definitions", reportId);
      if (!report) return failure("Report not found", 404);
      const canAccess = await itemAccess.canAccessItem(env.DB, user, "report_definitions", "read", report);
      if (!canAccess) return failure("Report not found", 404);

      const runs = await env.DB.prepare(`
        SELECT * FROM report_runs WHERE report_id = ? ORDER BY started_at DESC LIMIT 50
      `).bind(reportId).all();
      return json({ success: true, runs: runs.results || [] });
    }

    if (path === "/api/v1/report/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["name", "reportType"]);
      if (!reportsDB.isValidReportType(body.reportType)) {
        return failure(`Unknown report_type: ${body.reportType}`);
      }

      const result = await env.DB.prepare(`
        INSERT INTO report_definitions (name, report_type, filters_json, columns_json, grouping_json, sort_json, owner_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        body.name, body.reportType,
        body.filters ? JSON.stringify(body.filters) : null,
        body.columns ? JSON.stringify(body.columns) : null,
        body.grouping ? JSON.stringify(body.grouping) : null,
        body.sort ? JSON.stringify(body.sort) : null,
        user.user_id
      ).run();

      await logAudit(env.DB, {
        userId: user.user_id, action: "create", entityType: "report_definition",
        entityId: result.meta.last_row_id, metadata: { report_type: body.reportType }
      });
      return json({ success: true, id: result.meta.last_row_id });
    }

    if (path === "/api/v1/report/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);

      const existing = await itemAccess.getItemById(env.DB, "report_definitions", body.id);
      if (!existing) return failure("Report not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, "report_definitions", "update", existing);
      if (!canUpdate) return failure("Report not found", 404);

      await env.DB.prepare(`
        UPDATE report_definitions SET name = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(body.name ?? existing.name, body.status ?? existing.status, body.id).run();

      await logAudit(env.DB, {
        userId: user.user_id, action: "update", entityType: "report_definition", entityId: body.id, metadata: {}
      });
      return json({ success: true });
    }

    // Ad-hoc run: executes immediately for THIS user (item-access scoped
    // to them, not the report's owner), records a report_runs row, and
    // returns either JSON rows or a downloadable CSV/HTML file depending
    // on `format`. This is the one endpoint in this section that returns
    // a non-JSON Response body when format=csv|html.
    if (path === "/api/v1/report/run" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "startDate", "endDate"]);

      const report = await itemAccess.getItemById(env.DB, "report_definitions", body.id);
      if (!report) return failure("Report not found", 404);
      const canAccess = await itemAccess.canAccessItem(env.DB, user, "report_definitions", "read", report);
      if (!canAccess) return failure("Report not found", 404);

      const format = body.format || "json";
      const filters = { startDate: body.startDate, endDate: body.endDate, currency: body.currency || null, outputFormat: format };

      const result = await reportsDB.executeReportRun(env.DB, user, report, { filters });
      await logAudit(env.DB, {
        userId: user.user_id, action: "read", entityType: "report_run",
        entityId: result.runId, metadata: { report_id: body.id, format }
      });

      if (!result.success) {
        return failure(result.error, 422);
      }

      if (format === "csv") {
        const csv = reportsDB.toCsv(result);
        return new Response(csv, {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${report.name.replace(/[^a-z0-9]+/gi, '-')}-${body.startDate}-to-${body.endDate}.csv"`
          }
        });
      }
      if (format === "html") {
        const html = reportsDB.toHtml(result, report.name);
        return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
      return json({ success: true, runId: result.runId, columns: result.columns, rows: result.rows });
    }

    if (path === "/api/v1/report/schedule/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["reportId", "frequency"]);

      const report = await itemAccess.getItemById(env.DB, "report_definitions", body.reportId);
      if (!report) return failure("Report not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, "report_definitions", "update", report);
      if (!canUpdate) return failure("Report not found", 404);

      // First run is scheduled starting now, per the requested frequency
      // (i.e. a daily schedule created today first fires tomorrow, not
      // immediately -- use "Run Now" / /report/run for an immediate result).
      const nextRunAt = new Date(
        body.frequency === "daily" ? Date.now() + 86400000 :
        body.frequency === "weekly" ? Date.now() + 7 * 86400000 :
        body.frequency === "monthly" ? new Date(new Date().setMonth(new Date().getMonth() + 1)) :
        Date.now() + 86400000
      ).toISOString();

      const scheduleResult = await env.DB.prepare(`
        INSERT INTO report_schedules (report_id, frequency, timezone, next_run_at, enabled, output_format, created_by)
        VALUES (?, ?, ?, ?, 1, ?, ?)
      `).bind(body.reportId, body.frequency, body.timezone || "UTC", nextRunAt, body.outputFormat || "csv", user.user_id).run();
      const scheduleId = scheduleResult.meta.last_row_id;

      // Default to the creating user as the sole recipient when none are
      // given explicitly -- avoids requiring the client to know/send its
      // own user_id just to schedule "deliver to me".
      const recipients = (body.recipients && body.recipients.length > 0)
        ? body.recipients
        : [{ userId: user.user_id }];
      for (const recipient of recipients) {
        await env.DB.prepare(`
          INSERT INTO report_recipients (schedule_id, user_id, email) VALUES (?, ?, ?)
        `).bind(scheduleId, recipient.userId ?? null, recipient.email ?? null).run();
      }

      await logAudit(env.DB, {
        userId: user.user_id, action: "create", entityType: "report_schedule",
        entityId: scheduleId, metadata: { report_id: body.reportId, frequency: body.frequency }
      });
      return json({ success: true, id: scheduleId });
    }

    if (path === "/api/v1/report/schedule/toggle" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "enabled"]);

      const schedule = await env.DB.prepare(`SELECT rs.*, rd.owner_id, rd.id AS report_id_check FROM report_schedules rs JOIN report_definitions rd ON rd.id = rs.report_id WHERE rs.id = ?`).bind(body.id).first();
      if (!schedule) return failure("Schedule not found", 404);
      const report = await itemAccess.getItemById(env.DB, "report_definitions", schedule.report_id);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, "report_definitions", "update", report);
      if (!canUpdate) return failure("Schedule not found", 404);

      await env.DB.prepare(`UPDATE report_schedules SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(body.enabled ? 1 : 0, body.id).run();
      await logAudit(env.DB, {
        userId: user.user_id, action: "update", entityType: "report_schedule", entityId: body.id, metadata: { enabled: body.enabled }
      });
      return json({ success: true });
    }

    // ==================================
    // ALERTS (Phase 13)
    // ==================================
    // getScopedAlerts()/acknowledgeAlert() in alertsDB do their own
    // item-access-equivalent scoping internally (alerts reference a
    // rule's scope_type/scope_id, not a directly registered item-access
    // resource) -- this section trusts that scoping rather than
    // re-deriving it, same as analyticsDB's queries are trusted above.

    if (path === "/api/v1/analytics/alerts/list") {
      const url = new URL(request.url);
      const status = url.searchParams.get("status") || "open";
      const alerts = await alertsDB.getScopedAlerts(env.DB, user, status);
      return json({ success: true, alerts });
    }

    if (path === "/api/v1/analytics/alert/acknowledge" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      const result = await alertsDB.acknowledgeAlert(env.DB, user, body.id);
      if (!result.success) return failure(result.error, 404);

      await logAudit(env.DB, {
        userId: user.user_id, action: "update", entityType: "analytics_alert", entityId: body.id, metadata: {}
      });
      return json({ success: true });
    }

    // Alert rule CRUD -- create/delete are admin-only by the permission
    // seed in 0031 (editor: create=0, delete=0); editors can read/update
    // (acknowledge) but not define new rules or remove them.
    if (path === "/api/v1/analytics/alert-rules/list") {
      const result = await env.DB.prepare(`SELECT * FROM analytics_alert_rules ORDER BY created_at DESC`).all();
      return json({ success: true, rules: result.results || [] });
    }

    if (path === "/api/v1/analytics/alert-rule/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["name", "metric", "thresholdType"]);

      const result = await env.DB.prepare(`
        INSERT INTO analytics_alert_rules (name, metric, scope_type, scope_id, threshold_type, threshold_value, comparison_window_days, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        body.name, body.metric, body.scopeType || "global", body.scopeId ?? null,
        body.thresholdType, body.thresholdValue ?? null, body.comparisonWindowDays || 7, user.user_id
      ).run();

      await logAudit(env.DB, {
        userId: user.user_id, action: "create", entityType: "analytics_alert_rule",
        entityId: result.meta.last_row_id, metadata: { metric: body.metric }
      });
      return json({ success: true, id: result.meta.last_row_id });
    }

    if (path === "/api/v1/analytics/alert-rule/toggle" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "enabled"]);
      await env.DB.prepare(`UPDATE analytics_alert_rules SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(body.enabled ? 1 : 0, body.id).run();
      await logAudit(env.DB, {
        userId: user.user_id, action: "update", entityType: "analytics_alert_rule", entityId: body.id, metadata: { enabled: body.enabled }
      });
      return json({ success: true });
    }

        // ==================================
    // BANNERS CRUD
    // ==================================

    if (path === "/api/v1/banners/list") {
      const result = await bannerDB.getAllBanners(env.DB);
      return json({ banners: result });
    }

    if (path === "/api/v1/banner/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["title"]);
      const id = await bannerDB.createBanner(env.DB, body);
      return json({ success: true, id });
    }

    if (path === "/api/v1/banner/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      await bannerDB.updateBanner(env.DB, body.id, body);
      return success();
    }

    if (path === "/api/v1/banner/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      await bannerDB.deleteBanner(env.DB, body.id);
      return success();
    }

 

    return json({
      success: false,
      error: "Endpoint not found"
    }, 404);

  } catch (error) {

    return json({
      success: false,
      error: error.message
    }, 500);

  }
}

// =====================================================
// HELPERS
// =====================================================

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}

function success(data = {}) {

    return json({
        success: true,
        ...data
    });

}

function failure(message, status = 400) {

    return json({
        success: false,
        error: message
    }, status);

}

function validate(body, required) {

    for (const field of required) {

        if (
            body[field] === undefined ||
            body[field] === null ||
            body[field] === ""
        ) {
            throw new Error(`${field} is required`);
        }

    }

}


// =====================================================
// CASINOS
// =====================================================

async function createCasino(request, env, user) {

  const body = await request.json();
  validate(body, [
    "slug",
    "name",
    "affiliate_url"
  ]);
  // SECURITY: set ownership server-side, never trust body.created_by
  body.created_by = user.user_id;
  const casinoId = await casinos.createCasino(env.DB, body);
  if (Array.isArray(body.category_ids)) {
    await casinos.setCasinoCategories(
      env.DB,
      casinoId,
      body.category_ids
    );
  }
  await invalidateCasinos(env);
  return success();
}

async function updateCasino(request, env, user) {

  const body = await request.json();

  validate(body, [
    "old_slug",
    "slug",
    "name",
    "affiliate_url"
  ]);

  // Item-level access check
  const existing = await itemAccess.getItemBySlug(env.DB, 'casinos', body.old_slug);
  if (!existing) return failure("Casino not found", 404);
  const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'casinos', 'update', existing);
  if (!canUpdate) return failure("Casino not found", 404);

  await casinos.updateCasino(
    env.DB,
    body.old_slug,
    body
  );

  const casinoId = await casinos.getCasinoIdBySlug(
    env.DB,
    body.slug
  );

  if (casinoId && Array.isArray(body.category_ids)) {
    await casinos.setCasinoCategories(
      env.DB,
      casinoId,
      body.category_ids
    );
  }
  await invalidateCasinos(env);
  return success();
}

async function deleteCasino(request, env, user) {
  const body = await request.json();
  validate(body, ["slug"]);

  // Item-level access check
  const existing = await itemAccess.getItemBySlug(env.DB, 'casinos', body.slug);
  if (!existing) return failure("Casino not found", 404);
  const canDelete = await itemAccess.canAccessItem(env.DB, user, 'casinos', 'delete', existing);
  if (!canDelete) return failure("Casino not found", 404);

  // System 2 (offers) deliberately does not cascade-delete when a
  // casino is removed, to avoid silently destroying offer history --
  // see migrations/0024_offers.sql. Surface that as a clear error
  // instead of letting it fall through to a raw FK constraint failure.
  const offerDependents = await offersDB.getCasinoOfferDependents(env.DB, existing.id);
  if (offerDependents) {
    return failure(
      `Cannot delete: this casino has ${offerDependents.offers} offer(s) (including historical/expired ones) attached. ` +
      `Unpublish the casino instead, or remove its offers first.`,
      409
    );
  }
  const trackingDependents = await trackingLinksDB.getCasinoTrackingLinkDependents(env.DB, existing.id);
  if (trackingDependents) {
    return failure(
      `Cannot delete: this casino has ${trackingDependents.tracking_links} tracking link(s) attached. ` +
      `Unpublish the casino instead, or remove its tracking links first.`,
      409
    );
  }

  await casinos.deleteCasino(
    env.DB,
    body.slug
  );

  await invalidateCasinos(env);
  return success();
}


// =====================================================
// REVIEWS
// =====================================================

async function createReview(request, env, user) {
  const body = await request.json();
  validate(body, ["slug", "title", "content", "casino_slug"]);
  body.created_by = user.user_id;
  await reviews.createReview(
    env.DB,
    body
  );

  return success();
}

async function updateReview(request, env, user) {
  const body = await request.json();
  validate(body, ["slug", "title", "content"]);

  // Item-level access check
  const existing = await itemAccess.getItemBySlug(env.DB, 'reviews', body.slug);
  if (!existing) return failure("Review not found", 404);
  const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'reviews', 'update', existing);
  if (!canUpdate) return failure("Review not found", 404);

  await reviews.updateReview(
    env.DB,
    body.slug,
    body
  );

  return success();
}



// =====================================================
// PAGES
// =====================================================

async function createPage(request, env, user) {
  const body = await request.json();
  validate(body, ["slug", "type", "template", "title"]);
  body.created_by = user.user_id;
  await pages.createPage(
    env.DB,
    body
  );

  return success();
}

async function updatePage(request, env, user) {
  const body = await request.json();
  validate(body, ["slug", "title"]);

  // Item-level access check
  const existing = await itemAccess.getItemBySlug(env.DB, 'pages', body.slug);
  if (!existing) return failure("Page not found", 404);
  const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'pages', 'update', existing);
  if (!canUpdate) return failure("Page not found", 404);

  await pages.updatePage(
    env.DB,
    body.slug,
    body
  );

  return success();
}


// =====================================================
// GEO RULES
// =====================================================

async function saveGeoRule(request, env) {
  const body = await request.json();
  validate(body, ["casino_slug", "country_code", "status"]);
  await geo.saveGeoRule(
    env.DB,
    body
  );

  return success();
}


// =====================================================
// SETTINGS
// =====================================================

async function saveSettings(request, env) {
  const body = await request.json();

  if (!body || typeof body !== "object" || Object.keys(body).length === 0) {
    return failure("Settings object cannot be empty");
  }

  await settings.saveSettings(
    env.DB,
    body
  );
  const hostname =
  new URL(request.url)
    .hostname
    .toLowerCase();

await deleteCached(
  env,
  CACHE_KEYS.SITE_SETTINGS(hostname)
);

  return success();
}


// =====================================================
// AI REVIEW GENERATION
// =====================================================

async function generateReview(request, env) {
  const body = await request.json();
  validate(body, ["casino", "country", "slug"]);

  const content = await aiEngine.generateFullReview(
    env,
    request,
    body.casino,
    body.country,
    body.slug
  );

  await ai.logAIGeneration(
    env.DB,
    "review",
    body.slug,
    `Full review generation for ${body.casino} (${body.country})`,
    "@cf/zai-org/glm-4.7-flash"
  );

  return json({
    success: true,
    content
  });
}


// ==================================
// NEWS
// ==================================

async function createNews(request, env, user) {
  const body = await request.json();

  validate(body, [
    "slug",
    "title",
    "content"
  ]);
  body.created_by = user.user_id;
  await news.createNews(env.DB, body);
  await invalidateNews(env);
  return success();
}

async function updateNews(request, env, user) {
  const body = await request.json();

  validate(body, [
    "old_slug",
    "slug",
    "title",
    "content"
  ]);

  // Item-level access check
  const existing = await itemAccess.getItemBySlug(env.DB, 'news', body.old_slug);
  if (!existing) return failure("News article not found", 404);
  const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'news', 'update', existing);
  if (!canUpdate) return failure("News article not found", 404);

  await news.updateNews(
    env.DB,
    body.old_slug,
    body
  );

  await invalidateNews(env);
  return success();
}

async function deleteNews(request, env, user) {
  const body = await request.json();

  validate(body, ["slug"]);

  // Item-level access check
  const existing = await itemAccess.getItemBySlug(env.DB, 'news', body.slug);
  if (!existing) return failure("News article not found", 404);
  const canDelete = await itemAccess.canAccessItem(env.DB, user, 'news', 'delete', existing);
  if (!canDelete) return failure("News article not found", 404);

  await news.deleteNews(
    env.DB,
    body.slug
  );

  await invalidateNews(env);
  return success();
}





/* =========================================================
PLATFORM UPDATES FUNCTIONS
========================================================= */
async function listPlatformUpdates(request, env, user) {
  const { condition, params } = await itemAccess.getAccessibleWhereClause(
    env.DB, user, 'platform-updates', 'read', 'pu'
  );
  const whereClause = condition ? `WHERE ${condition}` : '';

  const result = await env.DB.prepare(
    `SELECT pu.*, a.name AS author_name, a.slug AS author_slug,
            a.avatar_url AS author_avatar, a.role AS author_role
     FROM platform_updates pu
     LEFT JOIN authors a ON pu.author_id = a.id
     ${whereClause}
     ORDER BY COALESCE(pu.published_at, pu.created_at) DESC`
  ).bind(...params).all();

  return json({ success: true, updates: result.results || [] });
}



async function createPlatformUpdate(request, env, user) {
const body = await request.json();

validate(body, [
"slug",
"title",
"content"
]);

body.created_by = user.user_id;

const existing = await env.DB.prepare("SELECT id FROM platform_updates WHERE slug = ? LIMIT 1")
.bind(body.slug)
.first();

if (existing) {
return json(
{
success: false,
error: "A platform update with this slug already exists."
},
409
);
}

await platformUpdates.createPlatformUpdate(env.DB, {
slug: body.slug,
title: body.title,
excerpt: body.excerpt || null,
content: body.content,
featured_image: body.featured_image || null,
seo_title: body.seo_title || null,
seo_description: body.seo_description || null,
author_id: body.author_id || null,
published: body.published ?? 1,
featured: body.featured ?? 0,
published_at: body.published_at || null,
created_by: user.user_id
});

return success();
}

async function updatePlatformUpdate(request, env, user) {
const body = await request.json();

validate(body, [
"id",
"slug",
"title",
"content"
]);

const existing = await itemAccess.getItemById(env.DB, 'platform-updates', body.id);
if (!existing) {
return json(
{
success: false,
error: "Platform update not found."
},
404
);
}

// Item-level access check
const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'platform-updates', 'update', existing);
if (!canUpdate) return json({ success: false, error: "Platform update not found." }, 404);

const duplicate = await env.DB.prepare("SELECT id FROM platform_updates WHERE slug = ? AND id != ? LIMIT 1")
.bind(body.slug, body.id)
.first();

if (duplicate) {
return json(
{
success: false,
error: "Another platform update already uses this slug."
},
409
);
}

await platformUpdates.updatePlatformUpdate(
env.DB,
body.id,
{
slug: body.slug,
title: body.title,
excerpt: body.excerpt || null,
content: body.content,
featured_image: body.featured_image || null,
seo_title: body.seo_title || null,
seo_description: body.seo_description || null,
author_id: body.author_id || null,
published: body.published ?? 1,
featured: body.featured ?? 0,
published_at: body.published_at || null
}
);

return success();
}

async function deletePlatformUpdate(request, env, user) {
const body = await request.json();

validate(body, ["id"]);

const existing = await itemAccess.getItemById(env.DB, 'platform-updates', body.id);
if (!existing) {
return json(
{
success: false,
error: "Platform update not found."
},
404
);
}

// Item-level access check
const canDelete = await itemAccess.canAccessItem(env.DB, user, 'platform-updates', 'delete', existing);
if (!canDelete) return json({ success: false, error: "Platform update not found." }, 404);

await platformUpdates.deletePlatformUpdate(
env.DB,
body.id
);

return success();
}

/* =========================================================
SEO LANDING PAGES FUNCTIONS (country_custom / category_country)
========================================================= */

async function listSeoPagesEndpoint(request, env, user) {
  const urlObj = new URL(request.url);
  const pageType = urlObj.searchParams.get("page_type") || null;

  const { condition, params } = await itemAccess.getAccessibleWhereClause(
    env.DB, user, 'seo_pages', 'read', 'sp'
  );
  const whereParts = [];
  const bindParams = [];
  if (condition) { whereParts.push(condition); bindParams.push(...params); }
  if (pageType) { whereParts.push("sp.page_type = ?"); bindParams.push(pageType); }
  const whereClause = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

  const result = await env.DB.prepare(
    `SELECT sp.*, a.name AS author_name
     FROM seo_pages sp
     LEFT JOIN authors a ON sp.author_id = a.id
     ${whereClause}
     ORDER BY sp.updated_at DESC`
  ).bind(...bindParams).all();

  return json({ success: true, pages: result.results || [] });
}

async function getSeoPageEndpoint(request, env, user) {
  const urlObj = new URL(request.url);
  const id = urlObj.searchParams.get("id");
  if (!id) return failure("id is required", 422);

  const page = await itemAccess.getItemById(env.DB, 'seo_pages', id);
  if (!page) return failure("SEO page not found.", 404);

  const canRead = await itemAccess.canAccessItem(env.DB, user, 'seo_pages', 'read', page);
  if (!canRead) return failure("SEO page not found.", 404);

  page.casino_selections = await seoPages.getSeoPageCasinos(env.DB, page.id);
  return json({ success: true, page });
}

async function createSeoPageEndpoint(request, env, user) {
  const body = await request.json();
  validate(body, ["page_type", "slug", "country_code", "title"]);
  body.created_by = user.user_id;
  body.updated_by = user.user_id;

  try {
    const id = await seoPages.createSeoPage(env.DB, body);
    if (Array.isArray(body.casino_selections)) {
      await seoPages.setSeoPageCasinos(env.DB, id, body.casino_selections);
    }
    await invalidateNav(env);
    return success({ id });
  } catch (error) {
    return failure(error.message || "Could not create SEO page.", 422);
  }
}

async function updateSeoPageEndpoint(request, env, user) {
  const body = await request.json();
  validate(body, ["id", "title"]);

  const existing = await itemAccess.getItemById(env.DB, 'seo_pages', body.id);
  if (!existing) return failure("SEO page not found.", 404);

  const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'seo_pages', 'update', existing);
  if (!canUpdate) return failure("SEO page not found.", 404);

  try {
    body.updated_by = user.user_id;
    await seoPages.updateSeoPage(env.DB, body.id, body);
    if (Array.isArray(body.casino_selections)) {
      await seoPages.setSeoPageCasinos(env.DB, body.id, body.casino_selections);
    }
    await invalidateNav(env);
    return success();
  } catch (error) {
    return failure(error.message || "Could not update SEO page.", 422);
  }
}

async function deleteSeoPageEndpoint(request, env, user) {
  const body = await request.json();
  validate(body, ["id"]);

  const existing = await itemAccess.getItemById(env.DB, 'seo_pages', body.id);
  if (!existing) return failure("SEO page not found.", 404);

  const canDelete = await itemAccess.canAccessItem(env.DB, user, 'seo_pages', 'delete', existing);
  if (!canDelete) return failure("SEO page not found.", 404);

  await seoPages.deleteSeoPage(env.DB, body.id);
  await invalidateNav(env);
  return success();
}

async function searchCountriesEndpoint(request, env, user) {
  const urlObj = new URL(request.url);
  const q = urlObj.searchParams.get("q") || "";
  if (!q.trim()) return json({ success: true, countries: [] });
  const rows = await seoPages.searchCountries(env.DB, q);
  return json({ success: true, countries: rows });
}

async function eligibleCasinosEndpoint(request, env, user) {
  const urlObj = new URL(request.url);
  const countryCode = urlObj.searchParams.get("country_code");
  const categorySlug = urlObj.searchParams.get("category_slug");
  if (!countryCode) return failure("country_code is required", 422);

  const rows = categorySlug
    ? await seoPages.getEligibleCasinosForCategoryCountry(env.DB, categorySlug, countryCode)
    : await casinos.getCasinosByCountryAllowlist(env.DB, countryCode);
  return json({ success: true, casinos: rows });
}

async function discoverCategoryCountryEndpoint(request, env, user) {
  const urlObj = new URL(request.url);
  const min = Number(urlObj.searchParams.get("min")) || 1;

  const [combos, existingPages] = await Promise.all([
    seoPages.discoverEligibleCategoryCountryCombos(env.DB, min),
    seoPages.getAllSeoPages(env.DB, { pageType: "category_country" })
  ]);

  const pageByKey = {};
  for (const p of existingPages) pageByKey[`${p.category_id}::${p.country_code}`] = p;

  const combosWithStatus = combos.map((c) => {
    const existing = pageByKey[`${c.category_id}::${c.country_code}`];
    return {
      ...c,
      seo_page_id: existing?.id || null,
      status: existing ? existing.status : "eligible",
      published: existing ? !!existing.published : false
    };
  });

  return json({ success: true, combos: combosWithStatus });
}

async function generateCategoryCountryDraftEndpoint(request, env, user) {
  const body = await request.json();
  validate(body, ["category_id", "category_slug", "category_name", "country_code", "country_name"]);

  try {
    const id = await seoPages.createSeoPage(env.DB, {
      page_type: "category_country",
      slug: body.category_slug,
      country_code: body.country_code,
      category_id: Number(body.category_id),
      title: `${body.category_name} Casinos in ${body.country_name}`,
      casino_mode: "auto_priority",
      status: "draft",
      published: false,
      sitemap_enabled: true,
      auto_generated: true,
      content_json: {},
      created_by: user.user_id,
      updated_by: user.user_id
    });
    return success({ id });
  } catch (error) {
    return failure(error.message || "Could not generate draft.", 422);
  }
}


function requireAdmin(user) {
  if (!user || user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }
  return null;
}

