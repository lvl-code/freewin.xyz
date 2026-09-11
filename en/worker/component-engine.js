// =====================================================
// GLOBAL COMPONENT ENGINE
// Loads, parses, and renders database-driven components
// =====================================================

import { getPageComponents } from "./database/components.js";
import { getReviewBlocks } from "./database/review_blocks.js";
import { getSeoMeta } from "./database/seo_meta.js";
import { logEvent as logAnalyticsEvent } from "./database/analytics.js";

/**
 * Load all components assigned to a page, in position order.
 * Returns an array of parsed component objects ready for rendering.
 */
export async function loadPageComponents(db, pageType, pageSlug, injectionPoint = null) {
  const rows = await getPageComponents(db, pageType, pageSlug, injectionPoint);
  const components = [];

  for (const row of rows) {
    const component = {
      id: row.id,
      type: row.type,
      name: row.name,
      title: row.title || "",
      content: row.content || "",
      settings: {},
      position: row.position,
      injection_point: row.injection_point || "content_bottom"
    };

    if (row.content) {
      if (row.type === "faq_group" || row.type === "casino_grid" || row.type === "comparison_table") {
        try { component.content = JSON.parse(row.content); } catch { component.content = []; }
      }
    }

    if (row.settings_json) {
      try { component.settings = JSON.parse(row.settings_json); } catch { component.settings = {}; }
    }

    components.push(component);
  }

  return components;
}


/**
 * Render a single component into HTML using its template.
 * The renderer instance is passed in to reuse template loading.
 */
export async function renderComponent(renderer, component) {
  const templateName = `components/${component.type}.html`;
  let template;
  try {
    template = await renderer.loadTemplate(templateName);
  } catch {
    template = null;
  }
  if (!template) {
    return renderFallback(component);
  }
  // Prepare data for template variable replacement
  const data = {
    title: component.title || "",
    content: typeof component.content === "string" ? component.content : "",
    name: component.name || "",
    ...component.settings
  };

  // For faq_group, build FAQ items HTML
  if (component.type === "faq_group" && Array.isArray(component.content)) {
    data.faq_items = component.content.map((f, i) => `
      <div class="faq-item">
        <button class="faq-question" onclick="this.parentElement.classList.toggle('active')">${f.q || f.question || ""}</button>
        <div class="faq-answer"><p>${f.a || f.answer || ""}</p></div>
      </div>
    `).join("");
    data.faq_jsonld = JSON.stringify(component.content.map(f => ({
      "@type": "Question",
      "name": f.q || f.question || "",
      "acceptedAnswer": { "@type": "Answer", "text": f.a || f.answer || "" }
    })));
  }

  // For author, parse content JSON
  if (component.type === "author" && typeof component.content === "string") {
    try {
      const author = JSON.parse(component.content);
      Object.assign(data, author);
    } catch {}
  }

  return renderer.replaceVariables(template, data);
}

/**
 * Render all components for a page into a single HTML string.
 */

export async function renderPageComponents(renderer, db, pageType, pageSlug, injectionPoint = null, ctx = null) {
  const components = await loadPageComponents(db, pageType, pageSlug, injectionPoint);
  const htmlParts = [];
  const bannerComponents = [];

  for (const component of components) {
    const html = await renderComponent(renderer, component);
    htmlParts.push(html);
    if (component.type === "banner") bannerComponents.push(component);
  }

  logBannerViews(db, ctx, bannerComponents, pageType, pageSlug);

  return htmlParts.join("\n");
}

/**
 * Fires BANNER_VIEW analytics for every banner component actually
 * rendered on this page, as ONE batched ctx.waitUntil (a single
 * Promise.all covering every banner on the page), not one waitUntil
 * registration per banner -- keeps the per-render overhead to exactly
 * one deferred task regardless of how many banners a page has.
 *
 * No casino_id/review_id/etc. FK is set here -- this function only
 * knows pageType/pageSlug (a generic page-components association, not
 * a resolved dimension row), and resolving pageSlug -> a numeric
 * casino/review/news/page id would mean an extra DB lookup purely for
 * logging. pageType+pageSlug is stored in metadata instead -- still
 * real, queryable data (which banner, on which page), just not joined
 * to a dimension table the way casino/review/news/page views are.
 */
function logBannerViews(db, ctx, bannerComponents, pageType, pageSlug) {
  if (!bannerComponents.length || !ctx || typeof ctx.waitUntil !== "function") return;

  ctx.waitUntil(
    Promise.all(
      bannerComponents.map(component =>
        logAnalyticsEvent(db, {
          eventType: "BANNER_VIEW",
          metadata: { componentId: component.id, componentName: component.name, pageType, pageSlug }
        }).catch(() => {})
      )
    )
  );
}
export async function renderAllInjectionPoints(renderer, db, pageType, pageSlug, ctx = null) {
  // Single query for all injection points
  const result = await db.prepare(`
    SELECT pc.*, c.name, c.slug, c.type, c.title, c.content, c.settings_json, c.status
    FROM page_components pc
    JOIN components c ON c.id = pc.component_id
    WHERE pc.page_type = ? AND pc.enabled = 1
    AND (pc.page_slug = ? OR pc.page_slug = '*')
    ORDER BY pc.injection_point, pc.position ASC
  `).bind(pageType, pageSlug).all();

  const grouped = { top: [], content_top: [], content_bottom: [], bottom: [], sidebar: [] };
  for (const row of result.results || []) {
    const point = row.injection_point || "content_bottom";
    if (grouped[point]) grouped[point].push(row);
  }

  const rendered = {};
  const bannerComponents = [];
  for (const point of Object.keys(grouped)) {
    const htmlParts = [];
    for (const row of grouped[point]) {
      const component = {
        id: row.id,
        type: row.type,
        name: row.name,
        title: row.title || "",
        content: row.content || "",
        settings: {},
        position: row.position,
        injection_point: point
      };

      if (row.content) {
        if (row.type === "faq_group" || row.type === "casino_grid" || row.type === "comparison_table") {
          try { component.content = JSON.parse(row.content); } catch { component.content = []; }
        }
      }
      if (row.settings_json) {
        try { component.settings = JSON.parse(row.settings_json); } catch { component.settings = {}; }
      }

      const html = await renderComponent(renderer, component);
      htmlParts.push(html);
      if (component.type === "banner") bannerComponents.push(component);
    }
    rendered[point] = htmlParts.join("\n");
  }

  logBannerViews(db, ctx, bannerComponents, pageType, pageSlug);

  return rendered;
}


export async function renderAllInjectionPointsbackup(renderer, db, pageType, pageSlug) {
  const points = ["top", "content_top", "content_bottom", "bottom", "sidebar"];
  const result = {};

  for (const point of points) {
    result[point] = await renderPageComponents(renderer, db, pageType, pageSlug, point);
  }

  return result;
}
/**
 * Load review blocks for a review and render them.
 */
export async function loadReviewBlocks(db, reviewSlug) {
  return await getReviewBlocks(db, reviewSlug);
}

export async function renderReviewBlocks(renderer, db, reviewSlug) {
  const blocks = await loadReviewBlocks(db, reviewSlug);
  if (blocks.length === 0) return "";

  const template = await renderer.loadTemplate("components/review-block.html");
  if (!template) return "";

  const htmlParts = blocks.map(block => {
    const data = {
      block_id: `block-${block.id}`,
      block_title: block.title,
      block_content: block.content
    };
    return renderer.replaceVariables(template, data);
  });

  return htmlParts.join("\n");
}


/**
 * Load SEO meta for a page. Falls back to null if not found.
 */
export async function loadSeoMeta(db, pageType, pageSlug) {
  return await getSeoMeta(db, pageType, pageSlug);
}

/**
 * Fallback renderer for component types without a template.
 */
function renderFallback(component) {
  if (component.type === "text" || component.type === "html") {
    return `<section class="component-text"><h2>${component.title || ""}</h2><div>${component.content || ""}</div></section>`;
  }
  if (component.type === "cta") {
    let settings = {};
    try { settings = JSON.parse(component.settings_json || "{}"); } catch {}
    return `<section class="component-cta"><h2>${component.title || ""}</h2><div>${component.content || ""}</div><a href="${settings.link || "#"}" class="btn btn--primary">${settings.button_text || "Learn More"}</a></section>`;
  }
  return `<section class="component-${component.type}"><h2>${component.title || component.name || ""}</h2><div>${typeof component.content === "string" ? component.content : ""}</div></section>`;
}
