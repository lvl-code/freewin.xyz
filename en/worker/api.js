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
  register
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
import { getCached, setCached, CACHE_KEYS, invalidateCasinos, invalidateNews, invalidateCountries, invalidateCategories, invalidateNav } from "./cache.js";

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
      // Settings
      "/api/v1/settings/get": "settings",
      // Permissions
      "/api/v1/permissions/list": "permissions",
      // Platform Updates
      "/api/v1/platform-updates/list": "platform-updates",
      // Banners
      "/api/v1/banners/list": "banners",
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
      "/api/v1/seo": "seo",
      "/api/v1/settings": "settings",
      "/api/v1/geo": "casinos",
      "/api/v1/media": "media",
      "/api/v1/nav": "nav",
      "/api/v1/platform-updates": "platform-updates",
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
      return success();
    }

    if (path === "/api/v1/category/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["slug", "name"]);
      const { updateCategory } = await import("./database/categories.js");
      await updateCategory(env.DB, body.slug, body);
      await invalidateCategories(env);
      return success();
    }
    if (path === "/api/v1/category/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["slug"]);
      const { deleteCategory } = await import("./database/categories.js");
      await deleteCategory(env.DB, body.slug);
      await invalidateCategories(env);
      return success();
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
      return success();
    }

    if (path === "/api/v1/country/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["code", "name"]);
      const { updateCountry } = await import("./database/countries.js");
      await updateCountry(env.DB, body.code, body);
      await invalidateCountries(env);
      return success();
    }

    if (path === "/api/v1/country/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["code"]);
      const { deleteCountry } = await import("./database/countries.js");
      await deleteCountry(env.DB, body.code);
      await invalidateCountries(env);
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
      const id = await navDB.createNavItem(env.DB, body);
      await invalidateNav(env);
      return json({ success: true, id });
    }

    if (path === "/api/v1/nav/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "label", "url", "location"]);
      await navDB.updateNavItem(env.DB, body.id, body);
      await invalidateNav(env);
      return success();
    }

    if (path === "/api/v1/nav/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      await navDB.deleteNavItem(env.DB, body.id);
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


function requireAdmin(user) {
  if (!user || user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }
  return null;
}

