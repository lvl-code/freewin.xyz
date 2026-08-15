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
import { logClick }
from "./database/clicks.js";
import {
  getCurrentUser
} from "./auth.js";
import { getGeoRule } from "./database/geo.js";
import { geoEngine } from "./geo.js";
import * as componentsDB from "./database/components.js";
import * as seoMetaDB from "./database/seo_meta.js";
import * as nav from "./database/nav.js";
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

  const homeSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "url": site.origin,
    "name": site.siteName,
    "description":site.description || "Expert casino reviews, exclusive bonuses, and real player data.",
    "publisher": {
      "@type": "Organization",
      "name": "site.siteName",
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
    components_sidebar: allComponents.sidebar
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
    country: request.cf?.country || "RW",
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
    geoRule: geoRule || { status: "allowed", bonus_override: null }
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
    country: request.cf?.country || "RW",
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
        <img src="${casino.logo || '/static/images/logo.png'}" alt="${casino.name}" class="casino-card__logo" onerror="this.src='/static/images/logo.png'" loading="lazy">
        <div class="casino-card__rating">${'★'.repeat(Math.round(casino.rating))}${'☆'.repeat(5 - Math.round(casino.rating))}</div>
      </div>
      <div class="casino-card__body">
        <h3>${casino.name}</h3>
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
        ${casino.website_url ? `<div class="compliance-row"><span class="compliance-label">18+ | PLAY RESPONSIBLY |</span> <a href="${casino.website_url}" target="_blank" rel="noopener" class="compliance-link">T&CS APPLY</a></div>` : ""}
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
        <img src="${casino.logo || '/static/images/logo.png'}" alt="${casino.name}" class="casino-card__logo" onerror="this.src='/static/images/logo.png'" loading="lazy">
        <div class="casino-card__rating">${'★'.repeat(Math.round(casino.rating))}${'☆'.repeat(5 - Math.round(casino.rating))}</div>
      </div>
      <div class="casino-card__body">
        <h3>${casino.name} Review</h3>
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
  try { pros = JSON.parse(review.pros || "[]"); } catch {}
  try { cons = JSON.parse(review.cons || "[]"); } catch {}
  let faqHtml = "";

try {
  const faqs = JSON.parse(review.faq_json || "[]");

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
      country: request.cf?.country || "RW",
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
      "name": author.name
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
  const html = await renderer.render("review.html", {
    ...review,
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
    geo_flag: geoFlag
  }, reviewSchema, buildBreadcrumbs("review", { title: review.title }));

  return new Response(html, {
    headers: cacheHeaders()
  });
}

export async function renderNews(request, env, slug) {
  const article = await news.getNews(env.DB, slug);
  if (!article) return render404(request, env);

  const renderer = new Renderer(env, request);
  const site = await getSiteContext(request, env);
  let author = null;
  if (article.author_id) {
    author = await authors.getAuthorById(env.DB, article.author_id);
  }
  const allComponents = await renderer.renderAllComponents("news", slug);
  const reviewBlocksHtml = await renderer.renderReviewBlocks(slug);
  const dynamicSeo = await renderer.loadDynamicSeo("news", slug);

  const newsSchema = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "headline": article.title,
    "datePublished": article.created_at,
    "description": article.content ? article.content.substring(0, 150) : "",
    "author": { "@type": "Person", "name": article.author || "iGaming Analyst" }
  };
  const html = await renderer.render("news.html", {
    ...article,
    canonical: dynamicSeo.canonical || site.url(`/en/news/${slug}`),
    author_name: author?.name || article.author || "",
    author_avatar: author?.avatar_url || "",
    author_role: author?.role || "",
    author_slug: author?.slug || "",
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || article.title,
    seo_description: dynamicSeo.seo_description || (article.content || "").substring(0, 155),
  }, newsSchema, buildBreadcrumbs("news", { title: article.title }));

  return new Response(html, { headers: cacheHeaders() });
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
  request.cf?.country || "RW",
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
  const countrySchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": `Best Online Casinos in ${countryData.name}`,
    "itemListElement": casinoList.map((c, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "url": site.url(`/en/country/${code}`)
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
      "url": site.url(`/en/category/${c.slug}`)
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
  const html = await renderer.render("page.html", {
    ...page,
    canonical: dynamicSeo.canonical || site.url(`/en/${slug}`),
    author_name: author?.name || "",
    author_avatar: author?.avatar_url || "",
    author_role: author?.role || "",
    author_slug: author?.slug || "",
    datePublished: formatDate(page.created_at),
    dateModified: formatDate(page.updated_at || page.created_at),
    content_json: parseContentJson(page.content_json),
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

    const country = request.cf?.country || "RW";
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

    return `
    <div class="casino-card">
      <div class="casino-card__body">
        <h3><a href="/en/review/${r.slug}">${r.title}</a></h3>
        <div class="casino-card__rating">★ ${r.rating || "N/A"}</div>
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
    canonical: dynamicSeo.canonical || site.url("/en/review")
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
  const newsList = await news.getAllNews(env.DB);
  const allComponents = await renderer.renderAllComponents("news_list", "news_list");
  const dynamicSeo = await renderer.loadDynamicSeo("news_list", "news_list");

  const newsCards = newsList.map(n => `
    <a href="/en/news/${n.slug}" class="news-card">
      <h3>${n.title}</h3>
      <p>${(n.content || "").substring(0, 120)}...</p>
      <span class="news-date">${new Date(n.created_at).toLocaleDateString()}</span>
    </a>
  `).join("");

  const listSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "iGaming Industry News Feed",
    "itemListElement": newsList.map((n, idx) => ({
      "@type": "ListItem", "position": idx + 1,
      "url": site.url(`/en/casino/${n.slug}`)
    }))
  };
      // Public pages don't need a CSRF token, but set it to empty for the meta tag
  const html = await renderer.render("category.html", {
    canonical: dynamicSeo.canonical || site.url("/en/news")
    category: "Latest News",
    description: "Latest iGaming industry news and updates.",
    casino_cards: `<div class="news-grid">${newsCards}</div>`,
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || "Casino News — Level.casino",
    seo_description: dynamicSeo.seo_description || "Latest iGaming and online casino industry news."
  }, listSchema, buildBreadcrumbs("newsList"));

  return new Response(html, { headers: cacheHeaders() });
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
    "name": site.siteName  Platform Updates,
    "description":
      dynamicSeo.seo_description ||
      "Latest updates, improvements, features and announcements from Level.casino.",
    "url": site.url(`/en/updates/${update.slug}`),
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
        dynamicSeo.seo_description ||Latest ${site.siteName} platform updates, new features, improvements and announcements.,

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

      seo_title:
        dynamicSeo.seo_title ||
        "Platform Updates — Level.casino",

      seo_description:
        dynamicSeo.seo_description ||
        "Latest Level.casino platform updates, new features, improvements and announcements."
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
      "name":
        update.author_name ||
        "Level.casino"
    },

    "publisher": {
      "@type": "Organization",
      "name": "Level.casino",
      "url": "https://level.casino"
    },

    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id":
        `https://level.casino/en/updates/${slug}`
    }
  };

  const html = await renderer.render(
    "update.html",
    {
      ...update,

      canonical:
        dynamicSeo.canonical ||
        `https://level.casino/en/updates/${slug}`,

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
  // Load shared admin navigation
  const adminNav = await renderer.loadTemplate("layout/admin-nav.html");
  const html = await renderer.render(template, {
      seo_title: "Admin — Level.casino",
      seo_description: "Level.casino CMS Admin",

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
      headers: { Location: "/en/login" }
    });
  }

  const renderer = new Renderer(env, request);
  const html = await renderer.render(template, {
    seo_title: "Level.casino — Dashboard",
    seo_description: "Manage your account",
    email: user.email,
    role: user.role
  });

  return new Response(html, {
    headers: { "Content-Type": "text/html" }
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
    seo_title: dynamicSeo.seo_title || "Casino Categories — Level.casino",
    seo_description: dynamicSeo.seo_description || "Browse online casinos by category."
  }, {}, buildBreadcrumbs("categoryList"));

  return new Response(html, { headers: cacheHeaders() });
}

export async function renderCountryList(request, env) {
  const renderer = new Renderer(env, request);
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
    seo_title: dynamicSeo.seo_title || "Online Casinos by Country — Level.casino",
    seo_description: dynamicSeo.seo_description || "Find online casinos available in your country."
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
  const content = await authors.getAuthorContent(env.DB, author.id);
  const stats = await authors.getAuthorStats(env.DB, author.id);
  const allComponents = await renderer.renderAllComponents("author", slug);
  const dynamicSeo = await renderer.loadDynamicSeo("author", slug);

  // Build review cards
  const reviewCards = content.reviews.map(r => `
    <div class="casino-card">
      <div class="casino-card__body">
        <h3><a href="/en/review/${r.slug}">${r.title}</a></h3>
        <div class="casino-card__rating">★ ${r.rating || "N/A"}</div>
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
    author_avatar: author.avatar_url || "/static/images/logo.png",
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
    seo_title: dynamicSeo.seo_title || author.name + " — Level.casino",
    seo_description: dynamicSeo.seo_description || author.bio || author.name + " is a " + (author.role || "editor") + " at Level.casino.",
    canonical: dynamicSeo.canonical || `https://level.casino/en/author/${slug}`
  }, authorSchema, [{ label: "Home", url: "/en" }, { label: "Authors", url: null }, { label: author.name, url: null }]);

  return new Response(html, { headers: cacheHeaders() });
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
