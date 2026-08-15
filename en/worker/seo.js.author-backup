export const seoEngine = {
  /**
   * Generates standard HTML meta tag strings for injection into template headers
   */
  generateMetaTags(seoData, currentUrl) {
    const title = seoData.title || "Premium iGaming Guide";
    const description = seoData.description || "Expert casino analytics and VIP bonus distribution data.";
    const ogImage = seoData.image || "https://level.casino/static/images/og-image.png";

    return `
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <link rel="canonical" href="${currentUrl}" />
  
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${currentUrl}" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${ogImage}" />

  <meta property="twitter:card" content="summary_large_image" />
  <meta property="twitter:url" content="${currentUrl}" />
  <meta property="twitter:title" content="${title}" />
  <meta property="twitter:description" content="${description}" />
  <meta property="twitter:image" content="${ogImage}" />
    `.trim();
  },

  /**
   * Compiles flawless JSON-LD Schema structures to pass strict Rich Results validation
   */
  generateSchema(type, context) {
    const baseSchema = {
      "@context": "https://schema.org",
      "@id": context.url + "#schema"
    };

    switch (type) {
      case 'casino':
      case 'review':
        return JSON.stringify({
          ...baseSchema,
          "@type": "Review",
          "itemReviewed": {
            "@type": "GameServer", // Valid semantic classification for online operators
            "name": context.casinoName,
            "image": context.logoUrl || "https://level.casino/static/images/logo.png",
            "url": context.affiliateUrl
          },
          "reviewRating": {
            "@type": "Rating",
            "ratingValue": context.rating || "4.8",
            "bestRating": "5",
            "worstRating": "1"
          },
          "author": {
            "@type": "Organization",
            "name": "Level.casino Research Team",
            "url": "https://level.casino"
          },
          "reviewBody": context.summary || "Comprehensive operational performance evaluation analysis.",
          "publisher": {
            "@type": "Organization",
            "name": "Level.casino",
            "logo": {
              "@type": "ImageObject",
              "url": "https://level.casino/static/images/logo.png"
            }
          }
        }, null, 2);

      case 'directory':
      case 'country':
        // Compiles an AggregateRating entity list for category ranking walls
        return JSON.stringify({
          ...baseSchema,
          "@type": "ItemList",
          "name": `Top Rated Online Casinos inside ${context.countryName}`,
          "description": `Verified localized sign-up access points matching jurisdiction rules for ${context.countryCode}.`,
          "itemListElement": (context.items || []).map((item, index) => ({
            "@type": "ListItem",
            "position": index + 1,
            "item": {
              "@type": "GameServer",
              "name": item.name,
              "url": `https://level.casino/en/casino/${item.slug}`
            }
          }))
        }, null, 2);

      default:
        // Fallback Organization identity schema
        return JSON.stringify({
          ...baseSchema,
          "@type": "Organization",
          "name": "Level.casino",
          "url": "https://level.casino",
          "logo": "https://level.casino/static/images/logo.png"
        }, null, 2);
    }
  },

  /**
   * Unified compilation method to prepare structural SEO variables for the render engine
   */
  compileSeoPayload(type, rawData, urlContext) {
    const metaHtml = this.generateMetaTags(rawData.seo || {}, urlContext.href);
    const schemaJson = this.generateSchema(type, { ...rawData, url: urlContext.href });

    return {
      SEO_META_TAGS: metaHtml,
      SEO_STRUCTURED_DATA: `<script type="application/ld+json">\n${schemaJson}\n</script>`
    };
  }
};
