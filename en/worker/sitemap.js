import { getSiteContext } from "./site-context.js";

export const sitemapEngine = {

  async generateIndex(request, env, db) {
    const site = await getSiteContext(request, env);
    const currentDate = new Date().toISOString().split("T")[0];
    const subSitemaps = [
      { loc: "/en/sitemap.xml", lastmod: currentDate },
      { loc: "/en/sitemap-casinos.xml", lastmod: currentDate },
      { loc: "/en/sitemap-reviews.xml", lastmod: currentDate },
      { loc: "/en/sitemap-news.xml", lastmod: currentDate },
      { loc: "/en/sitemap-updates.xml", lastmod: currentDate },
      { loc: "/en/sitemap-categories.xml", lastmod: currentDate },
      { loc: "/en/sitemap-countries.xml", lastmod: currentDate },
      { loc: "/en/sitemap-pages.xml", lastmod: currentDate },
    ];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    for (const s of subSitemaps) {
      xml += `  <sitemap>\n    <loc>${site.url(s.loc)}</loc>\n    <lastmod>${s.lastmod}</lastmod>\n  </sitemap>\n`;
    }
    xml += `</sitemapindex>`;

    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "X-Robots-Tag": "index, follow",
        "Cache-Control": "public, max-age=3600",
      },
    });
  },

  async generate(request, env, db, type = "all") {
    if (!db) {
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>',
        { status: 500, headers: { "Content-Type": "application/xml; charset=utf-8" } }
      );
    }

    const site = await getSiteContext(request, env);
    const currentDate = new Date().toISOString().split("T")[0];
    let urls = [];

    // Static URLs (only in the "all" sitemap)
    if (type === "all") {
      urls.push({ loc: "/en/", lastmod: currentDate, changefreq: "daily", priority: "1.0" });
      urls.push({ loc: "/en/casino", lastmod: currentDate, changefreq: "daily", priority: "0.9" });
      urls.push({ loc: "/en/review", lastmod: currentDate, changefreq: "daily", priority: "0.8" });
      urls.push({ loc: "/en/news", lastmod: currentDate, changefreq: "daily", priority: "0.7" });
      urls.push({ loc: "/en/updates", lastmod: currentDate, changefreq: "daily", priority: "0.7" });
      urls.push({ loc: "/en/category", lastmod: currentDate, changefreq: "weekly", priority: "0.6" });
      urls.push({ loc: "/en/country", lastmod: currentDate, changefreq: "weekly", priority: "0.6" });
    }

    // Casinos
    if (type === "all" || type === "casinos") {
      try {
        const r = await db.prepare(
          `SELECT slug, updated_at FROM casinos WHERE published = 1 AND status = 'published' ORDER BY updated_at DESC LIMIT 50000`
        ).all();
        for (const item of r.results || []) {
          const lm = item.updated_at ? item.updated_at.split(" ")[0] : currentDate;
          urls.push({ loc: `/en/casino/${item.slug}`, lastmod: lm, changefreq: "weekly", priority: "0.8" });
        }
      } catch (e) { console.error("Sitemap casinos query failed:", e.message); }
    }

    // Reviews
    if (type === "all" || type === "reviews") {
      try {
        const r = await db.prepare(
          `SELECT slug, updated_at FROM reviews WHERE published = 1 ORDER BY updated_at DESC LIMIT 50000`
        ).all();
        for (const item of r.results || []) {
          const lm = item.updated_at ? item.updated_at.split(" ")[0] : currentDate;
          urls.push({ loc: `/en/review/${item.slug}`, lastmod: lm, changefreq: "weekly", priority: "0.7" });
        }
      } catch (e) { console.error("Sitemap reviews query failed:", e.message); }
    }

    // News
    if (type === "all" || type === "news") {
      try {
        const r = await db.prepare(
          `SELECT slug, updated_at FROM news WHERE published = 1 ORDER BY created_at DESC LIMIT 50000`
        ).all();
        for (const item of r.results || []) {
          const lm = item.updated_at ? item.updated_at.split(" ")[0] : currentDate;
          urls.push({ loc: `/en/news/${item.slug}`, lastmod: lm, changefreq: "weekly", priority: "0.6" });
        }
      } catch (e) { console.error("Sitemap news query failed:", e.message); }
    }

        // Platform Updates
    if (type === "all" || type === "updates") {
      try {
        const r = await db.prepare(
          `SELECT slug, updated_at FROM platform_updates
           WHERE published = 1
           ORDER BY COALESCE(published_at, created_at) DESC
           LIMIT 50000`
        ).all();

        for (const item of r.results || []) {
          const lm = item.updated_at
            ? item.updated_at.split(" ")[0]
            : currentDate;

          urls.push({
            loc: `/en/updates/${item.slug}`,
            lastmod: lm,
            changefreq: "weekly",
            priority: "0.6"
          });
        }
      } catch (e) {
        console.error(
          "Sitemap platform updates query failed:",
          e.message
        );
      }
    }

    // Categories
    if (type === "all" || type === "categories") {
      try {
        const r = await db.prepare(`SELECT slug FROM categories LIMIT 50000`).all();
        for (const item of r.results || []) {
          urls.push({ loc: `/en/category/${item.slug}`, lastmod: currentDate, changefreq: "weekly", priority: "0.6" });
        }
      } catch (e) { console.error("Sitemap categories query failed:", e.message); }
    }

    // Countries
    if (type === "all" || type === "countries") {
      try {
        const r = await db.prepare(`SELECT code FROM countries LIMIT 50000`).all();
        for (const item of r.results || []) {
          urls.push({ loc: `/en/country/${item.code}`, lastmod: currentDate, changefreq: "monthly", priority: "0.5" });
        }
      } catch (e) { console.error("Sitemap countries query failed:", e.message); }
    }

    // Pages
    if (type === "all" || type === "pages") {
      try {
        const r = await db.prepare(`SELECT slug FROM pages WHERE published = 1 LIMIT 50000`).all();
        for (const item of r.results || []) {
          urls.push({ loc: `/en/${item.slug}`, lastmod: currentDate, changefreq: "monthly", priority: "0.5" });
        }
      } catch (e) { console.error("Sitemap pages query failed:", e.message); }
    }

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    for (const u of urls) {
      xml += `  <url>\n    <loc>${site.url(u.loc)}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>\n`;
    }
    xml += `</urlset>`;

    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "X-Robots-Tag": "index, follow",
        "Cache-Control": "public, max-age=3600",
      },
    });
  },
};


export const sitemapbackupEngine = {
  async generate(db, type = "all") {
    if (!db) {
      return new Response("<error>D1 Connection Fault</error>", {
        status: 500,
        headers: { "Content-Type": "application/xml" }
      });
    }

    const currentDate = new Date().toISOString().split('T')[0];
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    if (type === "all") {
      xml += `  <url>\n    <loc>https://level.casino/en/</loc>\n    <lastmod>${currentDate}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;
      xml += `  <url>\n    <loc>https://level.casino/en/casino</loc>\n    <lastmod>${currentDate}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.9</priority>\n  </url>\n`;
      xml += `  <url>\n    <loc>https://level.casino/en/review</loc>\n    <lastmod>${currentDate}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
      xml += `  <url>\n    <loc>https://level.casino/en/news</loc>\n    <lastmod>${currentDate}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
      xml += `  <url>\n    <loc>https://level.casino/en/category</loc>\n    <lastmod>${currentDate}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>\n`;
      xml += `  <url>\n    <loc>https://level.casino/en/country</loc>\n    <lastmod>${currentDate}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>\n`;
    }

    if (type === "all" || type === "casinos") {
      const r = await db.prepare(`SELECT slug, updated_at FROM casinos WHERE published = 1 AND status = 'published' ORDER BY updated_at DESC LIMIT 1000`).all();
      (r.results || []).forEach(item => {
        const lm = item.updated_at ? item.updated_at.split(' ')[0] : currentDate;
        xml += `  <url>\n    <loc>https://level.casino/en/casino/${item.slug}</loc>\n    <lastmod>${lm}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
      });
    }

    if (type === "all" || type === "reviews") {
      const r = await db.prepare(`SELECT slug, updated_at FROM reviews WHERE published = 1 ORDER BY updated_at DESC LIMIT 1000`).all();
      (r.results || []).forEach(item => {
        const lm = item.updated_at ? item.updated_at.split(' ')[0] : currentDate;
        xml += `  <url>\n    <loc>https://level.casino/en/review/${item.slug}</loc>\n    <lastmod>${lm}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
      });
    }

    if (type === "all") {
      const r = await db.prepare(`SELECT slug, updated_at FROM news WHERE published = 1 ORDER BY created_at DESC LIMIT 500`).all();
      (r.results || []).forEach(item => {
        const lm = item.updated_at ? item.updated_at.split(' ')[0] : currentDate;
        xml += `  <url>\n    <loc>https://level.casino/en/news/${item.slug}</loc>\n    <lastmod>${lm}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>\n`;
      });

      const cr = await db.prepare(`SELECT slug FROM categories LIMIT 100`).all();
      (cr.results || []).forEach(item => {
        xml += `  <url>\n    <loc>https://level.casino/en/category/${item.slug}</loc>\n    <lastmod>${currentDate}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>\n`;
      });

      const ctr = await db.prepare(`SELECT code FROM countries LIMIT 250`).all();
      (ctr.results || []).forEach(item => {
        xml += `  <url>\n    <loc>https://level.casino/en/country/${item.code}</loc>\n    <lastmod>${currentDate}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.5</priority>\n  </url>\n`;
      });

      const pr = await db.prepare(`SELECT slug FROM pages WHERE published = 1 LIMIT 500`).all();
      (pr.results || []).forEach(item => {
        xml += `  <url>\n    <loc>https://level.casino/en/${item.slug}</loc>\n    <lastmod>${currentDate}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.5</priority>\n  </url>\n`;
      });
    }

    xml += `</urlset>`;

    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "X-Robots-Tag": "index, follow",
        "Cache-Control": "public, max-age=3600"
      }
    });
  }
};

