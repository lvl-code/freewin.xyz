import { Renderer } from "./render.js";
import { getSiteContext } from "./site-context.js";
import * as authors from "./database/authors.js";
import * as categories from "./database/categories.js";
import * as casinos from "./database/casinos.js";
import * as reviews from "./database/reviews.js";
import * as pages from "./database/pages.js";
import * as countries from "./database/countries.js";
import * as news from "./database/news.js";
import * as platformUpdates from "./database/platform-updates.js";
import * as seoPages from "./database/seo-pages.js";
import { logClick }
from "./database/clicks.js";
import { getEnabledAdRules } from "./database/ad-rules.js";

import {
  getCurrentUser
} from "./auth.js";
import { getGeoRule } from "./database/geo.js";
import { geoEngine } from "./geo.js";
import * as componentsDB from "./database/components.js";
import * as seoMetaDB from "./database/seo_meta.js";
import * as nav from "./database/nav.js";
import { getRelatedCasinos } from "./database/related-casinos.js";
import {
    buildBreadcrumbs
} from "./breadcrumbs.js";


function cacheHeaders() {
  return {
    "Content-Type": "text/html",
    "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300"
  };
}

function formatDate(date) {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}


function escapeHtml(text = "") {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function stripHtml(text = "") {
  return String(text)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(text = "", max = 160) {
  const clean = stripHtml(text);

  if (clean.length <= max) {
    return clean;
  }

  return clean.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

function toIsoDate(value) {
  if (!value) return undefined;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toISOString();
}
const COUNTRY_NAMES = {
  // — Africa —
  DZ:"Algeria", AO:"Angola", BJ:"Benin", BW:"Botswana", BF:"Burkina Faso",
  BI:"Burundi", CM:"Cameroon", CV:"Cape Verde", CF:"Central African Republic",
  TD:"Chad", KM:"Comoros", CG:"Congo", CD:"Democratic Republic of the Congo",
  CI:"Côte d'Ivoire", DJ:"Djibouti", EG:"Egypt", GQ:"Equatorial Guinea",
  ER:"Eritrea", SZ:"Eswatini", ET:"Ethiopia", GA:"Gabon", GM:"Gambia",
  GH:"Ghana", GN:"Guinea", GW:"Guinea-Bissau", KE:"Kenya", LS:"Lesotho",
  LR:"Liberia", LY:"Libya", MG:"Madagascar", MW:"Malawi", ML:"Mali",
  MR:"Mauritania", MU:"Mauritius", MA:"Morocco", MZ:"Mozambique",
  NA:"Namibia", NE:"Niger", NG:"Nigeria", RW:"Rwanda", ST:"São Tomé and Príncipe",
  SN:"Senegal", SC:"Seychelles", SL:"Sierra Leone", SO:"Somalia",
  ZA:"South Africa", SS:"South Sudan", SD:"Sudan", TZ:"Tanzania", TG:"Togo",
  TN:"Tunisia", UG:"Uganda", ZM:"Zambia", ZW:"Zimbabwe",
  EH:"Western Sahara",

  // — Asia —
  AF:"Afghanistan", AM:"Armenia", AZ:"Azerbaijan", BH:"Bahrain",
  BD:"Bangladesh", BT:"Bhutan", BN:"Brunei", KH:"Cambodia", CN:"China",
  CY:"Cyprus", GE:"Georgia", IN:"India", ID:"Indonesia", IR:"Iran",
  IQ:"Iraq", IL:"Israel", JP:"Japan", JO:"Jordan", KZ:"Kazakhstan",
  KP:"North Korea", KR:"South Korea", KW:"Kuwait", KG:"Kyrgyzstan",
  LA:"Laos", LB:"Lebanon", MY:"Malaysia", MV:"Maldives", MN:"Mongolia",
  MM:"Myanmar", NP:"Nepal", OM:"Oman", PK:"Pakistan", PS:"Palestine",
  PH:"Philippines", QA:"Qatar", SA:"Saudi Arabia", SG:"Singapore",
  LK:"Sri Lanka", SY:"Syria", TW:"Taiwan", TJ:"Tajikistan", TH:"Thailand",
  TL:"Timor-Leste", TR:"Turkey", TM:"Turkmenistan", AE:"United Arab Emirates",
  UZ:"Uzbekistan", VN:"Vietnam", YE:"Yemen",

  // — Europe —
  AL:"Albania", AD:"Andorra", AT:"Austria", BY:"Belarus", BE:"Belgium",
  BA:"Bosnia and Herzegovina", BG:"Bulgaria", HR:"Croatia", CZ:"Czech Republic",
  DK:"Denmark", EE:"Estonia", FI:"Finland", FR:"France", DE:"Germany",
  GR:"Greece", HU:"Hungary", IS:"Iceland", IE:"Ireland", IT:"Italy",
  XK:"Kosovo", LV:"Latvia", LI:"Liechtenstein", LT:"Lithuania",
  LU:"Luxembourg", MT:"Malta", MD:"Moldova", MC:"Monaco", ME:"Montenegro",
  NL:"Netherlands", MK:"North Macedonia", NO:"Norway", PL:"Poland",
  PT:"Portugal", RO:"Romania", RU:"Russia", SM:"San Marino", RS:"Serbia",
  SK:"Slovakia", SI:"Slovenia", ES:"Spain", SE:"Sweden", CH:"Switzerland",
  UA:"Ukraine", GB:"United Kingdom", VA:"Vatican City",

  // — Americas —
  AG:"Antigua and Barbuda", AR:"Argentina", BS:"Bahamas", BB:"Barbados",
  BZ:"Belize", BO:"Bolivia", BR:"Brazil", CA:"Canada", CL:"Chile",
  CO:"Colombia", CR:"Costa Rica", CU:"Cuba", DM:"Dominica",
  DO:"Dominican Republic", EC:"Ecuador", SV:"El Salvador", GD:"Grenada",
  GT:"Guatemala", GY:"Guyana", HT:"Haiti", HN:"Honduras", JM:"Jamaica",
  MX:"Mexico", NI:"Nicaragua", PA:"Panama", PY:"Paraguay", PE:"Peru",
  KN:"Saint Kitts and Nevis", LC:"Saint Lucia",
  VC:"Saint Vincent and the Grenadines", SR:"Suriname", TT:"Trinidad and Tobago",
  US:"United States", UY:"Uruguay", VE:"Venezuela",

  // — Oceania —
  AU:"Australia", FJ:"Fiji", KI:"Kiribati", MH:"Marshall Islands",
  FM:"Micronesia", NR:"Nauru", NZ:"New Zealand", PW:"Palau",
  PG:"Papua New Guinea", WS:"Samoa", SB:"Solomon Islands", TO:"Tonga",
  TV:"Tuvalu", VU:"Vanuatu",

  // — Territories / Special (optional) —
  HK:"Hong Kong", MO:"Macao",
  GL:"Greenland", PR:"Puerto Rico", KY:"Cayman Islands",
  BM:"Bermuda", FO:"Faroe Islands", GI:"Gibraltar",
  GG:"Guernsey", JE:"Jersey", IM:"Isle of Man",
  AX:"Åland Islands", SJ:"Svalbard and Jan Mayen",
};

function countryFullName(code) {
  return COUNTRY_NAMES[code] || code;
}



function buildBreadcrumbsbackup(path, data = {}) {
  const crumbs = [{ label: "Home", url: "/en" }];

  if (path === "casinoList") {
    crumbs.push({ label: "All Casinos", url: "/en/casino" });
  } else if (path === "casino" && data.name) {
    crumbs.push({ label: "All Casinos", url: "/en/casino" });
    crumbs.push({ label: data.name, url: null });
  } else if (path === "reviewList") {
    crumbs.push({ label: "All Reviews", url: "/en/review" });
  } else if (path === "review" && data.title) {
    crumbs.push({ label: "All Reviews", url: "/en/review" });
    crumbs.push({ label: data.title, url: null });
  } else if (path === "newsList") {
    crumbs.push({ label: "News", url: "/en/news" });
  } else if (path === "news" && data.title) {
    crumbs.push({ label: "News", url: "/en/news" });
    crumbs.push({ label: data.title, url: null });
  } else if (path === "categoryList") {
    crumbs.push({ label: "Categories", url: "/en/category" });
  } else if (path === "category" && data.category) {
    crumbs.push({ label: "Categories", url: "/en/category" });
    crumbs.push({ label: data.category, url: null });
  } else if (path === "countryList") {
    crumbs.push({ label: "Countries", url: "/en/country" });
  } else if (path === "country" && data.name) {
    crumbs.push({ label: "Countries", url: "/en/country" });
    crumbs.push({ label: data.name, url: null });
  } else if (path === "dashboard") {
    crumbs.push({ label: "Dashboard", url: null });
  } else if (path === "page" && data.title) {
    crumbs.push({ label: data.title, url: null });
  } else if (path === "affiliate" && data.title) {
    crumbs.push({ label: data.title, url: null });
  }

  return crumbs;
}

export async function renderHome(request, env) {
  const renderer = new Renderer(env, request);
  const site = await getSiteContext(request, env);
  const casinoList = await casinos.getAllCasinos(env.DB);
  const geoData = await prepareGeoData(env, request, casinoList);
  const sortedCasinos = sortCasinosByGeo(casinoList, geoData);

  const available = sortedCasinos.filter(c =>
    geoData.statuses[c.slug] !== "blocked" && geoData.statuses[c.slug] !== "restricted"
  );
  const others = sortedCasinos.filter(c =>
    geoData.statuses[c.slug] === "blocked" || geoData.statuses[c.slug] === "restricted"
  );

  const allComponents = await renderer.renderAllComponents("homepage", "homepage");
  const dynamicSeo = await renderer.loadDynamicSeo("homepage", "homepage");

  const latestReviews = await reviews.getLatestReviews(env.DB, 6);
  const latestNews = (await news.getAllNews(env.DB)).slice(0, 4);

  const reviewCardsHtml = latestReviews.map(r => `
    <div class="casino-card">
      <div class="casino-card__header">
        <div class="casino-card__logo-wrap">
          <img src="${r.casino_logo || '/static/images/default.png'}" alt="${r.casino_name}" class="casino-card__logo" onerror="this.src='/static/images/default.png'" loading="lazy">
        </div>
        <div class="casino-card__title-group">
          <h3 class="casino-card__name"><a href="/en/review/${r.slug}">${r.title}</a></h3>
          <div class="casino-card__rating">${'★'.repeat(Math.round(r.rating || 0))}${'☆'.repeat(5 - Math.round(r.rating || 0))}</div>
        </div>
      </div>
      <div class="casino-card__body">
        <p class="muted">${r.casino_name}</p>
      </div>
      <div class="casino-card__actions">
        <a href="/en/review/${r.slug}" class="btn btn--secondary">Read Review</a>
      </div>
    </div>`).join("");

  const newsCardsHtml = latestNews.map(n => `
    <a href="/en/news/${n.slug}" class="news-card">
      ${n.featured_image_thumbnail || n.featured_image_url ? `<img src="${n.featured_image_thumbnail || n.featured_image_url}" alt="${n.title}" loading="lazy">` : ""}
      <h3>${n.title}</h3>
      ${n.excerpt ? `<p class="muted">${n.excerpt}</p>` : ""}
      <p class="muted">${new Date(n.published_at || n.created_at).toLocaleDateString()}</p>
    </a>`).join("");

  const homeSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "url": site.origin,
    "name": site.siteName,
    "description":site.description || "Expert casino reviews, exclusive bonuses, and real player data.",
    "publisher": {
      "@type": "Organization",
      "name": site.siteName,
      "logo": {
        "@type": "ImageObject",
        "url": site.logoUrl
      }
    }
  };

      // Public pages don't need a CSRF token, but set it to empty for the meta tag
  const html = await renderer.render("home.html", {
    seo_title: dynamicSeo.seo_title || `${site.siteName} — Expert Casino Reviews & Bonuses`,
    seo_description: dynamicSeo.seo_description || "Expert casino reviews, exclusive bonuses, and real player data for casinos worldwide.",
    canonical: dynamicSeo.canonical || site.url("/en"),
    og_image: dynamicSeo.og_image || "",
    casino_cards: buildCasinoCards(available, geoData),
    casino_count: casinoList.length,
    hidden_casino_cards: buildCasinoCards(others, geoData),
    has_hidden: others.length > 0,
    hidden_count: others.length,
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    review_cards: reviewCardsHtml,
    has_reviews: latestReviews.length > 0,
    no_reviews: latestReviews.length === 0,
    news_cards: newsCardsHtml,
    has_news: latestNews.length > 0,
    no_news: latestNews.length === 0
  }, homeSchema, buildBreadcrumbs("home"));

  return new Response(html, {
    headers: cacheHeaders()
  });
}


export async function renderCasino(request, env, slug) {
  const casino = await casinos.getCasino(env.DB, slug);
  if (!casino) return render404(request, env);

  const renderer = new Renderer(env, request);
  const site = await getSiteContext(request, env);

  // Parse features from JSON string
  let features = [];
  try { features = JSON.parse(casino.features || "[]"); } catch { features = []; }

  const featuresHtml = features
    .map(f => `<span class="feature-tag">${f}</span>`)
    .join("");

  // Build star display
  const rating = casino.rating || 0;
  const fullStars = Math.floor(rating);
  const hasHalf = rating % 1 >= 0.5;
  const ratingDisplay =
    "★".repeat(fullStars) +
    (hasHalf ? "½" : "") +
    "☆".repeat(5 - fullStars - (hasHalf ? 1 : 0));

  const edgeGeo = {
    country: request.cf?.country || null,
    city: request.cf?.city || "Unknown"
  };
  const geoInfo = geoEngine.process(request, edgeGeo);
  const geoRule = await getGeoRule(env.DB, slug, geoInfo.country);

  const casinoSchema = {
    "@context": "https://schema.org",
    "@type": "Review",
    "itemReviewed": {
      "@type": "Casino",
      "name": casino.name,
      "image": casino.logo || site.logoUrl,
      "url": site.url(`/en/casino/${slug}`)
    },
    "reviewRating": {
      "@type": "Rating",
      "ratingValue": rating,
      "bestRating": 5,
      "worstRating": 1
    },
    "author": {
      "@type": "Organization",
      "name": `${site.siteName} Expert Team`

    },
    "publisher": {
    "@type": "Organization",
    "name": site.siteName,
    "url": site.origin,
    "logo": {
      "@type": "ImageObject",
      "url": site.logoUrl
     }
    },
    "mainEntityOfPage": {
  "@type": "WebPage",
  "@id": site.url(`/en/casino/${slug}`)
},
  "datePublished": casino.created_at
  ? new Date(casino.created_at).toISOString()
  : undefined,

"dateModified": (casino.updated_at || casino.created_at)
  ? new Date(casino.updated_at || casino.created_at).toISOString()
  : undefined,
};

  const allComponents = await renderer.renderAllComponents("casino", slug);
  const dynamicSeo = await renderer.loadDynamicSeo("casino", slug);

  // ── Related Casinos ({{{related_casinos_html}}}) ──────────
  // Same pattern as related_news_html in renderNews(): compute
  // the HTML in the controller, pass it as a data key, template
  // guards on it being non-empty. Reuses the existing
  // buildCasinoCards() card renderer — no second card design.
  let relatedCasinosHtml = "";
  try {
    const relatedCasinos = await getRelatedCasinos(env.DB, casino, geoInfo.country, 6);
    if (relatedCasinos.length > 0) {
      const relatedGeoData = {
        country: geoInfo.country,
        statuses: Object.fromEntries(relatedCasinos.map(c => [c.slug, "allowed"]))
      };
      relatedCasinosHtml = buildCasinoCards(relatedCasinos, relatedGeoData);
    }
  } catch (e) {
    console.error("Related casinos failed to load:", e.message);
    relatedCasinosHtml = "";
  }

  const html = await renderer.render("casino.html", {
    ...casino,
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || casino.seo_title || casino.name,
    seo_description: dynamicSeo.seo_description || casino.seo_description || "",
    canonical: dynamicSeo.canonical || site.url(`/en/casino/${slug}`),
    rating_display: ratingDisplay,
    features_html: featuresHtml,
    bonus_title: casino.bonus_title || "Welcome Bonus",
    bonus_value: casino.bonus_value || "",
    website_url: casino.website_url || "",
    status: casino.status || "published",
    geo: geoInfo,
    geoRule: geoRule || { status: "allowed", bonus_override: null },
    related_casinos_html: relatedCasinosHtml
  }, casinoSchema, buildBreadcrumbs("casino", { name: casino.name }));

  return new Response(html, {
    headers: cacheHeaders()
  });
}

function countryToFlag(code) {
  if (!code || code.length !== 2) return "🏳";
  return code.toUpperCase().replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt()));
}

async function prepareGeoData(env, request, casinoList) {
  const edgeGeo = {
    country: request.cf?.country || null,
    city: request.cf?.city || "Unknown"
  };
  const geoInfo = geoEngine.process(request, edgeGeo);
  const slugs = casinoList.map(c => c.slug);
  if (slugs.length === 0) return { country: geoInfo.country, statuses: {} };

  // Batch query: get ALL geo rules for ALL these casinos (any country)
  const placeholders = slugs.map(() => '?').join(',');
  const result = await env.DB.prepare(`
    SELECT casino_slug, country_code, status FROM geo_rules
    WHERE casino_slug IN (${placeholders})
  `).bind(...slugs).all();

  // Group rules by casino slug
  const rulesByCasino = {};
  for (const row of (result.results || [])) {
    if (!rulesByCasino[row.casino_slug]) rulesByCasino[row.casino_slug] = [];
    rulesByCasino[row.casino_slug].push(row);
  }

  const statuses = {};
  for (const slug of slugs) {
    const rules = rulesByCasino[slug] || [];
    
    if (rules.length === 0) {
      // No rules at all → blocked everywhere
      statuses[slug] = "blocked";
    } else {
      // Check if this specific country has a rule
      const countryRule = rules.find(r => r.country_code === geoInfo.country);
      if (countryRule) {
        statuses[slug] = countryRule.status;
      } else {
        // No rule for this country — infer from other rules
        const hasAllowed = rules.some(r => r.status === "allowed");
        const hasBlocked = rules.some(r => r.status === "blocked");
        
        if (hasAllowed && !hasBlocked) {
          // Only 'allowed' rules exist → this country is blocked (allowlist mode)
          statuses[slug] = "blocked";
        } else if (hasBlocked && !hasAllowed) {
          // Only 'blocked' rules exist → this country is allowed (blocklist mode)
          statuses[slug] = "allowed";
        } else {
          // Mixed or unclear → blocked by default
          statuses[slug] = "blocked";
        }
      }
    }
  }
  
  return { country: geoInfo.country, statuses };
}

async function evaluateCasinoGeo(env, casinoSlug, countryCode) {
  const result = await env.DB.prepare(`
    SELECT country_code, status FROM geo_rules
    WHERE casino_slug = ?
  `).bind(casinoSlug).all();

  const rules = result.results || [];

  if (rules.length === 0) return "blocked";

  const countryRule = rules.find(r => r.country_code === countryCode);
  if (countryRule) return countryRule.status;

  const hasAllowed = rules.some(r => r.status === "allowed");
  const hasBlocked = rules.some(r => r.status === "blocked");

  if (hasAllowed && !hasBlocked) return "not allowed";   // allowlist mode
  if (hasBlocked && !hasAllowed) return "allowed";    // blocklist mode
  return "blocked";                                    // mixed → safe default
}


function sortCasinosByGeo(casinoList, geoData) {
  if (!geoData) return casinoList;
  const allowed = casinoList.filter(c => geoData.statuses[c.slug] !== "blocked" && geoData.statuses[c.slug] !== "restricted");
  const blocked = casinoList.filter(c => geoData.statuses[c.slug] === "blocked" || geoData.statuses[c.slug] === "restricted");
  allowed.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  blocked.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  return [...allowed, ...blocked];
}

function buildCasinoCards(casinoList, geoData = null) {
  return casinoList.map(casino => {
    const flag = geoData ? countryToFlag(geoData.country) : "";
    const geoStatus = geoData ? (geoData.statuses[casino.slug] || "unknown") : "unknown";
 //   const geoIcon = geoStatus === "allowed" ? "✓" : "✕";
 //   const geoClass = geoStatus === "allowed" ? "geo-badge--allowed" : "geo-badge--blocked";

    // Different icons and colors for each status
    let geoIcon, geoClass, geoLabel;
    if (geoStatus === "allowed") {
      geoIcon = "✓";
      geoClass = "geo-badge--allowed";
      geoLabel = "Available";
    } else if (geoStatus === "blocked") {
      geoIcon = "✕";
      geoClass = "geo-badge--blocked";
      geoLabel = "Not Available";
    } else {
      geoIcon = "?";     // ← question mark for unknown
      geoClass = "geo-badge--unknown";
      geoLabel = "Unknown";
    }
    const geoBadge = geoData ? `
      <div class="geo-badge ${geoClass}" title="${geoLabel} in ${countryFullName(geoData.country)}">
        <span class="geo-badge__flag">${flag}</span>
        <span class="geo-badge__icon">${geoIcon}</span>
      </div>` : "";
    const geoStatusText = geoData ? `
  <div class="casino-card__geo-status geo-${geoStatus}">
    ${flag} ${geoLabel} for players from ${countryFullName(geoData.country)}
  </div>` : "";


    const complianceHtml = `
      <div class="casino-card__compliance">
        ${casino.license ? `<div class="compliance-row"><span class="compliance-label">License:</span> <span class="compliance-value">${casino.license}</span></div>` : ""}
        ${casino.owner ? `<div class="compliance-row"><span class="compliance-label">Operator:</span> <span class="compliance-value">${casino.owner}</span></div>` : ""}
        <div class="compliance-row">
      <span class="compliance-label"></span>
      <span>18+ Play responsibly, T&Cs apply</span>
    </div>
      </div>`;

    return `
    <div class="casino-card" data-casino-slug="${casino.slug}">
      ${geoBadge}
      <button
          type="button"
          class="casino-card__bookmark"
          data-bookmark-slug="${casino.slug}"
          aria-label="Save ${casino.name} to bookmarks"
          aria-pressed="false"
          title="Save ${casino.name}"
       >
          <span class="bookmark-icon" aria-hidden="true">♡</span>
       </button>
<div class="casino-card__header">
  <div class="casino-card__logo-wrap">
    <img src="${casino.logo || '/static/images/default.png'}" alt="${casino.name}" class="casino-card__logo" onerror="this.src='/static/images/default.png'" loading="lazy">
  </div>
  <div class="casino-card__title-group">
    <h3 class="casino-card__name">${casino.name}</h3>
    <div class="casino-card__rating">${'★'.repeat(Math.round(casino.rating))}${'☆'.repeat(5 - Math.round(casino.rating))}</div>
  </div>
</div>
<div class="casino-card__body">
  <div class="casino-card__bonus">
    <span class="bonus-title">${casino.bonus_title || 'Welcome Bonus'}</span>
    <span class="bonus-value">${casino.bonus_value || ''}</span>
  </div>
  ${geoStatusText}
  ${complianceHtml}
</div>

      <div class="casino-card__actions">
        <a href="/en/casino/${casino.slug}" class="btn btn--secondary">Review</a>
        <a href="/en/go/${casino.slug}" class="btn btn--primary" rel="nofollow sponsored">Visit</a>
      </div>
    </div>`;
  }).join('');
}

function buildReviewCasinoCards(casinoList, geoData = null) {
  return casinoList.map(casino => {
    const flag = geoData ? countryToFlag(geoData.country) : "";
    const geoStatus = geoData ? (geoData.statuses[casino.slug] || "unknown") : "unknown";
 //   const geoIcon = geoStatus === "allowed" ? "✓" : "✕";
 //   const geoClass = geoStatus === "allowed" ? "geo-badge--allowed" : "geo-badge--blocked";

    // Different icons and colors for each status
    let geoIcon, geoClass, geoLabel;
    if (geoStatus === "allowed") {
      geoIcon = "✓";
      geoClass = "geo-badge--allowed";
      geoLabel = "Available";
    } else if (geoStatus === "blocked") {
      geoIcon = "✕";
      geoClass = "geo-badge--blocked";
      geoLabel = "Not Available";
    } else {
      geoIcon = "✕";     // ← question mark for unknown
      geoClass = "geo-badge--unknown";
      geoLabel = "not Available";
    }
    const geoBadge = geoData ? `
      <div class="geo-badge ${geoClass}" title="${geoLabel} in ${countryFullName(geoData.country)}">
        <span class="geo-badge__flag">${flag}</span>
        <span class="geo-badge__icon">${geoIcon}</span>
      </div>` : "";
   // const geoBadge = geoData ? `
     // <div class="geo-badge ${geoClass}">
       // <span class="geo-badge__flag">${flag}</span>
       // <span class="geo-badge__icon">${geoIcon}</span>
     // </div>` : "";
    const geoStatusText = geoData ? `
  <div class="casino-card__geo-status geo-${geoStatus}">
    ${flag} ${geoLabel} for players from ${countryFullName(geoData.country)}
  </div>` : "";

// Then add ${geoStatusText} inside the card body, after the bonus div


    const complianceHtml = `
      <div class="casino-card__compliance">
        ${casino.license ? `<div class="compliance-row"><span class="compliance-label">License:</span> <span class="compliance-value">${casino.license}</span></div>` : ""}
        ${casino.owner ? `<div class="compliance-row"><span class="compliance-label">Operator:</span> <span class="compliance-value">${casino.owner}</span></div>` : ""}
        ${casino.website_url ? `<div class="compliance-row"><span class="compliance-label">18+ | PLAY RESPONSIBLY |</span> T&CS APPLY</div>` : ""}
      </div>`;

    return `
    <div class="casino-card" data-casino-slug="${casino.slug}">
      ${geoBadge}
      <button
        type="button"
        class="casino-card__bookmark"
        data-bookmark-slug="${casino.slug}"
        aria-label="Save ${casino.name} to bookmarks"
        aria-pressed="false"
        title="Save ${casino.name}"
      >
        <span class="bookmark-icon" aria-hidden="true">♡</span>
      </button>
<div class="casino-card__header">
  <div class="casino-card__logo-wrap">
    <img src="${casino.logo || '/static/images/default.png'}" alt="${casino.name}" class="casino-card__logo" onerror="this.src='/static/images/default.png'" loading="lazy">
  </div>
  <div class="casino-card__title-group">
    <h3 class="casino-card__name">${casino.name} Review</h3>
    <div class="casino-card__rating">${'★'.repeat(Math.round(casino.rating))}${'☆'.repeat(5 - Math.round(casino.rating))}</div>
  </div>
</div>
<div class="casino-card__body">
  <div class="casino-card__bonus">
    <span class="bonus-title">${casino.bonus_title || 'Welcome Bonus'}</span>
    <span class="bonus-value">${casino.bonus_value || ''}</span>
  </div>
  ${geoStatusText}
  ${complianceHtml}
</div>
      <div class="casino-card__actions">
        <a href="/en/go/${casino.slug}" class="btn btn--primary" rel="nofollow sponsored">Visit</a>
      </div>
    </div>`;
  }).join('');
}

export async function renderReview(request, env, slug) {
  const review = await reviews.getReview(env.DB, slug);
  if (!review) return render404(request, env);

  const renderer = new Renderer(env, request);
  const site = await getSiteContext(request, env);
  let author = null;
  if (review.author_id) {
    author = await authors.getAuthorById(env.DB, review.author_id);
  }

  let pros = [], cons = [];

  try {
    const parsedPros = JSON.parse(review.pros || "[]");
    pros = Array.isArray(parsedPros) ? parsedPros : [];
  } catch {}

  try {
    const parsedCons = JSON.parse(review.cons || "[]");
    cons = Array.isArray(parsedCons) ? parsedCons : [];
  } catch {}

  let faqHtml = "";

  try {
    const parsedFaqs = JSON.parse(review.faq_json || "[]");
    const faqs = Array.isArray(parsedFaqs) ? parsedFaqs : [];

    faqHtml = faqs.map(faq => `
    <div class="faq-item">
      <button class="faq-question">
        ${faq.q}
      </button>

      <div class="faq-answer">
        <p>${faq.a}</p>
      </div>
    </div>
  `).join("");

} catch {
  faqHtml = "";
}
  const prosHtml = pros.length
    ? `<ul>${pros.map(p => `<li>${p}</li>`).join("")}</ul>`
    : "<p class='muted'>No pros listed.</p>";

  const consHtml = cons.length
    ? `<ul>${cons.map(c => `<li>${c}</li>`).join("")}</ul>`
    : "<p class='muted'>No cons listed.</p>";

  // Geo evaluation for the casino connected to this review
  let geoCountry = "";
  let geoStatus = "allowed";
  let geoFlag = "";
  if (review.casino_slug) {
    const edgeGeo = {
      country: request.cf?.country || null,
      city: request.cf?.city || "Unknown"
    };
    const geoInfo = geoEngine.process(request, edgeGeo);
    geoCountry = geoInfo.country;
    geoFlag = countryToFlag(geoCountry);
    //const geoRule = await getGeoRule(env.DB, review.casino_slug, geoInfo.country);
    //geoStatus = geoRule ? geoRule.status : "allowed";
    // With:
    geoStatus = await evaluateCasinoGeo(env, review.casino_slug, geoInfo.country);

  }

  let casinoCardHtml = "";

if (review.casino_slug) {
  const casino = await casinos.getCasino(env.DB, review.casino_slug);

  if (casino) {
    casinoCardHtml = buildReviewCasinoCards(
      [casino],
      {
        country: geoCountry,
        statuses: {
          [casino.slug]: geoStatus
        }
      }
    );
  }
}

  const allComponents = await renderer.renderAllComponents("review", slug);
  const reviewBlocksHtml = await renderer.renderReviewBlocks(slug);
  const dynamicSeo = await renderer.loadDynamicSeo("review", slug);

  // ── Inline advertisement injection (was missing for reviews) ──
  let reviewDisplayContent = review.content || "";
  try {
    reviewDisplayContent = await injectInlineAds(reviewDisplayContent, env, request, "review");
  } catch (e) {
    console.error("Inline ad injection error (review):", e.message);
  }

  let casino = null;
  let casinoName = "";

  if (review.casino_slug) {
    casino = await casinos.getCasino(env.DB, review.casino_slug);

    if (casino) {
      casinoName = casino.name;
    }
  }
  const reviewSchema = {
    "@context": "https://schema.org",
    "@type": "Review",
    "headline": review.title,
    "reviewBody": (review.content || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim(),
   // "reviewBody": review.content || "",
    "reviewRating": {
      "@type": "Rating",
      "ratingValue": review.rating || "5",
      "bestRating": 5
    },
    "itemReviewed": {
      "@type": "Casino",
      "name": casino?.name || casinoName || review.title,
     // "name": review.title.replace("Review", "").trim(),
      "url": site.url(`/en/review/${slug}`)
    },
    "author": {
      "@type": "Person",
      "name": author?.name || site.siteName
    },
  "publisher": {
  "@type": "Organization",
  "name": site.siteName,
  "url": site.origin,
  "logo": {
    "@type": "ImageObject",
    "url": site.logoUrl
  }
},
"datePublished": review.created_at
  ? new Date(review.created_at).toISOString()
  : undefined,

"dateModified": (review.updated_at || review.created_at)
  ? new Date(review.updated_at || review.created_at).toISOString()
  : undefined,
};

  const formatDate = (date) => {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
};

  // ── Related Casinos ({{{related_casinos_html}}}) ──────────
  // Same reuse of buildCasinoCards()/getRelatedCasinos() as
  // renderCasino() above. Only computed when this review is
  // actually attached to a casino (review.casino_slug).
  let relatedCasinosHtml = "";
  if (casino) {
    try {
      const relatedCasinos = await getRelatedCasinos(env.DB, casino, geoCountry, 6);
      if (relatedCasinos.length > 0) {
        const relatedGeoData = {
          country: geoCountry,
          statuses: Object.fromEntries(relatedCasinos.map(c => [c.slug, "allowed"]))
        };
        relatedCasinosHtml = buildCasinoCards(relatedCasinos, relatedGeoData);
      }
    } catch (e) {
      console.error("Related casinos failed to load:", e.message);
      relatedCasinosHtml = "";
    }
  }

  const html = await renderer.render("review.html", {
    ...review,
    content: reviewDisplayContent,
    casino_name: casinoName,
    author_name: author?.name || "",
    author_bio: author?.bio || "",
    author_avatar: author?.avatar_url || "",
    author_role: author?.role || "",
    author_slug: author?.slug || "",
    author_social: author?.social_links || "",
    reviewed_at: formatDate(review.created_at),
    updated_at: formatDate(review.updated_at || review.created_at),
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    review_blocks_html: reviewBlocksHtml,
    seo_title: dynamicSeo.seo_title || review.seo_title || review.title,
    seo_description: dynamicSeo.seo_description || review.seo_description || "",
    canonical: dynamicSeo.canonical || site.url(`/en/review/${slug}`),
    faq_html: faqHtml,
    pros_html: prosHtml,
    cons_html: consHtml,
    casino_card_html: casinoCardHtml,
    casino_slug: review.casino_slug || "",
    geo_country: countryFullName(geoCountry),
    geo_status: geoStatus,
    geo_flag: geoFlag,
    related_casinos_html: relatedCasinosHtml
  }, reviewSchema, buildBreadcrumbs("review", { title: review.title }));

  return new Response(html, {
    headers: cacheHeaders()
  });
}

export async function renderNews(request, env, slug) {
  const article = await news.getNews(env.DB, slug);
  if (!article) return render404(request, env);

  // Security: only render published, currently-live articles publicly
  if (!article.published || Number(article.published) !== 1) {
    return render404(request, env);
  }

  // Security: respect scheduled publishing — hide articles whose published_at is in the future
  if (article.published_at) {
    const pubDate = new Date(article.published_at);
    if (!Number.isNaN(pubDate.getTime()) && pubDate > new Date()) {
      return render404(request, env);
    }
  }

  const renderer = new Renderer(env, request);

  const site = await getSiteContext(request, env);

  let author = null;
  if (article.author_id) {
    author = await authors.getAuthorById(env.DB, article.author_id);
  }

  const allComponents = await renderer.renderAllComponents("news", slug);
  const dynamicSeo = await renderer.loadDynamicSeo("news", slug);

  const canonical = dynamicSeo.canonical || site.url(`/en/news/${article.slug}`);

  const publishedDate = article.published_at || article.created_at;
  const modifiedDate = article.updated_at || publishedDate;
  const publishedIso = toIsoDate(publishedDate);
  const modifiedIso = toIsoDate(modifiedDate);
  const publishedDisplay = formatDate(publishedDate);
  const modifiedDisplay = formatDate(modifiedDate);

  const cleanContent = stripHtml(article.content || "");
  const description = dynamicSeo.seo_description || article.seo_description || article.excerpt || truncateText(article.content, 160);

  const articleAuthorName = author?.name || article.author || site.siteName;
  const featuredImage = article.featured_image_url || article.featured_image_thumbnail || "";
  const featuredImageAlt = article.featured_image_alt || article.title;

  // Build author HTML in the controller — avoids template {{else}} issues
  let authorHtml = "";
  if (articleAuthorName) {
    const avatarHtml = (author?.avatar_url || article.author_avatar)
      ? `<img src="${escapeHtml(author?.avatar_url || article.author_avatar)}" alt="${escapeHtml(articleAuthorName)}" style="width:44px;height:44px;border-radius:50%;object-fit:cover" onerror="this.style.display='none'">`
      : "";
    const nameHtml = (author?.slug || article.author_slug)
      ? `<a href="/en/author/${escapeHtml(author?.slug || article.author_slug)}" style="font-weight:700;text-decoration:none">${escapeHtml(articleAuthorName)}</a>`
      : `<strong>${escapeHtml(articleAuthorName)}</strong>`;
    const roleHtml = (author?.role || article.author_role)
      ? `<span style="color:var(--gray);font-size:12px;display:block">${escapeHtml(author?.role || article.author_role)}</span>`
      : "";
    authorHtml = `
      <div style="display:flex;align-items:center;gap:10px">
        ${avatarHtml}
        <div>
          <span style="color:var(--gray);font-size:12px">By</span><br>
          ${nameHtml}
          ${roleHtml}
        </div>
      </div>
    `;
  }


  // ── Tags as clickable links ──────────────────────────
  let tagsHtml = "";
  if (article.tags) {
    tagsHtml = String(article.tags)
      .split(",")
      .map(t => t.trim())
      .filter(Boolean)
      .map(tag => {
        const escaped = escapeHtml(tag);
        return `<a href="/en/news?tag=${encodeURIComponent(tag)}" class="news-tag" rel="tag" style="display:inline-block;padding:7px 14px;border-radius:999px;background:var(--bg);border:1px solid var(--light-gray);color:var(--dark);font-size:13px;font-weight:500;text-decoration:none;transition:all 0.2s">${escaped}</a>`;
      })
      .join("");
  }

  // ── Related news by shared tags ──────────────────────
  let relatedNewsHtml = "";
  if (article.tags) {
    try {
      const related = await news.getRelatedNews(env.DB, article.slug, article.tags, 3);
      if (related.length > 0) {
        relatedNewsHtml = related.map(item => {
          const img = item.featured_image_url || item.featured_image_thumbnail || "";
          const imgHtml = img
            ? `<div style="aspect-ratio:16/9;overflow:hidden;border-radius:8px"><img src="${escapeHtml(img)}" alt="${escapeHtml(item.featured_image_alt || item.title)}" style="width:100%;height:100%;object-fit:cover" loading="lazy" decoding="async"></div>`
            : "";
          const date = item.published_at || item.created_at;
          return `
            <article style="overflow:hidden;border:1px solid var(--light-gray);border-radius:10px;background:var(--white);transition:transform 0.2s,box-shadow 0.2s">
              <a href="/en/news/${encodeURIComponent(item.slug)}" style="display:block;color:inherit;text-decoration:none">
                ${imgHtml}
                <div style="padding:14px">
                  ${date ? `<time style="display:block;margin-bottom:6px;color:var(--gray);font-size:12px">${escapeHtml(formatDate(date))}</time>` : ""}
                  <h3 style="margin:0 0 6px;font-size:16px;line-height:1.3;color:var(--dark)">${escapeHtml(item.title)}</h3>
                  ${item.excerpt ? `<p style="margin:0;color:var(--gray);font-size:13px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escapeHtml(item.excerpt)}</p>` : ""}
                </div>
              </a>
            </article>
          `;
        }).join("");
      }
    } catch (e) {
      console.error("Related news error:", e.message);
    }
  }

    // ── Inline advertisement injection ────────────────────
  let displayContent = article.content || "";
  try {
    displayContent = await injectInlineAds(displayContent, env, request, "news");
  } catch (e) {
    console.error("Inline ad injection error:", e.message);
  }



  const wordCount = cleanContent ? cleanContent.split(/\s+/).filter(Boolean).length : 0;

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "@id": `${canonical}#newsarticle`,
    "url": canonical,
    "mainEntityOfPage": { "@type": "WebPage", "@id": canonical },
    "headline": article.title,
    "description": description,
    ...(featuredImage ? { "image": [featuredImage] } : {}),
    "datePublished": publishedIso,
    "dateModified": modifiedIso,
    "author": {
      "@type": "Person",
      "name": articleAuthorName,
      ...(author?.slug ? { "url": site.url(`/en/author/${author.slug}`) } : {}),
      ...(author?.avatar_url ? { "image": author.avatar_url } : {})
    },
    "publisher": {
      "@type": "Organization",
      "name": site.siteName,
      "url": site.origin,
      ...(site.logoUrl ? { "logo": { "@type": "ImageObject", "url": site.logoUrl } } : {})
    },
    "articleBody": cleanContent,
    "wordCount": wordCount,
    "articleSection": "News",
    "inLanguage": "en",
    ...(article.tags ? { "keywords": article.tags } : {})
  };

  const html = await renderer.render("news.html", {
    ...article,
    canonical,
    seo_title: dynamicSeo.seo_title || article.seo_title || article.title,
    seo_description: description,
    author_name: author?.name || article.author || "",
    author_avatar: author?.avatar_url || "",
    author_role: author?.role || "",
    author_slug: author?.slug || "",
    author_html: authorHtml,
    featured_image_url: featuredImage,
    featured_image_alt: featuredImageAlt,
    featured_image_caption: article.featured_image_caption || "",
    published_at: publishedDisplay,
    updated_at: modifiedDisplay,
    tags_html: tagsHtml,
    related_news_html: relatedNewsHtml,
    content: displayContent,
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar
  }, articleSchema, buildBreadcrumbs("news", { title: article.title }));

  return new Response(html, { headers: cacheHeaders() });
}


export async function renderNewsbackup(request, env, slug) {
  const article = await news.getNews(env.DB, slug);
  if (!article) return render404(request, env);

  const renderer = new Renderer(env, request);
  const site = await getSiteContext(request, env);

  let author = null;

  if (article.author_id) {
    author = await authors.getAuthorById(
      env.DB,
      article.author_id
    );
  }

  const allComponents =
    await renderer.renderAllComponents("news", slug);

  const reviewBlocksHtml =
    await renderer.renderReviewBlocks(slug);

  const dynamicSeo =
    await renderer.loadDynamicSeo("news", slug);

  const canonical =
    dynamicSeo.canonical ||
    site.url(`/en/news/${article.slug}`);

  const description =
    dynamicSeo.seo_description ||
    article.seo_description ||
    truncateText(article.content, 160);

  const published =
    toIsoDate(article.created_at);

  const modified =
    toIsoDate(
      article.updated_at ||
      article.created_at
    );

  const cleanArticleBody =
    stripHtml(article.content || "");

  const articleAuthorName =
    author?.name ||
    article.author ||
    site.siteName;

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",

    "@id": `${canonical}#newsarticle`,

    "url": canonical,

    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": canonical
    },

    "headline": article.title,

    "description": description,

    "datePublished": published,

    "dateModified": modified,

    "author": {
      "@type": "Person",
      "name": articleAuthorName,
      ...(author?.slug
        ? {
            "url": site.url(
              `/en/author/${author.slug}`
            )
          }
        : {})
    },

    "publisher": {
      "@type": "Organization",
      "name": site.siteName,
      "url": site.origin,

      ...(site.logoUrl
        ? {
            "logo": {
              "@type": "ImageObject",
              "url": site.logoUrl
            }
          }
        : {})
    },

    "articleBody": cleanArticleBody,

    "inLanguage": "en",

    "isPartOf": {
      "@type": "WebSite",
      "name": site.siteName,
      "url": site.origin
    },

    "articleSection": "News",

    "wordCount": cleanArticleBody
      ? cleanArticleBody.split(/\s+/).length
      : 0
  };

  const html = await renderer.render(
    "news.html",
    {
      ...article,

      canonical,

      author_name:
        author?.name ||
        article.author ||
        "",

      author_avatar:
        author?.avatar_url ||
        "",

      author_role:
        author?.role ||
        "",

      author_slug:
        author?.slug ||
        "",

      components_top:
        allComponents.top,

      components_content_top:
        allComponents.content_top,

      components_content_bottom:
        allComponents.content_bottom,

      components_bottom:
        allComponents.bottom,

      components_sidebar:
        allComponents.sidebar,

      seo_title:
        dynamicSeo.seo_title ||
        article.seo_title ||
        article.title,

      seo_description:
        description

    },
    articleSchema,
    buildBreadcrumbs(
      "news",
      {
        title: article.title
      }
    )
  );

  return new Response(
    html,
    {
      headers: cacheHeaders()
    }
  );
}


// ============================================================
// AD INJECTION ENGINE — Hybrid Mode
// Pipeline: 1. Disable check → 2. Resolve manual markers
//           → 3. Apply automatic rules (respecting manual placements)
//           → 4. Device/GEO/schedule filtering
// ============================================================

async function injectInlineAds(content, env, request, pageType = 'news') {
  if (!content) return content;

  // 1. Check if ads are disabled for this article
  if (/<!--\s*ADS:DISABLE\s*-->/i.test(content)) {
    return content.replace(/<!--\s*ADS:DISABLE\s*-->/gi, "");
  }

  // 2. Load Ad Library
  const adComponents = await loadAdComponents(env);
  const adById = new Map();
  const adBySlug = new Map();

  for (const ad of adComponents) {
    adById.set(ad.id, ad);
    adBySlug.set(ad.slug, ad);
  }

  // 3. Load settings fallback ad
  let settingsAd = null;
  try {
    const adSetting = await env.DB.prepare(
      "SELECT value FROM settings WHERE key = 'news_inline_ad'"
    ).first();
    const rawValue = adSetting?.value || "";
    if (rawValue) {
      if (rawValue.startsWith("component:")) {
        const slug = rawValue.slice("component:".length).trim();
        settingsAd = adBySlug.get(slug) || null;
      } else {
        settingsAd = {
          id: 0,
          slug: "settings-fallback",
          html: rawValue,
          status: "active"
        };
      }
    }
  } catch (_) {}

  // 4. Resolve explicit manual markers
  const markerRegex = /<!--\s*AD:([^>]+?)\s*-->/gi;
  const manuallyUsedComponentIds = new Set();
  let hasManualMarkers = false;

  let result = content.replace(markerRegex, (match, identifier) => {
    const id = identifier.trim();
    hasManualMarkers = true;

    // AUTO markers — resolve later
    if (id.toUpperCase() === "AUTO") return match;

    // Resolve by component:ID
    if (id.startsWith("component:")) {
      const compId = parseInt(id.slice("component:".length), 10);
      const ad = adById.get(compId);
      if (ad && ad.html) {
        manuallyUsedComponentIds.add(compId);
        return `\n${ad.html}\n`;
      }
      return `\n<!-- AD NOT FOUND: ${id} -->\n`;
    }

    // Resolve by slug
    const ad = adBySlug.get(id);
    if (ad && ad.html) {
      manuallyUsedComponentIds.add(ad.id);
      return `\n${ad.html}\n`;
    }

    // Resolve settings fallback
    if (settingsAd && settingsAd.slug === id && settingsAd.html) {
      return `\n${settingsAd.html}\n`;
    }

    return `\n<!-- AD NOT FOUND: ${id} -->\n`;
  });

  // 5. Handle AUTO markers
  let autoIndex = 0;
  const autoAds = adComponents.filter(a => !manuallyUsedComponentIds.has(a.id));
  if (settingsAd && settingsAd.html && !manuallyUsedComponentIds.has(0)) {
    autoAds.unshift(settingsAd);
  }

  result = result.replace(/<!--\s*AD:AUTO\s*-->/gi, () => {
    if (autoIndex < autoAds.length) {
      const ad = autoAds[autoIndex++];
      manuallyUsedComponentIds.add(ad.id);
      return `\n${ad.html}\n`;
    }
    return "";
  });

  // 6. Apply automatic rules (HYBRID MODE — does NOT disable when manual ads exist)
  try {
    const rules = await getEnabledAdRules(env.DB, pageType);
    const requestInfo = extractRequestInfo(request);

    result = applyAutoRules(
      result,
      rules,
      manuallyUsedComponentIds,
      requestInfo,
      pageType
    );
  } catch (e) {
    console.error("Auto ad rules error:", e.message);
  }

  return result;
}

// ── Extract device + GEO info from request ──────────────

function extractRequestInfo(request) {
  const cf = request.cf || {};
  const ua = request.headers.get("user-agent") || "";

  let device = "desktop";
  if (/mobile|android|iphone|ipad|ipod/i.test(ua)) {
    device = /ipad|tablet/i.test(ua) ? "tablet" : "mobile";
  }

  return {
    device,
    country: cf.country || null,
    hostname: new URL(request.url).hostname
  };
}

// ── Apply automatic rules with all targeting ────────────

function applyAutoRules(content, rules, usedComponentIds, requestInfo, pageType) {
  if (!rules || rules.length === 0) return content;

  const insertionCount = new Map();
  const allInsertions = []; // { index, html, order } — computed against the ORIGINAL content

  for (const rule of rules) {
    // Skip if component already used manually and max_appearances is 1
    if (usedComponentIds.has(rule.component_id) && rule.max_appearances <= 1) {
      continue;
    }

    // Check scheduling
    if (!isRuleActiveNow(rule)) continue;

    // Check device targeting
    if (!ruleMatchesDevice(rule, requestInfo.device)) continue;

    // Check GEO targeting
    if (!ruleMatchesCountry(rule, requestInfo.country)) continue;

    // Check page type targeting
    if (!ruleMatchesPageType(rule, pageType)) continue;

    // Get ad HTML
    let htmlToInject = rule.component_html || "";
    if (!htmlToInject) continue;

    // Track appearances
    const currentCount = insertionCount.get(rule.id) || 0;
    const remainingSlots = rule.max_appearances - currentCount;
    if (remainingSlots <= 0) continue;

    // Compute insertion points against the ORIGINAL, untouched content.
    // This is the key fix: every rule's paragraph/heading/image positions
    // are located against the same fixed baseline, so an earlier rule's
    // injected ad HTML (which may itself contain <p> tags) can never shift
    // where a later rule lands.
    let points = findInsertionPoints(content, rule);
    if (points.length > remainingSlots) points = points.slice(0, remainingSlots);
    if (points.length === 0) continue;

    for (const idx of points) {
      allInsertions.push({ index: idx, html: `\n${htmlToInject}\n`, order: allInsertions.length });
    }

    insertionCount.set(rule.id, currentCount + points.length);
    usedComponentIds.add(rule.component_id);
  }

  if (allInsertions.length === 0) return content;

  // Apply from the last position to the first so earlier indices stay valid.
  // For insertions that land at the exact same index, process the
  // higher-`order` (later-added) one first so the original rule/priority
  // order is preserved in the final reading order.
  allInsertions.sort((a, b) => (b.index - a.index) || (b.order - a.order));

  let modified = content;
  for (const ins of allInsertions) {
    modified = modified.slice(0, ins.index) + ins.html + modified.slice(ins.index);
  }
  return modified;
}

// ── Compute insertion points for a rule against a fixed baseline ────────

function getParagraphEndPositions(content) {
  const regex = /<\/p>/gi;
  const positions = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    positions.push(match.index + match[0].length);
  }
  return positions;
}

function getParagraphStartPositions(content) {
  const regex = /<p[^>]*>/gi;
  const positions = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    positions.push(match.index);
  }
  return positions;
}

function getHeadingEndPositions(content) {
  const regex = /<\/h[1-6]>/gi;
  const positions = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    positions.push(match.index + match[0].length);
  }
  return positions;
}

function getHeadingStartPositions(content) {
  const regex = /<h[1-6][^>]*>/gi;
  const positions = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    positions.push(match.index);
  }
  return positions;
}

function getImageEndPositions(content) {
  const regex = /<img\b[^>]*>/gi;
  const positions = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    positions.push(match.index + match[0].length);
  }
  return positions;
}

function pickPosition(positions, positionValue) {
  if (positions.length === 0) return undefined;

  const wanted = Number(positionValue) || 1;
  const clamped = Math.min(
    Math.max(wanted, 1),
    positions.length
  );

  return positions[clamped - 1];
}

function findInsertionPoints(content, rule) {
  // Repeat mode: insert after every Nth paragraph, starting at position_value
  if (rule.repeat_interval > 0 && rule.placement === 'after_paragraph') {
    const positions = getParagraphEndPositions(content);
    const points = [];
    const start = rule.position_value || 1;
    const interval = rule.repeat_interval;
    for (let p = start; p <= positions.length && points.length < rule.max_appearances; p += interval) {
      points.push(positions[p - 1]);
    }
    return points;
  }

  switch (rule.placement) {
    case 'after_paragraph': {
      const positions = getParagraphEndPositions(content);
      const idx = positions[(rule.position_value || 3) - 1];
      return idx !== undefined ? [idx] : [];
    }
    case 'before_paragraph': {
      const positions = getParagraphStartPositions(content);
      const idx = positions[(rule.position_value || 1) - 1];
      return idx !== undefined ? [idx] : [];
    }
    case 'end_of_article':
      return [content.length];
    case 'before_article':
      return [0];
    case 'after_heading': {
      const idx = pickPosition(
        getHeadingEndPositions(content),
        rule.position_value
      );
      return idx !== undefined ? [idx] : [];
    }

    case 'before_heading': {
      const idx = pickPosition(
        getHeadingStartPositions(content),
        rule.position_value
      );
      return idx !== undefined ? [idx] : [];
    }

    case 'after_first_image': {
      const idx = pickPosition(
        getImageEndPositions(content),
        rule.position_value
      );
      return idx !== undefined ? [idx] : [];
    }
    case 'middle_of_article': {
      const positions = getParagraphEndPositions(content);
      if (positions.length === 0) return [content.length];
      return [positions[Math.floor(positions.length / 2)]];
    }
    default:
      return [];
  }
}

// ── Scheduling check ────────────────────────────────────

function isRuleActiveNow(rule) {
  const now = new Date();

  if (rule.start_date) {
    const start = new Date(rule.start_date);
    if (now < start) return false;
  }

  if (rule.end_date) {
    const end = new Date(rule.end_date);
    if (now > end) return false;
  }

  return true;
}

// ── Device targeting ─────────────────────────────────────

function ruleMatchesDevice(rule, requestDevice) {
  if (!rule.devices || rule.devices === 'all') return true;
  if (rule.devices === requestDevice) return true;
  // Allow comma-separated device lists
  const devices = rule.devices.split(',').map(d => d.trim().toLowerCase());
  return devices.includes(requestDevice) || devices.includes('all');
}

// ── GEO targeting ───────────────────────────────────────

function ruleMatchesCountry(rule, requestCountry) {
  if (!rule.countries || rule.countries === 'all') return true;
  if (!requestCountry) return true; // Can't determine country — allow

  const countries = rule.countries
    .split(',')
    .map(c => c.trim().toUpperCase())
    .filter(Boolean);

  return countries.includes(requestCountry) || countries.includes('ALL');
}

// ── Page type targeting ─────────────────────────────────

function ruleMatchesPageType(rule, pageType) {
  if (!rule.page_type || rule.page_type === 'all') return true;
  return rule.page_type === pageType;
}

// ── Load ad components ───────────────────────────────────

async function loadAdComponents(env) {
  try {
    const components = await componentsDB.getAllComponents(env.DB, "ad");
    const ads = [];

    for (const comp of components) {
      if (comp.status !== "active") continue;

      let html = "";

      if (typeof comp.content === "string" && comp.content.trim()) {
        html = comp.content;
      }

      if (!html && comp.settings_json) {
        try {
          const settings = JSON.parse(comp.settings_json);
          if (settings.ad_html) html = settings.ad_html;
        } catch (_) {}
      }

      if (html) {
        ads.push({
          id: comp.id,
          slug: comp.slug,
          name: comp.name,
          html: html.trim(),
          status: comp.status
        });
      }
    }

    return ads;
  } catch (e) {
    console.error("loadAdComponents error:", e.message);
    return [];
  }
}




async function hashIP(ip){

  if(!ip){
    return "";
  }

  const data =
    new TextEncoder()
      .encode(ip);

  const hash =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  return Array
    .from(
      new Uint8Array(hash)
    )
    .map(b =>
      b.toString(16)
       .padStart(2,"0")
    )
    .join("");
}

export async function
handleAffiliateRedirect(
  request,
  env,
  slug
){

  const casino =
    await casinos.getCasino(
      env.DB,
      slug
    );

  if (!casino) {
    return render404(request, env);
  }

  const ipHash =
  await hashIP(
    request.headers.get(
      "CF-Connecting-IP"
    )
  );

await logClick(
  env.DB,
  slug,
  request.cf?.country || null,
  request.cf?.city || "",
  ipHash,
  request.headers.get(
    "user-agent"
  )
);
  return Response.redirect(
    casino.affiliate_url,
    302
  );
}

export async function renderDashboardPage(request, env) {
    const user = await getCurrentUser(request, env);
    if (!user) {
        return new Response(null, {
            status: 302,
            headers: { Location: "/en/login" }
        });
    }

    // Admins and editors get the shared admin nav via renderAdminPage
    if (user.role === "admin" || user.role === "editor") {
        return renderAdminPage(request, env, "admin/dashboard.html");
    }

    // Viewers get the user dashboard (no admin nav)
    const renderer = new Renderer(env, request);
    const site = await getSiteContext(request, env);
        // Add CSRF token for admin pages — used by rich-editor.js and media-library.js

    const html = await renderer.render("users/dashboard.html", {
        seo_title: "Dashboard",
        seo_description: `${site.siteName} Dashboard`,
        email: user.email,
        role: user.role
    });

    return new Response(html, {
        headers: { "Content-Type": "text/html" }
    });
}


export async function dashboardStatsAPI(request, env) {

    const user = await getCurrentUser(request, env);

    if (!user || user.role !== "admin") {
        return new Response("Forbidden", {
            status: 403
        });
    }

    const casinos = await env.DB.prepare(
        "SELECT COUNT(*) c FROM casinos"
    ).first();

    const reviews = await env.DB.prepare(
        "SELECT COUNT(*) c FROM reviews"
    ).first();

    const clicks = await env.DB.prepare(
        "SELECT COUNT(*) c FROM clicks"
    ).first();

    const pages = await env.DB.prepare(
        "SELECT COUNT(*) c FROM pages"
    ).first();

    return Response.json({
        casinos: casinos.c,
        reviews: reviews.c,
        clicks: clicks.c,
        pages: pages.c
    });
}

export async function robots(request, env) {
  const site = await getSiteContext(request, env);

  return new Response(
    `User-agent: *
Allow: /

Sitemap: ${site.url("/en/sitemap-index.xml")}
Sitemap: ${site.url("/en/sitemap.xml")}
Sitemap: ${site.url("/en/sitemap-casinos.xml")}
Sitemap: ${site.url("/en/sitemap-reviews.xml")}
Sitemap: ${site.url("/en/sitemap-news.xml")}
Sitemap: ${site.url("/en/sitemap-categories.xml")}
Sitemap: ${site.url("/en/sitemap-countries.xml")}
Sitemap: ${site.url("/en/sitemap-pages.xml")}`,
    {
      headers: {
        "Content-Type": "text/plain"
      }
    }
  );
}


export async function renderCountry(request, env, slug) {
  const code = slug.toUpperCase();
  const country = await countries.getCountry(env.DB, code);
  const countryData = country || {
    code, name: code, seo_title: null, seo_description: null
  };
  const casinoList = await casinos.getCasinosByCountryAllowlist(env.DB, code);

  // Sort by rating descending (highest first)
  casinoList.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  
  const geoData = await prepareGeoData(env, request, casinoList);
  const renderer = new Renderer(env, request);
  const site = await getSiteContext(request, env);
  const countrySchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": `Best Online Casinos in ${countryData.name}`,
    "itemListElement": casinoList.map((c, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "url": site.url(`/en/casino/${c.slug}`)
    }))
  };

  const allComponents = await renderer.renderAllComponents("country", code);
  const dynamicSeo = await renderer.loadDynamicSeo("country", code);
  const html = await renderer.render("country.html", {
    ...countryData,
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || countryData.seo_title || countryData.name + " Online Casinos",
    seo_description: dynamicSeo.seo_description || countryData.seo_description || "",
    canonical: dynamicSeo.canonical || site.url(`/en/country/${code}`),
    casino_cards: buildCasinoCards(casinoList, geoData),
  }, countrySchema, buildBreadcrumbs("country", { name: countryData.name }));
  return new Response(html, {
    headers: cacheHeaders()
  });
}


export async function renderCategory(request, env, slug) {
  const category = await categories.getCategory(env.DB, slug);
  if (!category) return render404(request, env);

  const casinoList = await categories.getCategoryCasinos(env.DB, slug);
  const geoData = await prepareGeoData(env, request, casinoList);
  const sortedCasinos = sortCasinosByGeo(casinoList, geoData);

  const renderer = new Renderer(env, request);
  const site = await getSiteContext(request, env);
  const categorySchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": `${category.name} Type Online Casinos`,
    "itemListElement": sortedCasinos.map((c, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "url": site.url(`/en/casino/${c.slug}`)
    }))
  };

  const allComponents = await renderer.renderAllComponents("category", slug);
  const dynamicSeo = await renderer.loadDynamicSeo("category", slug);
  const html = await renderer.render("category.html", {
    slug,
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || category.seo_title || category.name + " Casinos",
    seo_description: dynamicSeo.seo_description || category.seo_description || "",
    canonical: dynamicSeo.canonical || site.url(`/en/category/${slug}`),
    category: category.name,
    description: category.description,
    casino_cards: buildCasinoCards(sortedCasinos, geoData),
  }, categorySchema, buildBreadcrumbs("category", { category: category.name }));

  return new Response(html, {
    headers: cacheHeaders()
  });
}



// =====================================================
// SEO LANDING PAGES (country_custom / category_country)
// See migrations/0019_seo_landing_pages.sql and
// worker/database/seo-pages.js.
// =====================================================

// Resolves the final, live casino list for a landing page according
// to its casino_mode. Always re-joins to the current `casinos` table
// (via seoPages.getSeoPageCasinos / the eligibility queries) — never
// reads cached/duplicated casino facts, per spec section 5.
async function resolveSeoPageCasinos(env, page, eligibleCasinos) {
  const manualRows = await seoPages.getSeoPageCasinos(env.DB, page.id);
  const mainSelections = manualRows.filter((r) => !r.section_key && r.display_mode !== "editorial");
  const editorialByKey = {};
  for (const row of manualRows) {
    if (row.section_key) {
      editorialByKey[row.section_key] = row;
    }
  }

  if (page.casino_mode === "manual") {
    return { mainList: mainSelections, editorialByKey };
  }

  if (page.casino_mode === "auto") {
    return { mainList: eligibleCasinos, editorialByKey };
  }

  // auto_priority (default): eligible casinos define the pool, but
  // manually-selected ones are pulled to the front in their chosen
  // order; everything else follows in the default eligibility order.
  const manualIds = new Set(mainSelections.map((r) => r.id));
  const rest = eligibleCasinos.filter((c) => !manualIds.has(c.id));
  return { mainList: [...mainSelections, ...rest], editorialByKey };
}

// Renders content_json.sections into HTML. Supports the section
// types actually built out this pass: rich_text, casino_grid,
// casino_editorial, faq, cta. Unknown types are skipped rather than
// erroring, so older/partial content never breaks a page.
function renderSeoPageSections(content, casinoLookupById, editorialByKey, geoData) {
  const sections = Array.isArray(content?.sections) ? content.sections : [];

  return sections
    .map((section) => {
      const heading = section.title
        ? `<h2 class="seo-section__title">${section.title}</h2>${section.subtitle ? `<p class="seo-section__subtitle muted">${section.subtitle}</p>` : ""}`
        : "";

      switch (section.type) {
        case "rich_text":
        case "text":
          return `<section class="seo-section seo-section--text">${heading}<div class="seo-section__body">${section.body || ""}</div></section>`;

        case "heading":
          return `<h2 class="seo-section__title">${section.title || ""}</h2>`;

        case "image":
          return section.image
            ? `<section class="seo-section seo-section--image">${heading}<img src="${section.image}" alt="${section.title || ""}" loading="lazy" /></section>`
            : "";

        case "casino_grid":
        case "casino_comparison": {
          const ids = Array.isArray(section.casino_ids) ? section.casino_ids : null;
          const list = ids
            ? ids.map((id) => casinoLookupById[id]).filter(Boolean)
            : Object.values(casinoLookupById);
          if (list.length === 0) return "";
          return `<section class="seo-section seo-section--casinos">${heading}<div class="casino-grid">${buildCasinoCards(list, geoData)}</div></section>`;
        }

        case "casino_editorial": {
          const casino = casinoLookupById[section.casino_id];
          if (!casino) return "";
          const editorial = editorialByKey[section.id];
          const body = editorial?.editorial_content || section.body || "";
          return `
            <section class="seo-section seo-section--casino-editorial">
              ${heading}
              <div class="casino-grid">${buildCasinoCards([casino], geoData)}</div>
              ${body ? `<div class="seo-section__body">${body}</div>` : ""}
            </section>`;
        }

        case "faq": {
          const items = Array.isArray(section.items) ? section.items : [];
          if (items.length === 0) return "";
          return `
            <section class="seo-section seo-section--faq">
              ${heading}
              <div class="faq-list">
                ${items.map((item) => `
                  <div class="faq-item">
                    <h3 class="faq-item__question">${item.q || ""}</h3>
                    <div class="faq-item__answer">${item.a || ""}</div>
                  </div>`).join("")}
              </div>
            </section>`;
        }

        case "cta":
          return `
            <section class="seo-section seo-section--cta" ${section.background ? `style="background:${section.background};"` : ""}>
              ${heading}
              ${section.body ? `<p>${section.body}</p>` : ""}
              ${section.url ? `<a class="btn btn--primary" href="${section.url}">${section.label || "Learn more"}</a>` : ""}
            </section>`;

        case "internal_links":
        case "custom_links": {
          const links = Array.isArray(section.links) ? section.links : [];
          if (links.length === 0) return "";
          return `
            <section class="seo-section seo-section--links">
              ${heading}
              <ul class="seo-section__links">
                ${links.map((l) => `<li><a href="${l.url}">${l.label}</a></li>`).join("")}
              </ul>
            </section>`;
        }

        default:
          return "";
      }
    })
    .join("\n");
}

function seoPageFaqSchema(content) {
  const sections = Array.isArray(content?.sections) ? content.sections : [];
  const faqSection = sections.find((s) => s.type === "faq" && Array.isArray(s.items) && s.items.length > 0);
  if (!faqSection) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqSection.items
      .filter((i) => i.q && i.a)
      .map((i) => ({
        "@type": "Question",
        "name": i.q,
        "acceptedAnswer": { "@type": "Answer", "text": i.a }
      }))
  };
}

export async function renderCountryCustomPage(request, env, countryCode, slug) {
  const code = countryCode.toUpperCase();
  const page = await seoPages.getSeoPageByUrl(env.DB, "country_custom", code, slug);
  if (!page || !page.published) return render404(request, env);

  const country = await countries.getCountry(env.DB, code);
  if (!country) return render404(request, env);

  const eligibleCasinos = await casinos.getCasinosByCountryAllowlist(env.DB, code);
  const { mainList, editorialByKey } = await resolveSeoPageCasinos(env, page, eligibleCasinos);
  const geoData = await prepareGeoData(env, request, mainList);

  const casinoLookupById = {};
  for (const c of mainList) casinoLookupById[c.id] = c;
  // Editorial sections can reference any eligible casino, even one
  // not in the main grid — make sure those resolve too.
  for (const c of eligibleCasinos) if (!casinoLookupById[c.id]) casinoLookupById[c.id] = c;

  let content = {};
  try {
    content = typeof page.content_json === "string" ? JSON.parse(page.content_json) : page.content_json || {};
  } catch {
    content = {};
  }

  const renderer = new Renderer(env, request);
  const site = await getSiteContext(request, env);
  const author = page.author_id ? await authors.getAuthorById(env.DB, page.author_id).catch(() => null) : null;

  const pageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": page.title,
    "url": page.canonical_url || site.url(`/en/country/${code}/${slug}`)
  };
  const itemListSchema = mainList.length
    ? {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": page.title,
        "itemListElement": mainList.map((c, i) => ({
          "@type": "ListItem",
          "position": i + 1,
          "url": site.url(`/en/casino/${c.slug}`)
        }))
      }
    : pageSchema;
  const faqSchema = seoPageFaqSchema(content);

  const allComponents = await renderer.renderAllComponents("country_custom_page", `${code}/${slug}`);
  const html = await renderer.render("seo-landing.html", {
    title: page.title,
    intro: content.intro || "",
    sections_html: renderSeoPageSections(content, casinoLookupById, editorialByKey, geoData),
    casino_cards: buildCasinoCards(mainList, geoData),
    has_casinos: mainList.length > 0,
    country_name: country.name,
    country_code: code,
    parent_label: country.name,
    parent_url: site.url(`/en/country/${code}`),
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: page.seo_title || page.title,
    seo_description: page.seo_description || "",
    canonical: page.canonical_url || site.url(`/en/country/${code}/${slug}`),
    og_image: page.og_image || page.featured_image || "",
    robots: page.robots || "index,follow",
    author_name: author?.name || "",
    author_id: page.author_id || null
  }, [itemListSchema, faqSchema].filter(Boolean),
    buildBreadcrumbs("countryCustomPage", { title: page.title, countryName: country.name, countryCode: code }));

  return new Response(html, { headers: cacheHeaders() });
}

export async function renderCategoryCountryPage(request, env, categorySlug, countryCode) {
  const code = countryCode.toUpperCase();
  const category = await categories.getCategory(env.DB, categorySlug);
  if (!category) return render404(request, env);
  const country = await countries.getCountry(env.DB, code);
  if (!country) return render404(request, env);

  const page = await seoPages.getSeoPageByUrl(env.DB, "category_country", code, categorySlug);

  // No editorial page yet, or it's unpublished: fall back to a pure
  // auto-generated render IF the combination is genuinely eligible
  // (real casinos exist for it), so a legitimate category x country
  // intent still resolves even before an editor has reviewed it.
  // This never creates a DB row — it's render-only.
  const eligibleCasinos = await seoPages.getEligibleCasinosForCategoryCountry(env.DB, categorySlug, code);

  if ((!page || !page.published) && eligibleCasinos.length === 0) {
    return render404(request, env);
  }

  const effectivePage = page || {
    id: null,
    title: `${category.name} Casinos in ${country.name}`,
    seo_title: null,
    seo_description: null,
    canonical_url: null,
    og_image: null,
    featured_image: null,
    robots: "index,follow",
    author_id: null,
    content_json: "{}",
    casino_mode: "auto"
  };

  const { mainList, editorialByKey } = page
    ? await resolveSeoPageCasinos(env, page, eligibleCasinos)
    : { mainList: eligibleCasinos, editorialByKey: {} };

  const geoData = await prepareGeoData(env, request, mainList);
  const casinoLookupById = {};
  for (const c of mainList) casinoLookupById[c.id] = c;
  for (const c of eligibleCasinos) if (!casinoLookupById[c.id]) casinoLookupById[c.id] = c;

  let content = {};
  try {
    content = typeof effectivePage.content_json === "string" ? JSON.parse(effectivePage.content_json) : effectivePage.content_json || {};
  } catch {
    content = {};
  }

  const renderer = new Renderer(env, request);
  const site = await getSiteContext(request, env);
  const author = effectivePage.author_id ? await authors.getAuthorById(env.DB, effectivePage.author_id).catch(() => null) : null;

  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": effectivePage.title,
    "itemListElement": mainList.map((c, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "url": site.url(`/en/casino/${c.slug}`)
    }))
  };
  const faqSchema = seoPageFaqSchema(content);

  const allComponents = await renderer.renderAllComponents("category_country_page", `${categorySlug}/${code}`);
  const html = await renderer.render("seo-landing.html", {
    title: effectivePage.title,
    intro: content.intro || category.description || "",
    sections_html: renderSeoPageSections(content, casinoLookupById, editorialByKey, geoData),
    casino_cards: buildCasinoCards(mainList, geoData),
    has_casinos: mainList.length > 0,
    country_name: country.name,
    country_code: code,
    parent_label: category.name,
    parent_url: site.url(`/en/category/${categorySlug}`),
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: effectivePage.seo_title || effectivePage.title,
    seo_description: effectivePage.seo_description || "",
    canonical: effectivePage.canonical_url || site.url(`/en/category/${categorySlug}/${code}`),
    og_image: effectivePage.og_image || effectivePage.featured_image || "",
    robots: effectivePage.robots || "index,follow",
    author_name: author?.name || "",
    author_id: effectivePage.author_id || null
  }, [itemListSchema, faqSchema].filter(Boolean),
    buildBreadcrumbs("categoryCountryPage", { categorySlug, categoryName: category.name, countryName: country.name }));

  return new Response(html, { headers: cacheHeaders() });
}

function parseContentJson(contentJson) {
  if (!contentJson) return "";
  try {
    const parsed = JSON.parse(contentJson);
    if (typeof parsed === "string") return parsed;
    if (parsed.text) return parsed.text;
    if (parsed.html) return parsed.html;
    return Object.values(parsed).join("<br><br>");
  } catch {
    return contentJson;
  }
}

export async function renderDynamicPage(request, env, slug) {
  const page = await pages.getPage(env.DB, slug);
  if (!page) return render404(request, env);

  const renderer = new Renderer(env, request);
  const site = await getSiteContext(request, env);
  let author = null;
  if (page.author_id) {
    author = await authors.getAuthorById(env.DB, page.author_id);
  }
  const allComponents = await renderer.renderAllComponents("page", slug);
  const dynamicSeo = await renderer.loadDynamicSeo("page", slug);

  const pageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": page.title,
    "description": page.seo_description || "",
    "datePublished": page.created_at,
    "dateModified": page.updated_at || page.created_at
  };
  // ── Inline advertisement injection (was missing for pages) ──
  let pageDisplayContent = parseContentJson(page.content_json);
  try {
    pageDisplayContent = await injectInlineAds(pageDisplayContent, env, request, "page");
  } catch (e) {
    console.error("Inline ad injection error (page):", e.message);
  }

  const html = await renderer.render("page.html", {
    ...page,
    canonical: dynamicSeo.canonical || site.url(`/en/${slug}`),
    author_name: author?.name || "",
    author_avatar: author?.avatar_url || "",
    author_role: author?.role || "",
    author_slug: author?.slug || "",
    datePublished: formatDate(page.created_at),
    dateModified: formatDate(page.updated_at || page.created_at),
    content_json: pageDisplayContent,
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || page.title,
    seo_description: dynamicSeo.seo_description || page.seo_description || "",
  }, pageSchema, buildBreadcrumbs("page", { title: page.title }));

  return new Response(html, { headers: cacheHeaders() });
}

export async function renderAffiliate(request, env, slug) {
  const page = await pages.getPage(env.DB, slug);
  if (!page) return render404(request, env);

  const renderer = new Renderer(env, request);
  const pageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": page.title
  };
  const html = await renderer.render("affiliate.html", {
    ...page,
    content_json: parseContentJson(page.content_json)
  }, pageSchema, buildBreadcrumbs("affiliate", { title: page.title }));

  return new Response(html, {
    headers: cacheHeaders()
  });
}

export async function renderLogin(
  request,
  env
){

  const renderer =
    new Renderer(env, request);
  const site = await getSiteContext(request, env);

  const html =
    await renderer.render(
      "login.html",
      {
        seo_title:
          "Login",
        seo_description: `${site.siteName} Login`,
        canonical: site.url("/en/login")
      }
    );

  return new Response(
    html,
    {
      headers:{
        "Content-Type":
          "text/html"
      }
    }
  );

}

export async function renderRegister(
  request,
  env
){

  const renderer =
    new Renderer(env, request);
  const site = await getSiteContext(request, env);

  const html =
    await renderer.render(
      "register.html",
      {
        seo_title:
          "Register",
        seo_description: `Create ${site.siteName} account`,
        canonical: site.url("/en/register")
      }
    );

  return new Response(
    html,
    {
      headers:{
        "Content-Type":
          "text/html"
      }
    }
  );

}

export async function render404(request, env) {
  const renderer = new Renderer(env, request);
  const site = await getSiteContext(request, env);
  const html = await renderer.render("404.html", {
    seo_title: "404 - Page Not Found",
    seo_description: `Sorry, this page does not exist on ${site.siteName}.`
  });

  return new Response(html, {
    status: 404,
    headers: {
      "Content-Type": "text/html"
    }
  });
}

export async function renderCasinoList(request, env) {
  const renderer = new Renderer(env, request);
  const site = await getSiteContext(request, env);
  const casinoList = await casinos.getAllCasinos(env.DB);
  const geoData = await prepareGeoData(env, request, casinoList);
  const sortedCasinos = sortCasinosByGeo(casinoList, geoData);
  const allComponents = await renderer.renderAllComponents("casino_list", "casino_list");
  const dynamicSeo = await renderer.loadDynamicSeo("casino_list", "casino_list");

  const listSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "Complete Directory of Online Casinos",
    "itemListElement": sortedCasinos.map((c, idx) => ({
      "@type": "ListItem", "position": idx + 1,
      "url": site.url(`/en/casino/${c.slug}`)
    }))
  };
    // Public pages don't need a CSRF token, but set it to empty for the meta tag
  const html = await renderer.render("category.html", {
    canonical: dynamicSeo.canonical ||site.url("/en/casino"),
    category: "All Casinos",
    description: "Browse our complete directory of reviewed online casinos.",
    casino_cards: buildCasinoCards(sortedCasinos, geoData),
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || `All Online Casinos — ${site.siteName}.`,
    seo_description: dynamicSeo.seo_description || "Complete directory of reviewed online casinos with bonuses and ratings."
  }, listSchema, buildBreadcrumbs("casinoList"));

  return new Response(html, { headers: cacheHeaders() });
}


export async function renderReviewList(request, env) {
  const renderer = new Renderer(env, request);
  const site = await getSiteContext(request, env);
  const reviewList = await env.DB.prepare(
    "SELECT * FROM reviews WHERE published = 1 ORDER BY created_at DESC"
  ).all();
  const allComponents = await renderer.renderAllComponents("review_list", "review_list");
  const dynamicSeo = await renderer.loadDynamicSeo("review_list", "review_list");

  // Geo-aware filtering
  const reviews = reviewList.results || [];
  const casinoSlugs = [...new Set(reviews.filter(r => r.casino_slug).map(r => r.casino_slug))];

  let geoStatuses = {};
  if (casinoSlugs.length > 0) {
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

    const country = request.cf?.country || null;
    for (const slug of casinoSlugs) {
      const rules = rulesByCasino[slug] || [];
      if (rules.length === 0) { geoStatuses[slug] = "blocked"; continue; }
      const countryRule = rules.find(r => r.country_code === country);
      if (countryRule) { geoStatuses[slug] = countryRule.status; continue; }
      const hasAllowed = rules.some(r => r.status === "allowed");
      const hasBlocked = rules.some(r => r.status === "blocked");
      if (hasAllowed && !hasBlocked) geoStatuses[slug] = "blocked";
      else if (hasBlocked && !hasAllowed) geoStatuses[slug] = "allowed";
      else geoStatuses[slug] = "blocked";
    }
  }
  // NEW: fetch casino logo/name for the review cards
  let casinoMeta = {};
  if (casinoSlugs.length > 0) {
    const metaPlaceholders = casinoSlugs.map(() => '?').join(',');
    const casinoRows = await env.DB.prepare(`
      SELECT slug, name, logo FROM casinos WHERE slug IN (${metaPlaceholders})
    `).bind(...casinoSlugs).all();
    for (const row of (casinoRows.results || [])) {
      casinoMeta[row.slug] = row;
    }
  }

    // Geo-rank: available first (by rating desc), then unavailable (by rating desc)
  reviews.sort((a, b) => {
    const aAvail = a.casino_slug && geoStatuses[a.casino_slug] === "allowed" ? 1 : 0;
    const bAvail = b.casino_slug && geoStatuses[b.casino_slug] === "allowed" ? 1 : 0;
    if (aAvail !== bAvail) return bAvail - aAvail;
    return (b.rating || 0) - (a.rating || 0);
  });

  const reviewCards = reviews.map(r => {
    const geoStatus = r.casino_slug ? (geoStatuses[r.casino_slug] || "blocked") : "unknown";
    const geoBadge = geoStatus === "allowed"
      ? '<span class="status-badge status-published">✓ Available</span>'
      : geoStatus === "blocked"
        ? '<span class="status-badge status-draft">✕ Restricted</span>'
        : '<span class="status-badge status-draft">Unknown</span>';

    const casino = r.casino_slug ? casinoMeta[r.casino_slug] : null;
    const casinoImage = casino?.logo || '/static/images/default.png';
    const casinoImageAlt = casino?.name || r.title;

    return `
    <div class="casino-card">
      <div class="casino-card__image">
        <img src="${casinoImage}" alt="${casinoImageAlt}" loading="lazy" onerror="this.src='/static/images/default.png'">
      </div>
      <div class="casino-card__body">
        <h3><a href="/en/review/${r.slug}">${r.title}</a></h3>
        <div class="casino-card__rating">★ ${r.rating ? r.rating + "/5" : "N/A"}</div>
        <p class="muted">${(r.content || "").substring(0, 120)}...</p>
        ${r.casino_slug ? geoBadge : ""}
      </div>
      <div class="casino-card__actions">
        <a href="/en/review/${r.slug}" class="btn btn--primary">Read Review</a>
      </div>
    </div>`;
  }).join("");

  const listSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "All Casino Reviews",
    "itemListElement": reviews.map((r, idx) => ({
      "@type": "ListItem", "position": idx + 1,
      "url": site.url(`/en/review/${r.slug}`)
    }))
  };
      // Public pages don't need a CSRF token, but set it to empty for the meta tag
  const html = await renderer.render("category.html", {
    canonical: dynamicSeo.canonical || site.url("/en/review"),
    category: "All Reviews",
    description: "Browse our complete collection of casino reviews.",
    casino_cards: reviewCards,
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || `All Casino Reviews — ${site.siteName}.`,
    seo_description: dynamicSeo.seo_description || "In-depth casino reviews with pros, cons, and ratings."
  }, listSchema, buildBreadcrumbs("reviewList"));

  return new Response(html, { headers: cacheHeaders() });
}

export async function renderNewsList(request, env) {
  const renderer = new Renderer(env, request);
  const site = await getSiteContext(request, env);

  const url = new URL(request.url);
  const searchQuery = (url.searchParams.get("q") || "").trim();
  const tagFilter = (url.searchParams.get("tag") || "").trim();

  let newsList = [];
  let pageTitle = "News";
  let pageDescription = `Latest iGaming industry news and updates from ${site.siteName}.`;

  if (searchQuery) {
    newsList = await news.searchNews(env.DB, searchQuery, 50);
    pageTitle = `Search: ${searchQuery}`;
    pageDescription = `Search results for "${searchQuery}" — ${site.siteName} News.`;
  } else if (tagFilter) {
    newsList = await news.getNewsByTag(env.DB, tagFilter, 50);
    pageTitle = `Tag: ${tagFilter}`;
    pageDescription = `News articles tagged with "${tagFilter}" — ${site.siteName}.`;
  } else {
    newsList = await news.getAllNews(env.DB);
  }

  const allComponents = await renderer.renderAllComponents("news_list", "news_list");
  const dynamicSeo = await renderer.loadDynamicSeo("news_list", "news_list");

  const newsListUrl = dynamicSeo.canonical || site.url("/en/news");

  // ── Render news cards with featured images, excerpts, tags ──
  const newsCards = newsList.map(article => {
    const image = article.featured_image_url || article.featured_image_thumbnail || "";
    const excerpt = article.excerpt || truncateText(stripHtml(article.content || ""), 150);
    const date = article.published_at || article.created_at;

    const imageHtml = image
      ? `<div style="aspect-ratio:16/9;overflow:hidden"><img src="${escapeHtml(image)}" alt="${escapeHtml(article.featured_image_alt || article.title)}" style="width:100%;height:100%;object-fit:cover;transition:transform 0.3s" loading="lazy" decoding="async"></div>`
      : `<div style="aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;background:var(--bg);color:var(--gray);font-size:13px">No image</div>`;

    const authorHtml = article.author_name
      ? `<div style="display:flex;align-items:center;gap:8px;color:var(--gray);font-size:13px;margin-top:12px">${article.author_avatar ? `<img src="${escapeHtml(article.author_avatar)}" alt="" style="width:28px;height:28px;border-radius:50%;object-fit:cover" loading="lazy">` : ""}<span>${escapeHtml(article.author_name)}</span></div>`
      : "";

    // Tags as small chips (max 3)
    const tagsHtml = article.tags
      ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px">${String(article.tags).split(",").map(t => t.trim()).filter(Boolean).slice(0, 3).map(t => `<a href="/en/news?tag=${encodeURIComponent(t)}" style="display:inline-block;padding:3px 9px;border-radius:999px;background:var(--bg);color:var(--gray);font-size:12px;text-decoration:none">${escapeHtml(t)}</a>`).join("")}</div>`
      : "";

    return `
      <article style="overflow:hidden;border:1px solid var(--light-gray);border-radius:12px;background:var(--white);transition:transform 0.2s,box-shadow 0.2s;display:flex;flex-direction:column">
        <a href="/en/news/${encodeURIComponent(article.slug)}" style="display:block;color:inherit;text-decoration:none">
          ${imageHtml}
          <div style="padding:20px;flex:1;display:flex;flex-direction:column">
            ${date ? `<time style="color:var(--gray);font-size:13px;margin-bottom:8px" datetime="${toIsoDate(date)}">${escapeHtml(formatDate(date))}</time>` : ""}
            <h3 style="margin:0 0 10px;font-size:21px;line-height:1.25;color:var(--dark)">${escapeHtml(article.title)}</h3>
            ${excerpt ? `<p style="margin:0 0 12px;color:var(--gray);font-size:15px;line-height:1.6;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${escapeHtml(excerpt)}</p>` : ""}
            ${tagsHtml}
            ${authorHtml}
          </div>
        </a>
      </article>
    `;
  }).join("");

  const hasResults = newsList.length > 0;

  const emptyStateHtml = hasResults ? "" : `
    <div style="text-align:center;padding:60px 20px;color:var(--gray)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48" style="margin-bottom:16px;opacity:0.4">
        <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
      </svg>
      <h2 style="margin:0 0 8px;font-size:22px;color:var(--dark)">No articles found</h2>
      <p style="margin:0 0 20px">Try a different search term or browse all news.</p>
      <a href="/en/news" class="btn btn--ghost">View All News</a>
    </div>
  `;

  const listSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${newsListUrl}#webpage`,
    "url": newsListUrl,
    "name": pageTitle,
    "description": pageDescription,
    "isPartOf": {
      "@type": "WebSite",
      "@id": `${site.origin}#website`,
      "name": site.siteName,
      "url": site.origin
    },
    ...(hasResults ? {
      "mainEntity": {
        "@type": "ItemList",
        "itemListElement": newsList.map((article, index) => ({
          "@type": "ListItem",
          "position": index + 1,
          "url": site.url(`/en/news/${article.slug}`),
          "name": article.title
        }))
      }
    } : {})
  };

  const html = await renderer.render("news-list.html", {
    canonical: newsListUrl,
    page_title: pageTitle,
    page_description: pageDescription,
    news_cards: newsCards,
    empty_state_html: emptyStateHtml,
    search_query: escapeHtml(searchQuery),
    tag_filter: escapeHtml(tagFilter),
    seo_title: dynamicSeo.seo_title || `${pageTitle} | ${site.siteName}`,
    seo_description: dynamicSeo.seo_description || pageDescription,
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar
  }, listSchema, buildBreadcrumbs("newsList"));

  return new Response(html, { headers: cacheHeaders() });
}


export async function renderNewsListbackup(request, env) {
  const renderer =
    new Renderer(env, request);

  const site =
    await getSiteContext(request, env);

  const newsList =
    await news.getAllNews(env.DB);

  const allComponents =
    await renderer.renderAllComponents(
      "news_list",
      "news_list"
    );

  const dynamicSeo =
    await renderer.loadDynamicSeo(
      "news_list",
      "news_list"
    );

  const newsListUrl =
    dynamicSeo.canonical ||
    site.url("/en/news");

  const newsCards =
    newsList.map(article => {

      const description =
        truncateText(
          article.content,
          120
        );

      return `
        <a
          href="${site.url(`/en/news/${article.slug}`)}"
          class="news-card"
        >
          <h3>${article.title}</h3>

          <p>${description}...</p>

          ${
            article.created_at
              ? `
                <time
                  class="news-date"
                  datetime="${toIsoDate(article.created_at)}"
                >
                  ${new Date(
                    article.created_at
                  ).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric"
                  })}
                </time>
              `
              : ""
          }
        </a>
      `;
    }).join("");

  const listSchema = {
    "@context": "https://schema.org",

    "@type": "CollectionPage",

    "@id": `${newsListUrl}#webpage`,

    "url": newsListUrl,

    "name":
      dynamicSeo.seo_title ||
      `${site.siteName} News`,

    "description":
      dynamicSeo.seo_description ||
      `Latest news and updates from ${site.siteName}.`,

    "isPartOf": {
      "@type": "WebSite",

      "@id":
        `${site.origin}#website`,

      "name":
        site.siteName,

      "url":
        site.origin
    },

    "mainEntity": {
      "@type": "ItemList",

      "@id":
        `${newsListUrl}#itemlist`,

      "name":
        `${site.siteName} News`,

      "numberOfItems":
        newsList.length,

      "itemListOrder":
        "https://schema.org/ItemListOrderDescending",

      "itemListElement":
        newsList.map(
          (article, index) => {

            const articleUrl =
              site.url(
                `/en/news/${article.slug}`
              );

            const published =
              toIsoDate(
                article.created_at
              );

            const modified =
              toIsoDate(
                article.updated_at ||
                article.created_at
              );

            return {
              "@type":
                "ListItem",

              "position":
                index + 1,

              "url":
                articleUrl,

              "item": {
                "@type":
                  "NewsArticle",

                "@id":
                  `${articleUrl}#newsarticle`,

                "url":
                  articleUrl,

                "headline":
                  article.title,

                "description":
                  article.seo_description ||
                  truncateText(
                    article.content,
                    160
                  ),

                ...(published
                  ? {
                      "datePublished":
                        published
                    }
                  : {}),

                ...(modified
                  ? {
                      "dateModified":
                        modified
                    }
                  : {}),

                "author": {
                  "@type":
                    "Person",

                  "name":
                    article.author ||
                    site.siteName
                },

                "publisher": {
                  "@type":
                    "Organization",

                  "name":
                    site.siteName,

                  "url":
                    site.origin,

                  ...(site.logoUrl
                    ? {
                        "logo": {
                          "@type":
                            "ImageObject",

                          "url":
                            site.logoUrl
                        }
                      }
                    : {})
                }
              }
            };
          }
        )
    }
  };

  const html =
    await renderer.render(
      "category.html",
      {
        canonical:
          newsListUrl,

        category:
          dynamicSeo.seo_title ||
          `${site.siteName} News`,

        description:
          dynamicSeo.seo_description ||
          `Latest news and updates from ${site.siteName}.`,

        casino_cards:
          `<div class="news-grid">${newsCards}</div>`,

        components_top:
          allComponents.top,

        components_content_top:
          allComponents.content_top,

        components_content_bottom:
          allComponents.content_bottom,

        components_bottom:
          allComponents.bottom,

        components_sidebar:
          allComponents.sidebar,

        seo_title:
          dynamicSeo.seo_title ||
          `${site.siteName} News`,

        seo_description:
          dynamicSeo.seo_description ||
          `Latest news and updates from ${site.siteName}.`
      },

      listSchema,

      buildBreadcrumbs(
        "newsList"
      )
    );

  return new Response(
    html,
    {
      headers: cacheHeaders()
    }
  );
}

export async function renderUpdatesList(request, env) {
  const renderer = new Renderer(env, request);
  const site = await getSiteContext(request, env);
  const updates =
    await platformUpdates.getAllPlatformUpdates(env.DB);

  const allComponents =
    await renderer.renderAllComponents(
      "updates_list",
      "updates_list"
    );

  const dynamicSeo =
    await renderer.loadDynamicSeo(
      "updates_list",
      "updates_list"
    );

  const updateCards = updates.map(update => {

    const image = update.featured_image
      ? `
        <img
          src="/media/${update.featured_image}"
          alt="${update.title}"
          class="update-card-image"
          loading="lazy"
        >
      `
      : "";

    const date = formatDate(
      update.published_at || update.created_at
    );

    return `
      <article class="update-card">

        ${image}

        <div class="update-card-body">

          <div class="update-card-label">
            Platform Update
          </div>

          <h2>
            <a href="/en/updates/${update.slug}">
              ${update.title}
            </a>
          </h2>

          ${
            update.excerpt
              ? `<p>${update.excerpt}</p>`
              : ""
          }

          <div class="update-card-meta">
            ${date}
          </div>

        </div>

      </article>
    `;
  }).join("");

  const listSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
      "name": `${site.siteName} Platform Updates`,
    "description": dynamicSeo.seo_description || `${site.siteName} latest updates, improvements, features and announcements`,
    "url": site.url("/en/updates"),
    "mainEntity": {
      "@type": "ItemList",
      "itemListElement": updates.map((update, index) => ({
        "@type": "ListItem",
        "position": index + 1,
        "url": site.url(`/en/updates/${update.slug}`),
        "name": update.title
      }))
    }
  };

  const html = await renderer.render(
    "updates.html",
    {
      canonical:
        dynamicSeo.canonical || site.url(`/en/updates`),

      category: "Platform Updates",

      description:
        dynamicSeo.seo_description || `Latest ${site.siteName} platform updates, improvements, features and announcements.`,

      update_cards:
        updateCards,

      components_top:
        allComponents.top,

      components_content_top:
        allComponents.content_top,

      components_content_bottom:
        allComponents.content_bottom,

      components_bottom:
        allComponents.bottom,

      components_sidebar:
        allComponents.sidebar,
      seo_title: dynamicSeo.seo_title || `Platform Updates — ${site.siteName}`,
      seo_description: dynamicSeo.seo_description || `Latest ${site.siteName} platform updates, new features, improvements and announcements.`
    },
    listSchema,
    buildBreadcrumbs("updatesList")
  );

  return new Response(html, {
    headers: cacheHeaders()
  });
}

export async function renderUpdate(request, env, slug) {
  const update =
    await platformUpdates.getPlatformUpdateBySlug(
      env.DB,
      slug
    );

  if (!update) {
    return render404(request, env);
  }

  const renderer = new Renderer(env, request);
  const site = await getSiteContext(request, env);

  const allComponents =
    await renderer.renderAllComponents(
      "update",
      slug
    );

  const dynamicSeo =
    await renderer.loadDynamicSeo(
      "update",
      slug
    );

  const publishedDate =
    formatDate(
      update.published_at ||
      update.created_at
    );

  const updatedDate =
    formatDate(
      update.updated_at ||
      update.created_at
    );

  const updateSchema = {
    "@context": "https://schema.org",
    "@type": "Article",

    "headline": update.title,

    "description":
      update.seo_description ||
      update.excerpt ||
      "",

    "datePublished":
      update.published_at ||
      update.created_at,

    "dateModified":
      update.updated_at ||
      update.created_at,

    "author": {
      "@type": "Person",
      "name": update.author_name || site.siteName
    },

    "publisher": {
      "@type": "Organization",
      "name": site.siteName,
      "url": site.origin
    },

    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": site.url(`/en/updates/${slug}`)
    }
  };

  const html = await renderer.render(
    "update.html",
    {
      ...update,

      canonical:
        dynamicSeo.canonical ||
        site.url(`/en/updates/${slug}`),

      author_name:
        update.author_name || "",

      author_avatar:
        update.author_avatar || "",

      author_role:
        update.author_role || "",

      author_slug:
        update.author_slug || "",

      published_date:
        publishedDate,

      updated_date:
        updatedDate,

      seo_title:
        dynamicSeo.seo_title ||
        update.seo_title ||
        update.title,

      seo_description:
        dynamicSeo.seo_description ||
        update.seo_description ||
        update.excerpt ||
        "",

      components_top:
        allComponents.top,

      components_content_top:
        allComponents.content_top,

      components_content_bottom:
        allComponents.content_bottom,

      components_bottom:
        allComponents.bottom,

      components_sidebar:
        allComponents.sidebar
    },
    updateSchema,
    buildBreadcrumbs(
      "update",
      { title: update.title }
    )
  );

  return new Response(html, {
    headers: cacheHeaders()
  });
}

async function renderAdminPage(request, env, template, extraData = {}) {
  const user = await getCurrentUser(request, env);
  const allowedRoles = ["admin", "editor"];

  if (!user || !allowedRoles.includes(user.role)) {
    return new Response("Forbidden", { status: 403 });
  }

  const renderer = new Renderer(env, request);
  const site = await getSiteContext(request, env);
  // Load shared admin navigation
  const adminNav = await renderer.loadTemplate("layout/admin-nav.html");
  const html = await renderer.render(template, {
      seo_title: `Admin — ${site.siteName}`,
      seo_description: `${site.siteName} CMS Admin`,

      email: user.email,
      role: user.role,
      admin_nav: adminNav,

      ...extraData
  });

  return new Response(html, {
    headers: { "Content-Type": "text/html" }
  });
}



export async function renderDashboardCasinos(request, env) {
  return renderAdminPage(request, env, "admin/casinos.html");
}
export async function renderDashboardCasinoCreate(request, env) {
  return renderAdminPage(request, env, "admin/casino-create.html");
}
export async function renderDashboardReviews(request, env) {
  return renderAdminPage(request, env, "admin/reviews.html");
}
export async function renderDashboardNews(request, env) {
  return renderAdminPage(request, env, "admin/news.html");
}
export async function renderDashboardUpdates(request, env) {
  return renderAdminPage(request, env, "admin/updates.html");
}
export async function renderDashboardCountryPages(request, env) {
  return renderAdminPage(request, env, "admin/country-pages.html");
}
export async function renderDashboardCategoryCountries(request, env) {
  return renderAdminPage(request, env, "admin/category-countries.html");
}
export async function renderDashboardPages(request, env) {
  return renderAdminPage(request, env, "admin/pages.html");
}
export async function renderDashboardSettings(request, env) {
  return renderAdminPage(request, env, "admin/settings.html");
}
export async function renderDashboardAI(request, env) {
  return renderAdminPage(request, env, "admin/ai.html");
}

async function renderUserPage(request, env, template) {
  const user = await getCurrentUser(request, env);

  if (!user) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/en/login"
      }
    });
  }

  const renderer = new Renderer(env, request);
  const site = await getSiteContext(request, env);

  const html = await renderer.render(template, {
    seo_title: `${site.siteName} — Dashboard`,
    seo_description: `Manage your ${site.siteName} account`,
    email: user.email,
    role: user.role
  });

  return new Response(html, {
    headers: {
      "Content-Type": "text/html"
    }
  });
}

export async function renderUserDashboard(request, env) {
  return renderUserPage(request, env, "users/dashboard.html");
}
export async function renderUserSubmitCasino(request, env) {
  return renderUserPage(request, env, "users/submit-casino.html");
}
export async function renderUserInquiries(request, env) {
  return renderUserPage(request, env, "users/inquiries.html");
}
export async function renderUserProfile(request, env) {
  return renderUserPage(request, env, "users/profile.html");
}
export async function renderUserNotifications(request, env) {
  return renderUserPage(request, env, "users/notifications.html");
}


export async function renderCategoryList(request, env) {
  const renderer = new Renderer(env, request);
  const site = await getSiteContext(request, env);
  const cats = await categories.getAllCategories(env.DB);
  const allComponents = await renderer.renderAllComponents("category_list", "category_list");
  const dynamicSeo = await renderer.loadDynamicSeo("category_list", "category_list");

  const categoryCards = cats.map(c => `
    <div class="feature-card">
      <h3><a href="/en/category/${c.slug}">${c.name}</a></h3>
      <p>${c.description || ""}</p>
    </div>
  `).join("");
      // Public pages don't need a CSRF token, but set it to empty for the meta tag
  const html = await renderer.render("category.html", {
    category: "All Categories",
    description: "Browse casinos by category.",
    casino_cards: `<div class="features-grid">${categoryCards}</div>`,
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || `Casino Categories — ${site.siteName}`,
    seo_description: dynamicSeo.seo_description ||  `Browse online casinos by category on ${site.siteName}.`
  }, {}, buildBreadcrumbs("categoryList"));

  return new Response(html, { headers: cacheHeaders() });
}

export async function renderCountryList(request, env) {
  const renderer = new Renderer(env, request);
  const site = await getSiteContext(request, env);
  const countriesList = await countries.getAllCountries(env.DB);
  const allComponents = await renderer.renderAllComponents("country_list", "country_list");
  const dynamicSeo = await renderer.loadDynamicSeo("country_list", "country_list");

  const countryChips = countriesList.map(c => `
    <a href="/en/country/${c.code}" class="chip">${c.name}</a>
  `).join("");
    // Public pages don't need a CSRF token, but set it to empty for the meta tag
  const html = await renderer.render("category.html", {
    category: "All Countries",
    description: "Browse online casinos available in your country.",
    casino_cards: `<div class="country-chips" style="justify-content:center;padding:20px">${countryChips}</div>`,
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || `Online Casinos by Country — ${site.siteName}`,
    seo_description: dynamicSeo.seo_description || `Find online casinos available in your country on ${site.siteName}.`
  }, {}, buildBreadcrumbs("countryList"));

  return new Response(html, { headers: cacheHeaders() });
}

export async function renderDashboardCategories(request, env) {
  return renderAdminPage(request, env, "admin/categories.html");
}

export async function renderDashboardCountries(request, env) {
  return renderAdminPage(request, env, "admin/countries.html");
}

export async function renderDashboardCasinoEdit(request, env, slug) {
  return renderAdminPage(request, env, "admin/casino-edit.html", { slug });
}


export async function renderDashboardComponents(request, env) {
  return renderAdminPage(request, env, "admin/components.html");
}

export async function renderDashboardSeo(request, env) {
  return renderAdminPage(request, env, "admin/seo.html");
}






// ==================================
// AUTHOR PROFILE PAGE
// ==================================


export async function renderAuthor(request, env, slug) {
  const author = await authors.getAuthor(env.DB, slug);
  if (!author) return render404(request, env);

  const renderer = new Renderer(env, request);
  const site = await getSiteContext(request, env);
  const content = await authors.getAuthorContent(env.DB, author.id);
  const stats = await authors.getAuthorStats(env.DB, author.id);
  const allComponents = await renderer.renderAllComponents("author", slug);
  const dynamicSeo = await renderer.loadDynamicSeo("author", slug);

  // Build review cards
  // NEW: fetch casino logo/name for review cards
  const authorCasinoSlugs = [...new Set(content.reviews.filter(r => r.casino_slug).map(r => r.casino_slug))];
  let authorCasinoMeta = {};
  if (authorCasinoSlugs.length > 0) {
    const metaPlaceholders = authorCasinoSlugs.map(() => '?').join(',');
    const casinoRows = await env.DB.prepare(`
      SELECT slug, name, logo FROM casinos WHERE slug IN (${metaPlaceholders})
    `).bind(...authorCasinoSlugs).all();
    for (const row of (casinoRows.results || [])) {
      authorCasinoMeta[row.slug] = row;
    }
  }

  // Build review cards
  const reviewCards = content.reviews.map(r => {
    const casino = r.casino_slug ? authorCasinoMeta[r.casino_slug] : null;
    const casinoImage = casino?.logo || '/static/images/default.png';
    const casinoImageAlt = casino?.name || r.title;

    return `
    <div class="casino-card">
      <div class="casino-card__image">
        <img src="${casinoImage}" alt="${casinoImageAlt}" loading="lazy" onerror="this.src='/static/images/default.png'">
      </div>
      <div class="casino-card__body">
        <h3><a href="/en/review/${r.slug}">${r.title}</a></h3>
        <div class="casino-card__rating">★ ${r.rating ? r.rating + "/5" : "N/A"}</div>
        <p class="muted">Updated: ${new Date(r.updated_at).toLocaleDateString()}</p>
      </div>
      <div class="casino-card__actions">
        <a href="/en/review/${r.slug}" class="btn btn--primary">Read Review</a>
      </div>
    </div>
  `;
  }).join("");

  // Build news cards
  const newsCards = content.news.map(n => {
    const image = n.featured_image_url || n.featured_image_thumbnail || "";
    const imageHtml = image
      ? `<div style="aspect-ratio:16/9;overflow:hidden"><img src="${escapeHtml(image)}" alt="${escapeHtml(n.featured_image_alt || n.title)}" style="width:100%;height:100%;object-fit:cover" loading="lazy" decoding="async"></div>`
      : `<div style="aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;background:var(--bg);color:var(--gray);font-size:13px">No image</div>`;

    return `
    <article style="overflow:hidden;border:1px solid var(--light-gray);border-radius:12px;background:var(--white);transition:transform 0.2s,box-shadow 0.2s">
      <a href="/en/news/${n.slug}" style="display:block;color:inherit;text-decoration:none">
        ${imageHtml}
        <div style="padding:20px">
          <h3 style="margin:0 0 8px;font-size:18px;line-height:1.3;color:var(--dark)">${escapeHtml(n.title)}</h3>
          ${n.excerpt ? `<p style="margin:0 0 10px;color:var(--gray);font-size:14px;line-height:1.6">${escapeHtml(n.excerpt)}</p>` : ""}
          <p class="muted" style="margin:0">${new Date(n.created_at).toLocaleDateString()}</p>
        </div>
      </a>
    </article>
  `;
  }).join("");


  // Build page list
  const pageList = content.pages.map(p => `
    <li><a href="/en/${p.slug}">${p.title}</a> <span class="muted">— ${new Date(p.created_at).toLocaleDateString()}</span></li>
  `).join("");

  const authorSchema = {
    "@context": "https://schema.org",
    "@type": "Person",
    "name": author.name,
    "description": author.bio || "",
    "image": author.avatar_url || "",
    "jobTitle": author.role || "Editor"
  };

  const html = await renderer.render("author.html", {
    ...author,
    author_name: author.name,
    author_bio: author.bio || "",
    author_avatar: author.avatar_url || site.logoUrl,
    author_role: author.role || "Editor",
    author_social: author.social_links || "",
    review_cards: reviewCards,
    news_cards: newsCards || '<p class="muted">No articles yet.</p>',
    page_list: pageList || '<li class="muted">No pages yet.</li>',
    review_count: stats.reviews,
    news_count: stats.news,
    page_count: stats.pages,
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,                                                                                                              components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || author.name + " — " + site.siteName,
    seo_description: dynamicSeo.seo_description || author.bio || author.name + " is a " + (author.role || "editor") + " at " + site.siteName ,
    canonical: dynamicSeo.canonical || site.url(`/en/author/${slug}`)
  }, authorSchema, buildBreadcrumbs("author", {author_name: author.name }));
  return new Response(html, { headers: cacheHeaders() });
}

export async function renderAuthorbackup(request, env, slug) {
  const author = await authors.getAuthor(env.DB, slug);
  if (!author) return render404(request, env);

  const renderer = new Renderer(env, request);
  const site = await getSiteContext(request, env);
  const content = await authors.getAuthorContent(env.DB, author.id);
  const stats = await authors.getAuthorStats(env.DB, author.id);
  const allComponents = await renderer.renderAllComponents("author", slug);
  const dynamicSeo = await renderer.loadDynamicSeo("author", slug);

  // Build review cards
  const reviewCards = content.reviews.map(r => `
    <div class="casino-card">
      <div class="casino-card__body">
        <h3><a href="/en/review/${r.slug}">${r.title}</a></h3>
        <div class="casino-card__rating">★ ${r.rating ? r.rating + "/5" : "N/A"}</div>
        <p class="muted">Updated: ${new Date(r.updated_at).toLocaleDateString()}</p>
      </div>
      <div class="casino-card__actions">
        <a href="/en/review/${r.slug}" class="btn btn--primary">Read Review</a>
      </div>
    </div>
  `).join("");

  // Build news cards
  const newsCards = content.news.map(n => `
    <a href="/en/news/${n.slug}" class="news-card">
      <h3>${n.title}</h3>
      <p class="muted">${new Date(n.created_at).toLocaleDateString()}</p>
    </a>
  `).join("");

  // Build page list
  const pageList = content.pages.map(p => `
    <li><a href="/en/${p.slug}">${p.title}</a> <span class="muted">— ${new Date(p.created_at).toLocaleDateString()}</span></li>
  `).join("");

  const authorSchema = {
    "@context": "https://schema.org",
    "@type": "Person",
    "name": author.name,
    "description": author.bio || "",
    "image": author.avatar_url || "",
    "jobTitle": author.role || "Editor"
  };

  const html = await renderer.render("author.html", {
    ...author,
    author_name: author.name,
    author_bio: author.bio || "",
    author_avatar: author.avatar_url || site.logoUrl,
    author_role: author.role || "Editor",
    author_social: author.social_links || "",
    review_cards: reviewCards,
    news_cards: newsCards || '<p class="muted">No articles yet.</p>',
    page_list: pageList || '<li class="muted">No pages yet.</li>',
    review_count: stats.reviews,
    news_count: stats.news,
    page_count: stats.pages,
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || author.name + " — " + site.siteName,
    seo_description: dynamicSeo.seo_description || author.bio || author.name + " is a " + (author.role || "editor") + " at " + site.siteName ,
    canonical: dynamicSeo.canonical || site.url(`/en/author/${slug}`)
  }, authorSchema, buildBreadcrumbs("author", {author_name: author.name }));
  return new Response(html, { headers: cacheHeaders() });
}


// =====================================================
// AUTHORS LIST
// /en/author
// =====================================================

export async function renderAuthorList(request, env) {
  const renderer = new Renderer(env, request);

  const authorsList = await authors.getAllAuthors(env.DB);

  const allComponents = await renderer.renderAllComponents(
    "author_list",
    "author_list"
  );

  const dynamicSeo = await renderer.loadDynamicSeo(
    "author_list",
    "author_list"
  );

  const authorCards = (authorsList || []).map((author) => {
    const avatar = author.avatar_url
      ? `
        <img
          src="${author.avatar_url}"
          alt="${author.name}"
          class="author-card__avatar"
          loading="lazy"
        >
      `
      : "";

    const bio = author.bio
      ? author.bio.substring(0, 180)
      : "";

    return `
      <article class="author-card">

        <div class="author-card__media">
          ${avatar}
        </div>

        <div class="author-card__body">

          <h2>
            <a href="/en/author/${author.slug}">
              ${author.name}
            </a>
          </h2>

          ${
            author.role
              ? `<div class="author-card__role">${author.role}</div>`
              : ""
          }

          ${
            bio
              ? `
                <p>
                  ${bio}${author.bio.length > 180 ? "..." : ""}
                </p>
              `
              : ""
          }

          <a
            href="/en/author/${author.slug}"
            class="btn btn--primary"
          >
            View Profile
          </a>

        </div>

      </article>
    `;
  }).join("");

  const listSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name":
      dynamicSeo?.seo_title ||
      "Authors",
    "description":
      dynamicSeo?.seo_description ||
      "Meet the authors and editorial team behind our content.",
    "url": new URL(request.url).origin + "/en/author",
    "mainEntity": {
      "@type": "ItemList",
      "itemListElement": (authorsList || []).map(
        (author, index) => ({
          "@type": "ListItem",
          "position": index + 1,
          "name": author.name,
          "url":
            new URL(request.url).origin +
            `/en/author/${author.slug}`
        })
      )
    }
  };

  const html = await renderer.render(
    "author_list.html",
    {
      canonical:
        dynamicSeo?.canonical ||
        "/en/author",

      category: "Authors",

      description:
        dynamicSeo?.seo_description ||
        "Meet the authors and editorial team behind our content.",

      author_cards:
        authorCards ||
        '<p class="muted">No authors available.</p>',

      author_count:
        authorsList?.length || 0,

      components_top:
        allComponents?.top || "",

      components_content_top:
        allComponents?.content_top || "",

      components_content_bottom:
        allComponents?.content_bottom || "",

      components_bottom:
        allComponents?.bottom || "",

      components_sidebar:
        allComponents?.sidebar || "",

      seo_title:
        dynamicSeo?.seo_title ||
        "Authors",

      seo_description:
        dynamicSeo?.seo_description ||
        "Meet the authors and editorial team behind our content."
    },
    listSchema,
    buildBreadcrumbs("authorList")
  );

  return new Response(html, {
    headers: cacheHeaders()
  });
}

// ==================================
// ADMIN: AUTHORS
// ==================================

export async function renderDashboardAuthors(request, env) {
  return renderAdminPage(request, env, "admin/authors.html");
}


export async function renderDashboardMedia(request, env) {
  return renderAdminPage(request, env, "admin/media.html");
}

export async function renderDashboardNav(request, env) {
  return renderAdminPage(request, env, "admin/nav.html");
}

export async function renderDashboardPermissions(request, env) {
  const user = await getCurrentUser(request, env);
  if (!user || user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }
  return renderAdminPage(request, env, "admin/permissions.html");
}

export async function renderDashboardItemAccess(request, env) {
  const user = await getCurrentUser(request, env);
  if (!user || user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }
  return renderAdminPage(request, env, "admin/item-access.html");
}

//export async function renderDashboardPermissions(request, env) {
//  return renderAdminPage(request, env, "admin/permissions.html");
//}
//export async function renderDashboardItemAccess(request, env) {
//  return renderAdminPage(request, env, "admin/item-access.html");
//}
export async function renderUserBookmarks(request, env) {
  return renderUserPage(request, env, "users/bookmarks.html");
}


export async function renderDashboardUsers(request, env) {
  return renderAdminPage(request, env, "admin/users.html");
}

export async function renderDashboardInquiries(request, env) {
  return renderAdminPage(request, env, "admin/inquiries.html");
}

export async function renderDashboardSubmissions(request, env) {
  return renderAdminPage(request, env, "admin/submissions.html");
}

export async function renderDashboardNotifications(request, env) {
  return renderAdminPage(request, env, "admin/notifications.html");
}

export async function renderDashboardBanners(request, env) {
  return renderAdminPage(request, env, "admin/banners.html");
}

export async function renderSitemapPage(request, env) {
  const renderer = new Renderer(env, request);

  const site = await getSiteContext(
    request,
    env
  );

  const sitemapSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": `${site.siteName} Sitemap`,
    "description":
      "Explore casino reviews, rankings, guides and industry news."
  };

  const html = await renderer.render(
    "sitemap.html",
    {
      seo_title: `${site.siteName} Sitemap`,
      seo_description:
        "Explore casino reviews, rankings, guides and industry news.",
      title: `${site.siteName} Sitemap`
    },
    sitemapSchema,
    buildBreadcrumbs("page", {
      title: "Sitemap"
    })
  );

  return new Response(html, {
    headers: cacheHeaders()
  });
}
