// =====================================================
// LUMMET AI — Database Retrieval (RAG Layer)
// Accepts LLM-generated search plan for smarter queries
// Schema-matched to Level.casino D1 production tables
// =====================================================
import { getSiteContext } from "../site-context.js";


const MAX_RESULTS = 8;
const MAX_CONTENT_LENGTH = 500;

const COUNTRY_NAME_TO_CODE = {
  'rwanda':'RW','united states':'US','usa':'US','america':'US','canada':'CA',
  'united kingdom':'GB','uk':'GB','england':'GB','germany':'DE','france':'FR',
  'italy':'IT','spain':'ES','netherlands':'NL','holland':'NL','australia':'AU',
  'new zealand':'NZ','japan':'JP','china':'CN','india':'IN','brazil':'BR',
  'mexico':'MX','south africa':'ZA','nigeria':'NG','kenya':'KE','egypt':'EG',
  'sweden':'SE','norway':'NO','denmark':'DK','finland':'FI','poland':'PL',
  'portugal':'PT','greece':'GR','turkey':'TR','russia':'RU','ukraine':'UA',
  'united arab emirates':'AE','saudi arabia':'SA','qatar':'QA','south korea':'KR',
  'korea':'KR','thailand':'TH','vietnam':'VN','philippines':'PH','indonesia':'ID',
  'malaysia':'MY','singapore':'SG','argentina':'AR','chile':'CL','colombia':'CO',
  'peru':'PE','austria':'AT','switzerland':'CH','ireland':'IE','belgium':'BE',
  'czech republic':'CZ','hungary':'HU','romania':'RO','bulgaria':'BG',
  'croatia':'HR','malta':'MT','cyprus':'CY','luxembourg':'LU','iceland':'IS'
};

const VALID_TABLES = ['casinos','reviews','review_blocks','news', 'platform_updates','pages','faqs','authors','countries','categories','geo_rules','seo_meta'];

function truncate(text, max = MAX_CONTENT_LENGTH) {
  if (!text) return '';
  const clean = String(text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.substring(0, max) + '...' : clean;
}

/**
 * Main retrieval function — uses LLM plan if available, falls back to keyword extraction
 */
export async function retrieve(env, query, country, plan = null, conversationHistory = null, request = null ) {
  const db = env.DB;
  const site = request
  ? await getSiteContext(request, env)
  : {
      origin: "",
      siteName: "",
      url: path => path
    };
  const text = query.toLowerCase().trim();

  // ── Determine search parameters from plan or fallback ──
  const searchTerms = plan?.search_terms?.length > 0
    ? plan.search_terms
    : extractSearchTerms(query);

  const casinoNames = plan?.casino_names || [];
  const allSearchTerms = [...new Set([
    ...searchTerms,
    ...casinoNames.map(n => n.toLowerCase())
  ])].filter(t => t.length > 0);

  const detectedCountry = plan?.country_code || extractCountryFromMessage(query) || country;
  const intent = plan?.intent || 'general';
  const isListing = plan?.is_listing || isListingText(text);
  const isGeo = plan?.intent === 'geo' || isGeoText(text);
  const isComparison = plan?.is_comparison || false;
  const tablesToSearch = plan?.tables || [];

  const results = {
    casinos: [], reviews: [], reviewBlocks: [], news: [], platformUpdates: [],
    pages: [], faqs: [], authors: [], countries: [],
    categories: [], seoMeta: [], geoStatuses: {}, casinoCategories: {}
  };

  // ═══════════════════════════════════════════════════
  // CASINOS
  // ═══════════════════════════════════════════════════
  if (shouldSearchTable('casinos', tablesToSearch, intent, ['casino_search','casino_review','casino_compare','bonuses','crypto','payments','geo','general'])) {
    try {
      if (isGeo && detectedCountry) {
        // ── Geo search: find casinos available in a specific country ──
        const geoR = await db.prepare(`
          SELECT gr.casino_slug, gr.status, gr.bonus_override,
                 c.slug, c.name, c.rating, c.bonus_title, c.bonus_value,
                 c.license, c.owner, c.features
          FROM geo_rules gr
          JOIN casinos c ON c.slug = gr.casino_slug
          WHERE gr.country_code = ? AND gr.status = 'allowed' AND c.published = 1
          ORDER BY c.featured DESC, c.rating DESC LIMIT 20
        `).bind(detectedCountry.toUpperCase()).all();

        if (geoR.results && geoR.results.length > 0) {
          results.casinos = geoR.results.map(c => ({
            slug: c.slug || c.casino_slug, name: c.name, rating: c.rating,
            bonus_title: c.bonus_override || c.bonus_title, bonus_value: c.bonus_value,
            license: c.license, owner: c.owner, features: c.features
          }));
          for (const c of results.casinos) results.geoStatuses[c.slug] = 'allowed';
        } else {
          // Fallback: check supported_countries column
          const supportedR = await db.prepare(`
            SELECT slug, name, rating, bonus_title, bonus_value, license, owner,
                   features, supported_countries, restricted_countries
            FROM casinos WHERE published = 1
            AND (LOWER(supported_countries) LIKE ? OR LOWER(supported_countries) LIKE ?)
            AND LOWER(restricted_countries) NOT LIKE ?
            ORDER BY featured DESC, rating DESC LIMIT 20
          `).bind(`%${detectedCountry.toLowerCase()}%`, `%"${detectedCountry.toUpperCase()}"%`, `%${detectedCountry.toLowerCase()}%`).all();

          if (supportedR.results && supportedR.results.length > 0) {
            results.casinos = supportedR.results;
            for (const c of results.casinos) results.geoStatuses[c.slug] = 'allowed';
          } else {
            // Last resort: all casinos, evaluate geo per casino
            const allR = await db.prepare(`
              SELECT slug, name, rating, bonus_title, bonus_value, license, owner,
                     features, supported_countries, restricted_countries, featured
              FROM casinos WHERE published = 1
              ORDER BY featured DESC, rating DESC, sort_order ASC LIMIT 20
            `).all();
            results.casinos = allR.results || [];
            for (const c of results.casinos) results.geoStatuses[c.slug] = evaluateGeoFromColumns(c, detectedCountry);
          }
        }
      } else if (isListing) {
        // ── Listing: return all published casinos ──
        const r = await db.prepare(`
          SELECT slug, name, rating, bonus_title, bonus_value, license, owner,
                 features, supported_countries, restricted_countries, featured
          FROM casinos WHERE published = 1
          ORDER BY featured DESC, rating DESC, sort_order ASC LIMIT 20
        `).all();
        results.casinos = r.results || [];
      } else if (allSearchTerms.length > 0) {
        // ── Keyword search ──
        const conditions = allSearchTerms.map(() =>
          'LOWER(name) LIKE ? OR LOWER(slug) LIKE ? OR LOWER(bonus_title) LIKE ? OR LOWER(features) LIKE ?'
        ).join(' OR ');
        const params = [];
        for (const term of allSearchTerms) params.push(`%${term}%`, `%${term}%`, `%${term}%`, `%${term}%`);
        const r = await db.prepare(`
          SELECT slug, name, rating, bonus_title, bonus_value, license, owner,
                 features, supported_countries, restricted_countries, featured
          FROM casinos WHERE published = 1 AND (${conditions}) LIMIT ${MAX_RESULTS}
        `).bind(...params).all();
        results.casinos = r.results || [];
      } else if (intent === 'casino_search' || intent === 'general') {
        // ── Fallback: top casinos ──
        const r = await db.prepare(`
          SELECT slug, name, rating, bonus_title, bonus_value, license, owner,
                 features, supported_countries, restricted_countries, featured
          FROM casinos WHERE published = 1
          ORDER BY featured DESC, rating DESC, sort_order ASC LIMIT 10
        `).all();
        results.casinos = r.results || [];
      }

      // Parse features
      for (const casino of results.casinos) {
        try { casino.parsedFeatures = casino.features ? JSON.parse(casino.features) : []; }
        catch { casino.parsedFeatures = casino.features ? casino.features.split(',').map(f => f.trim()).filter(Boolean) : []; }
      }

      // Get geo statuses from geo_rules
      if (results.casinos.length > 0 && detectedCountry) {
        const slugs = results.casinos.map(c => c.slug).filter(Boolean);
        if (slugs.length > 0) {
          const placeholders = slugs.map(() => '?').join(',');
          const geoR = await db.prepare(`
            SELECT casino_slug, country_code, status, priority
            FROM geo_rules WHERE casino_slug IN (${placeholders}) ORDER BY priority DESC
          `).bind(...slugs).all();
          const rulesByCasino = {};
          for (const row of (geoR.results || [])) {
            if (!rulesByCasino[row.casino_slug]) rulesByCasino[row.casino_slug] = [];
            rulesByCasino[row.casino_slug].push(row);
          }
          for (const casino of results.casinos) {
            if (!results.geoStatuses[casino.slug]) {
              results.geoStatuses[casino.slug] = evaluateGeoStatus(rulesByCasino[casino.slug] || [], detectedCountry, casino);
            }
          }
        }
      }

      // Get casino categories
      if (results.casinos.length > 0) {
        for (const casino of results.casinos) {
          try {
            const catR = await db.prepare(`
              SELECT c.slug, c.name FROM categories c
              JOIN casino_categories cc ON cc.category_id = c.id
              JOIN casinos cas ON cas.id = cc.casino_id WHERE cas.slug = ?
            `).bind(casino.slug).all();
            if (catR.results && catR.results.length > 0) results.casinoCategories[casino.slug] = catR.results;
          } catch {}
        }
      }
    } catch (e) { console.error('Lummet retrieve casinos:', e.message); }
  }

    // ═══════════════════════════════════════════════════
  // REVIEWS
  // ═══════════════════════════════════════════════════
  if (shouldSearchTable('reviews', tablesToSearch, intent, ['casino_review','casino_compare','general'])) {
    try {
      if (isListing && intent === 'casino_review') {
        const r = await db.prepare(`
          SELECT slug, title, casino_slug, country_code, rating, overview,
                 pros, cons, verdict, author, author_title
          FROM reviews WHERE published = 1 ORDER BY created_at DESC LIMIT 20
        `).all();
        results.reviews = (r.results || []).map(rv => ({ ...rv, overview: truncate(rv.overview, 300), verdict: truncate(rv.verdict, 200) }));
      } else if (allSearchTerms.length > 0) {
        const conditions = allSearchTerms.map(() =>
          'LOWER(title) LIKE ? OR LOWER(casino_slug) LIKE ? OR LOWER(overview) LIKE ?'
        ).join(' OR ');
        const params = [];
        for (const term of allSearchTerms) params.push(`%${term}%`, `%${term}%`, `%${term}%`);
        const r = await db.prepare(`
          SELECT slug, title, casino_slug, country_code, rating, overview, pros, cons,
                 verdict, author, author_title, games, bonuses, payments, licenses
          FROM reviews WHERE published = 1 AND (${conditions}) LIMIT ${MAX_RESULTS}
        `).bind(...params).all();
        results.reviews = (r.results || []).map(rv => ({
          ...rv, overview: truncate(rv.overview, 300), games: truncate(rv.games, 200),
          bonuses: truncate(rv.bonuses, 200), payments: truncate(rv.payments, 200),
          licenses: truncate(rv.licenses, 200), verdict: truncate(rv.verdict, 200)
        }));
      }

      // Get review blocks
      if (results.reviews.length > 0 && (intent === 'casino_review' || intent === 'casino_compare')) {
        const reviewSlugs = results.reviews.map(r => r.slug).filter(Boolean);
        if (reviewSlugs.length > 0) {
          const placeholders = reviewSlugs.map(() => '?').join(',');
          const blocksR = await db.prepare(`
            SELECT review_slug, title, content, position FROM review_blocks
            WHERE review_slug IN (${placeholders}) ORDER BY position ASC
          `).bind(...reviewSlugs).all();
          results.reviewBlocks = (blocksR.results || []).map(b => ({ ...b, content: truncate(b.content, 300) }));
        }
      }

      // Parse faq_json
      for (const review of results.reviews) {
        try {
          const faqRow = await db.prepare(`SELECT faq_json FROM reviews WHERE slug = ?`).bind(review.slug).first();
          if (faqRow?.faq_json) review.faqs = JSON.parse(faqRow.faq_json);
        } catch {}
      }
    } catch (e) { console.error('Lummet retrieve reviews:', e.message); }
  }

  // ═══════════════════════════════════════════════════
  // NEWS
  // ═══════════════════════════════════════════════════
  if (shouldSearchTable('news', tablesToSearch, intent, ['news','general'])) {
    try {
      if (intent === 'news' || text.includes('news') || text.includes('latest')) {
        const r = await db.prepare(`
          SELECT slug, title, excerpt, tags, author, published_at FROM news
          WHERE published = 1 ORDER BY published_at DESC, created_at DESC LIMIT ${MAX_RESULTS}
        `).all();
        results.news = (r.results || []).map(n => ({ ...n, excerpt: truncate(n.excerpt, 200) }));
      } else if (allSearchTerms.length > 0) {
        const conditions = allSearchTerms.map(() => 'LOWER(title) LIKE ? OR LOWER(excerpt) LIKE ? OR LOWER(tags) LIKE ?').join(' OR ');
        const params = [];
        for (const term of allSearchTerms) params.push(`%${term}%`, `%${term}%`, `%${term}%`);
        const r = await db.prepare(`
          SELECT slug, title, excerpt, tags, author, published_at FROM news
          WHERE published = 1 AND (${conditions}) ORDER BY published_at DESC LIMIT ${MAX_RESULTS}
        `).bind(...params).all();
        results.news = (r.results || []).map(n => ({ ...n, excerpt: truncate(n.excerpt, 200) }));
      }
    } catch (e) { console.error('Lummet retrieve news:', e.message); }
  }

  // ═══════════════════════════════════════════════════
// PLATFORM UPDATES
// ═══════════════════════════════════════════════════
if (
  shouldSearchTable(
    'platform_updates',
    tablesToSearch,
    intent,
    ['platform_update', 'updates', 'general']
  )
) {
  try {
    if (
      intent === 'platform_update' ||
      intent === 'updates' ||
      text.includes('platform update') ||
      text.includes('platform updates') ||
      text.includes('site update') ||
      text.includes('what changed') ||
      text.includes('recent changes') ||
      text.includes('new feature')
    ) {
      const r = await db.prepare(`
        SELECT
          pu.slug,
          pu.title,
          pu.excerpt,
          pu.content,
          pu.featured_image,
          pu.seo_title,
          pu.seo_description,
          pu.published_at,
          pu.updated_at,
          a.name AS author_name,
          a.slug AS author_slug,
          a.role AS author_role
        FROM platform_updates pu
        LEFT JOIN authors a
          ON pu.author_id = a.id
        WHERE pu.published = 1
        ORDER BY
          COALESCE(pu.published_at, pu.created_at) DESC
        LIMIT ${MAX_RESULTS}
      `).all();

      results.platformUpdates = (r.results || []).map(u => ({
        ...u,
        excerpt: truncate(u.excerpt, 300),
        content: truncate(u.content, 700)
      }));
    } else if (allSearchTerms.length > 0) {
      const conditions = allSearchTerms
        .map(() =>
          `LOWER(title) LIKE ?
           OR LOWER(slug) LIKE ?
           OR LOWER(excerpt) LIKE ?
           OR LOWER(content) LIKE ?`
        )
        .join(' OR ');

      const params = [];

      for (const term of allSearchTerms) {
        params.push(
          `%${term}%`,
          `%${term}%`,
          `%${term}%`,
          `%${term}%`
        );
      }

      const r = await db.prepare(`
        SELECT
          pu.slug,
          pu.title,
          pu.excerpt,
          pu.content,
          pu.featured_image,
          pu.seo_title,
          pu.seo_description,
          pu.published_at,
          pu.updated_at,
          a.name AS author_name,
          a.slug AS author_slug,
          a.role AS author_role
        FROM platform_updates pu
        LEFT JOIN authors a
          ON pu.author_id = a.id
        WHERE pu.published = 1
          AND (${conditions})
        ORDER BY
          COALESCE(pu.published_at, pu.created_at) DESC
        LIMIT ${MAX_RESULTS}
      `).bind(...params).all();

      results.platformUpdates = (r.results || []).map(u => ({
        ...u,
        excerpt: truncate(u.excerpt, 300),
        content: truncate(u.content, 700)
      }));
    }
  } catch (e) {
    console.error(
      'Lummet retrieve platform updates:',
      e.message
    );
  }
}

  // ═══════════════════════════════════════════════════
  // PAGES
  // ═══════════════════════════════════════════════════
  if (shouldSearchTable('pages', tablesToSearch, intent, ['general','educational','responsible_gambling','navigation'])) {
    try {
      if (allSearchTerms.length > 0) {
        const conditions = allSearchTerms.map(() => 'LOWER(title) LIKE ? OR LOWER(slug) LIKE ?').join(' OR ');
        const params = [];
        for (const term of allSearchTerms) params.push(`%${term}%`, `%${term}%`);
        const r = await db.prepare(`
          SELECT slug, title, type FROM pages WHERE published = 1 AND (${conditions}) LIMIT ${MAX_RESULTS}
        `).bind(...params).all();
        results.pages = r.results || [];
      } else if (intent === 'navigation') {
        const r = await db.prepare(`
          SELECT slug, title, type FROM pages WHERE published = 1
          AND slug IN ('about','about-us','contact','responsible-gambling','terms','privacy','faq') LIMIT 10
        `).all();
        results.pages = r.results || [];
      }
    } catch (e) { console.error('Lummet retrieve pages:', e.message); }
  }

  // ═══════════════════════════════════════════════════
  // FAQs
  // ═══════════════════════════════════════════════════
  if (shouldSearchTable('faqs', tablesToSearch, intent, ['faq','general','educational','responsible_gambling'])) {
    try {
      if (allSearchTerms.length > 0) {
        const conditions = allSearchTerms.map(() => 'LOWER(question) LIKE ? OR LOWER(answer) LIKE ?').join(' OR ');
        const params = [];
        for (const term of allSearchTerms) params.push(`%${term}%`, `%${term}%`);
        const r = await db.prepare(`
          SELECT slug, question, answer FROM faqs WHERE is_active = 1 AND (${conditions}) LIMIT ${MAX_RESULTS}
        `).bind(...params).all();
        results.faqs = r.results || [];
      } else if (intent === 'faq') {
        const r = await db.prepare(`SELECT slug, question, answer FROM faqs WHERE is_active = 1 ORDER BY created_at DESC LIMIT ${MAX_RESULTS}`).all();
        results.faqs = r.results || [];
      }
    } catch (e) { console.error('Lummet retrieve faqs:', e.message); }
  }

  // ═══════════════════════════════════════════════════
  // AUTHORS
  // ═══════════════════════════════════════════════════
  if (shouldSearchTable('authors', tablesToSearch, intent, ['authors','general'])) {
    try {
      if (allSearchTerms.length > 0) {
        const conditions = allSearchTerms.map(() => 'LOWER(name) LIKE ? OR LOWER(bio) LIKE ?').join(' OR ');
        const params = [];
        for (const term of allSearchTerms) params.push(`%${term}%`, `%${term}%`);
        const r = await db.prepare(`
          SELECT slug, name, bio, role FROM authors WHERE published = 1 AND (${conditions}) LIMIT ${MAX_RESULTS}
        `).bind(...params).all();
        results.authors = (r.results || []).map(a => ({ ...a, bio: truncate(a.bio, 200) }));
      }
    } catch (e) { console.error('Lummet retrieve authors:', e.message); }
  }

  // ═══════════════════════════════════════════════════
  // COUNTRIES
  // ═══════════════════════════════════════════════════
  if (shouldSearchTable('countries', tablesToSearch, intent, ['geo','general']) && detectedCountry) {
    try {
      const r = await db.prepare(`SELECT code, name, currency, language, legal_status FROM countries WHERE code = ? LIMIT 1`).bind(detectedCountry.toUpperCase()).first();
      if (r) results.countries = [r];
    } catch (e) { console.error('Lummet retrieve countries:', e.message); }
  }

  // ═══════════════════════════════════════════════════
  // CATEGORIES
  // ═══════════════════════════════════════════════════
  if (shouldSearchTable('categories', tablesToSearch, intent, ['casino_search','general']) && allSearchTerms.length > 0) {
    try {
      const conditions = allSearchTerms.map(() => 'LOWER(name) LIKE ? OR LOWER(description) LIKE ?').join(' OR ');
      const params = [];
      for (const term of allSearchTerms) params.push(`%${term}%`, `%${term}%`);
      const r = await db.prepare(`SELECT slug, name, description FROM categories WHERE (${conditions}) LIMIT ${MAX_RESULTS}`).bind(...params).all();
      results.categories = r.results || [];
    } catch (e) { console.error('Lummet retrieve categories:', e.message); }
  }

  // ═══════════════════════════════════════════════════
  // SEO META
  // ═══════════════════════════════════════════════════
  if (shouldSearchTable('seo_meta', tablesToSearch, intent, ['general','navigation']) && allSearchTerms.length > 0) {
    try {
      const conditions = allSearchTerms.map(() => 'LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(keywords) LIKE ?').join(' OR ');
      const params = [];
      for (const term of allSearchTerms) params.push(`%${term}%`, `%${term}%`, `%${term}%`);
      const r = await db.prepare(`SELECT page_type, page_slug, title, description FROM seo_meta WHERE (${conditions}) LIMIT ${MAX_RESULTS}`).bind(...params).all();
      results.seoMeta = r.results || [];
    } catch (e) { console.error('Lummet retrieve seo_meta:', e.message); }
  }

  return results;
}

// ── Helper functions ──

function shouldSearchTable(tableName, tablesFromPlan, intent, relevantIntents) {
  if (tablesFromPlan && tablesFromPlan.length > 0) return tablesFromPlan.includes(tableName);
  return relevantIntents.includes(intent) || intent === 'general';
}

function evaluateGeoStatus(rules, country, casino) {
  if (!rules || rules.length === 0) return evaluateGeoFromColumns(casino, country);
  const countryRule = rules.find(r => r.country_code === country.toUpperCase());
  if (countryRule) return countryRule.status;
  const hasAllowed = rules.some(r => r.status === 'allowed');
  const hasBlocked = rules.some(r => r.status === 'blocked');
  if (hasAllowed && !hasBlocked) return 'blocked';
  if (hasBlocked && !hasAllowed) return 'allowed';
  return evaluateGeoFromColumns(casino, country);
}

function evaluateGeoFromColumns(casino, country) {
  if (!casino || !country) return 'unknown';
  const code = country.toUpperCase();
  const codeLower = country.toLowerCase();
  if (casino.restricted_countries) {
    const restricted = casino.restricted_countries.toLowerCase();
    if (restricted.includes(codeLower) || restricted.includes(code)) return 'blocked';
  }
  if (casino.supported_countries) {
    const supported = casino.supported_countries.toLowerCase();
    if (supported === '' || supported === '[]' || supported === 'null') return 'unknown';
    if (supported.includes(codeLower) || supported.includes(code)) return 'allowed';
    if (supported.length > 2) return 'blocked';
  }
  return 'unknown';
}

function extractSearchTerms(message) {
  const text = message.toLowerCase().trim();
  const stopWords = ['what','which','how','why','when','where','who','is','are','was','were','be','do','does','can','could','should','would','will','the','a','an','this','that','about','tell','show','give','list','find','me','us','please','help','want','need','know','casino','casinos','review','reviews','page','pages','my','your','in','on','at','to','for','of','with','from','by','and','or','but','country','countries'];
  const words = text.split(/[^a-z0-9.]+/i).filter(w => w.length > 1);
  return words.filter(w => !stopWords.includes(w));
}

function extractCountryFromMessage(message) {
  const text = message.toLowerCase();
  for (const [name, code] of Object.entries(COUNTRY_NAME_TO_CODE)) {
    if (text.includes(name)) return code;
  }
  const codePattern = /\b(US|CA|GB|DE|FR|IT|ES|NL|AU|NZ|JP|CN|IN|BR|MX|ZA|NG|KE|EG|SE|NO|DK|FI|PL|PT|GR|TR|RU|UA|AE|SA|QA|KR|TH|VN|PH|ID|MY|SG|AR|CL|CO|PE|AT|CH|IE|BE|CZ|HU|RO|BG|HR|MT|CY|LU|IS|RW)\b/;
  const match = message.match(codePattern);
  return match ? match[1] : null;
}

function isListingText(text) {
  return text.includes('list') || text.includes('all casinos') || text.includes('available casinos') || text.includes('top casinos') || text.includes('best casinos') || text.includes('show me') || text.includes('what casinos') || text.includes('which casinos') || text.includes('casinos are available') || text.includes('casinos do you have');
}

function isGeoText(text) {
  return text.includes('available in') || text.includes('can i play') || text.includes('my country') || text.includes('restricted in') || text.includes('allowed in') || (text.includes('which casinos') && text.includes('country'));
}

/**
 * Build context string from retrieved results for the LLM prompt
 */
export function buildContextString(results, country) {
  const parts = [];

  if (results.casinos && results.casinos.length > 0) {
    parts.push('=== CASINOS ===');
    for (const c of results.casinos) {
      const geo = results.geoStatuses[c.slug] || 'unknown';
      const geoLabel = geo === 'allowed' ? 'Available' : geo === 'blocked' ? 'Not available' : 'Unknown';
      let line = `Name: ${c.name} | Slug: ${c.slug} | Rating: ${c.rating || 'N/A'}/5`;
      if (c.bonus_title) line += ` | Bonus: ${c.bonus_title}`;
      if (c.bonus_value) line += ` (${c.bonus_value})`;
      if (c.license) line += ` | License: ${c.license}`;
      if (c.owner) line += ` | Owner: ${c.owner}`;
      line += ` | ${geoLabel} in ${country || 'user country'}`;
      line += ` | Link: ${site.url(`/en/casino/${c.slug}`)}`;
      if (c.parsedFeatures && c.parsedFeatures.length > 0) line += ` | Features: ${c.parsedFeatures.join(', ')}`;
      if (results.casinoCategories && results.casinoCategories[c.slug]) line += ` | Categories: ${results.casinoCategories[c.slug].map(cat => cat.name).join(', ')}`;
      parts.push(line);
    }
  }

  if (results.reviews && results.reviews.length > 0) {
    parts.push('\n=== REVIEWS ===');
    for (const r of results.reviews) {
      let line = `Title: ${r.title} | Rating: ${r.rating || 'N/A'}/5 | Casino: ${r.casino_slug || 'N/A'}`;
      if (r.overview) line += ` | Overview: ${r.overview}`;
      if (r.pros) line += ` | Pros: ${r.pros}`;
      if (r.cons) line += ` | Cons: ${r.cons}`;
      if (r.verdict) line += ` | Verdict: ${r.verdict}`;
      if (r.author) line += ` | Author: ${r.author}`;
      if (r.games) line += ` | Games: ${r.games}`;
      if (r.bonuses) line += ` | Bonuses: ${r.bonuses}`;
      if (r.payments) line += ` | Payments: ${r.payments}`;
      if (r.licenses) line += ` | Licenses: ${r.licenses}`;
      line += ` | Link: ${site.url(`/en/review/${r.slug}`)}`;
      if (r.faqs && r.faqs.length > 0) line += ` | FAQ: ${r.faqs.map(f => `Q:${f.q || f.question} A:${f.a || f.answer}`).join('; ')}`;
      parts.push(line);
    }
  }

  if (results.reviewBlocks && results.reviewBlocks.length > 0) {
    parts.push('\n=== REVIEW DETAILS ===');
    for (const b of results.reviewBlocks) parts.push(`[${b.review_slug}] ${b.title}: ${b.content}`);
  }

  if (results.news && results.news.length > 0) {
    parts.push('\n=== NEWS ===');
    for (const n of results.news) {
      let line = `Title: ${n.title}`;
      if (n.excerpt) line += ` | Excerpt: ${n.excerpt}`;
      if (n.author) line += ` | Author: ${n.author}`;
      if (n.published_at) line += ` | Date: ${n.published_at}`;
      line += ` | Link: ${site.url(`/en/news/${n.slug}`)}`;
      parts.push(line);
    }
  }

    if (
    results.platformUpdates &&
    results.platformUpdates.length > 0
  ) {
    parts.push('\n=== PLATFORM UPDATES ===');

    for (const u of results.platformUpdates) {
      let line = `Title: ${u.title}`;

      if (u.excerpt) {
        line += ` | Summary: ${u.excerpt}`;
      }

      if (u.content) {
        line += ` | Content: ${u.content}`;
      }

      if (u.author_name) {
        line += ` | Author: ${u.author_name}`;
      }

      if (u.author_role) {
        line += ` | Author Role: ${u.author_role}`;
      }

      if (u.published_at) {
        line += ` | Published: ${u.published_at}`;
      }

      if (u.updated_at) {
        line += ` | Updated: ${u.updated_at}`;
      }

      line += ` | Link: ${site.url(`/en/updates/${u.slug}`)}`;

      parts.push(line);
    }
  }

  if (results.pages && results.pages.length > 0) {
    parts.push('\n=== PAGES ===');
    for (const p of results.pages) parts.push(`Title: ${p.title} | Type: ${p.type || 'page'} | Link: ${site.url(`/en/${p.slug}`)}`);
  }

  if (results.faqs && results.faqs.length > 0) {
    parts.push('\n=== FAQs ===');
    for (const f of results.faqs) parts.push(`Q: ${f.question} | A: ${f.answer}`);
  }

  if (results.authors && results.authors.length > 0) {
    parts.push('\n=== AUTHORS ===');
    for (const a of results.authors) parts.push(`Name: ${a.name} | Role: ${a.role || 'Editor'} | Bio: ${a.bio || ''} | Profile: ${site.url(`/en/authors/${a.slug}`)}`);
  }

  if (results.countries && results.countries.length > 0) {
    parts.push('\n=== COUNTRY INFO ===');
    for (const c of results.countries) parts.push(`Country: ${c.name} (${c.code}) | Currency: ${c.currency || 'N/A'} | Language: ${c.language || 'N/A'} | Legal Status: ${c.legal_status || 'N/A'}`);
  }

  if (results.categories && results.categories.length > 0) {
    parts.push('\n=== CATEGORIES ===');
    for (const c of results.categories) parts.push(`Category: ${c.name} | Link: ${site.url(`/en/category/${c.slug}`)}`);
  }

  if (results.seoMeta && results.seoMeta.length > 0) {
    parts.push('\n=== SITE INFO ===');
    for (const s of results.seoMeta) parts.push(`Page: ${s.title} | Type: ${s.page_type} | Slug: ${s.page_slug} | Description: ${s.description || ''}`);
  }

  return parts.length > 0 ? parts.join('\n') : 'No relevant information found in the Level.casino database.';
}

