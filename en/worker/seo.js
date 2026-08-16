import { getSiteContext } from "./site-context.js";

export const seoEngine = {
  /**
   * Generates standard HTML meta tags.
   *
   * Site identity is always resolved from the current request/site context.
   */
  async generateMetaTags(seoData = {}, currentUrl, request, env) {
    const site = await getSiteContext(request, env);

    const title =
      seoData.title ||
      `${site.siteName} — Expert Casino Reviews`;

    const description =
      seoData.description ||
      site.description ||
      "Expert casino reviews, rankings and iGaming insights.";

    const ogImage =
      seoData.image ||
      site.ogImageUrl ||
      site.logoUrl;

    return `
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${escapeHtml(currentUrl || site.origin)}" />

<meta property="og:type" content="website" />
<meta property="og:url" content="${escapeHtml(currentUrl || site.origin)}" />
<meta property="og:site_name" content="${escapeHtml(site.siteName)}" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:image" content="${escapeHtml(ogImage)}" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:url" content="${escapeHtml(currentUrl || site.origin)}" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${escapeHtml(ogImage)}" />
`.trim();
  },

  /**
   * Generates JSON-LD schema using the current tenant/site context.
   */
  async generateSchema(type, context = {}, request, env) {
    const site = await getSiteContext(request, env);

    const baseSchema = {
      "@context": "https://schema.org",
      "@id": `${context.url || site.origin}#schema`
    };

    switch (type) {
      case "casino":
      case "review":
        return {
          ...baseSchema,
          "@type": "Review",

          itemReviewed: {
            "@type": "GameServer",
            name: context.casinoName || context.name || "",
            image: context.logoUrl || site.logoUrl,
            url: context.affiliateUrl || site.origin
          },

          reviewRating: {
            "@type": "Rating",
            ratingValue: context.rating || "4.8",
            bestRating: "5",
            worstRating: "1"
          },

          author: {
            "@type": "Organization",
            name: site.siteName,
            url: site.origin
          },

          reviewBody:
            context.summary ||
            "Comprehensive operational performance evaluation analysis.",

          publisher: {
            "@type": "Organization",
            name: site.siteName,
            logo: {
              "@type": "ImageObject",
              url: site.logoUrl
            }
          }
        };

      case "directory":
      case "country":
        return {
          ...baseSchema,
          "@type": "ItemList",

          name:
            context.countryName
              ? `Top Rated Online Casinos in ${context.countryName}`
              : `Top Rated Online Casinos — ${site.siteName}`,

          description:
            context.countryCode
              ? `Verified localized casino listings for ${context.countryCode}.`
              : `Verified casino listings from ${site.siteName}.`,

          itemListElement: (context.items || []).map((item, index) => ({
            "@type": "ListItem",
            position: index + 1,
            item: {
              "@type": "GameServer",
              name: item.name,
              url: site.url(`/en/casino/${item.slug}`)
            }
          }))
        };

      default:
        return {
          ...baseSchema,
          "@type": "Organization",
          name: site.siteName,
          url: site.origin,
          logo: site.logoUrl
        };
    }
  },

  /**
   * Unified SEO payload compiler.
   *
   * Kept reusable for future callers, but does not replace the
   * existing Renderer.buildSEO() pipeline.
   */
  async compileSeoPayload(
    type,
    rawData = {},
    urlContext = {},
    request,
    env
  ) {
    const currentUrl =
      urlContext.href ||
      urlContext.url ||
      "";

    const metaHtml = await this.generateMetaTags(
      rawData.seo || {},
      currentUrl,
      request,
      env
    );

    const schema = await this.generateSchema(
      type,
      {
        ...rawData,
        url: currentUrl
      },
      request,
      env
    );

    return {
      SEO_META_TAGS: metaHtml,

      SEO_STRUCTURED_DATA:
        `<script type="application/ld+json">\n` +
        `${JSON.stringify(schema, null, 2)}\n` +
        `</script>`
    };
  }
};

/**
 * Small local HTML escaping helper.
 */
function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
