// =====================================================
// LUMMET AI — Admin API Handlers
// =====================================================

import { generateReview, generateSeo, generateFAQs } from '../ai/admin-tools.js';

const ADMIN_ROLES = ['admin', 'editor', 'super_admin'];

/**
 * Handle admin login
 * POST /api/admin/login
 */
export async function handleAdminLogin(request, env) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return Response.json({ success: false, error: 'Email and password required' }, { status: 400 });
    }

    // Find user in database
    const user = await env.DB.prepare(`
      SELECT id, email, password, role, name FROM users WHERE email = ? LIMIT 1
    `).bind(email.toLowerCase().trim()).first();

    if (!user) {
      return Response.json({ success: false, error: 'Invalid credentials' }, { status: 401 });
    }

    // Check if user has admin role
    if (!ADMIN_ROLES.includes(user.role)) {
      return Response.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    // Verify password — try hashed first, then plain text fallback
    let passwordValid = false;

    // Check if password looks like a hash (SHA-256 hex = 64 chars)
    if (user.password && user.password.length === 64) {
      const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
      const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
      passwordValid = (hashHex === user.password);
    }

    // Fallback: plain text comparison (for legacy accounts)
    if (!passwordValid && user.password === password) {
      passwordValid = true;
    }

    // Fallback: bcrypt-style check (if password starts with $2)
    if (!passwordValid && user.password && user.password.startsWith('$2')) {
      // Can't verify bcrypt in Workers easily — try plain text as last resort
      passwordValid = false;
    }

    if (!passwordValid) {
      return Response.json({ success: false, error: 'Invalid credentials' }, { status: 401 });
    }

    // Create session token
    const token = crypto.randomUUID() + '-' + Date.now();
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // Store session in sessions table
    await env.DB.prepare(`
      INSERT INTO sessions (id, user_id, token, expires_at, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).bind(sessionId, user.id, token, expiresAt).run();

    return Response.json({
      success: true,
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role }
    });
  } catch (error) {
    console.error('Lummet admin login error:', error.message);
    return Response.json({ success: false, error: 'Login failed' }, { status: 500 });
  }
}

/**
 * Verify admin token
 */
async function verifyAdmin(env, token) {
  if (!token) return null;
  const cleanToken = token.replace('Bearer ', '');

  const session = await env.DB.prepare(`
    SELECT s.user_id, s.expires_at, u.email, u.role, u.name
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > datetime('now')
    LIMIT 1
  `).bind(cleanToken).first();

  if (!session) return null;
  if (!ADMIN_ROLES.includes(session.role)) return null;

  return session;
}

/**
 * Get all casinos (admin)
 * GET /api/admin/casinos
 */
export async function handleGetCasinos(request, env) {
  const admin = await verifyAdmin(env, request.headers.get('Authorization'));
  if (!admin) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const r = await env.DB.prepare(`
    SELECT id, slug, name, rating, bonus_title, bonus_value, published, featured, status
    FROM casinos ORDER BY featured DESC, rating DESC LIMIT 100
  `).all();

  return Response.json({ casinos: r.results || [] });
}

/**
 * Get all reviews (admin)
 * GET /api/admin/reviews
 */
export async function handleGetReviews(request, env) {
  const admin = await verifyAdmin(env, request.headers.get('Authorization'));
  if (!admin) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const r = await env.DB.prepare(`
    SELECT id, slug, title, casino_slug, rating, published, created_at
    FROM reviews ORDER BY created_at DESC LIMIT 100
  `).all();

  return Response.json({ reviews: r.results || [] });
}

/**
 * Get all news (admin)
 * GET /api/admin/news
 */
export async function handleGetNews(request, env) {
  const admin = await verifyAdmin(env, request.headers.get('Authorization'));
  if (!admin) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const r = await env.DB.prepare(`
    SELECT id, slug, title, published, created_at
    FROM news ORDER BY created_at DESC LIMIT 100
  `).all();

  return Response.json({ news: r.results || [] });
}

/**
 * Get all pages (admin)
 * GET /api/admin/pages
 */
export async function handleGetPages(request, env) {
  const admin = await verifyAdmin(env, request.headers.get('Authorization'));
  if (!admin) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const r = await env.DB.prepare(`
    SELECT id, slug, title, type, published
    FROM pages ORDER BY created_at DESC LIMIT 100
  `).all();

  return Response.json({ pages: r.results || [] });
}

/**
 * Toggle publish status
 * POST /api/admin/toggle-publish
 */
export async function handleTogglePublish(request, env) {
  const admin = await verifyAdmin(env, request.headers.get('Authorization'));
  if (!admin) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { table, slug } = await request.json();
  const validTables = ['casinos', 'reviews', 'news', 'pages'];
  if (!validTables.includes(table)) {
    return Response.json({ error: 'Invalid table' }, { status: 400 });
  }

  const current = await env.DB.prepare(`SELECT published FROM ${table} WHERE slug = ?`).bind(slug).first();
  if (!current) return Response.json({ error: 'Not found' }, { status: 404 });

  const newValue = current.published ? 0 : 1;
  await env.DB.prepare(`UPDATE ${table} SET published = ?, updated_at = datetime('now') WHERE slug = ?`).bind(newValue, slug).run();

  return Response.json({ success: true, published: newValue });
}

/**
 * AI Command — execute natural language admin command
 * POST /api/admin/ai-command
 */
export async function handleAiCommand(request, env) {
  const admin = await verifyAdmin(env, request.headers.get('Authorization'));
  if (!admin) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { command } = await request.json();
  if (!command || command.length > 500) {
    return Response.json({ error: 'Invalid command' }, { status: 400 });
  }

  const cmd = command.toLowerCase().trim();
  const site = await getSiteContext(request, env);
  try {
    // ── Publish commands ──
    if (cmd.includes('publish') && cmd.includes('casino')) {
      if (cmd.includes('all') && cmd.includes('rating above')) {
        const ratingMatch = cmd.match(/rating above (\d+(\.\d+)?)/);
        const minRating = ratingMatch ? parseFloat(ratingMatch[1]) : 4;
        const r = await env.DB.prepare(`UPDATE casinos SET published = 1 WHERE rating >= ?`).bind(minRating).run();
        return Response.json({ result: `Published all casinos with rating >= ${minRating}. Rows affected: ${r.meta?.changes || 0}` });
      }
      if (cmd.includes('all')) {
        const r = await env.DB.prepare(`UPDATE casinos SET published = 1`).run();
        return Response.json({ result: `Published all casinos. Rows affected: ${r.meta?.changes || 0}` });
      }
      // Publish specific casino
      const casinoMatch = cmd.match(/publish\s+(?:casino\s+)?(.+)/);
      if (casinoMatch) {
        const name = casinoMatch[1].replace(/\s+casino/i, '').trim();
        const r = await env.DB.prepare(`UPDATE casinos SET published = 1 WHERE LOWER(name) LIKE ? OR slug = ?`).bind(`%${name.toLowerCase()}%`, name.toLowerCase()).run();
        return Response.json({ result: `Published casino "${name}". Rows affected: ${r.meta?.changes || 0}` });
      }
    }

    if (cmd.includes('publish') && cmd.includes('news')) {
      const r = await env.DB.prepare(`UPDATE news SET published = 1`).run();
      return Response.json({ result: `Published all news. Rows affected: ${r.meta?.changes || 0}` });
    }

    if (cmd.includes('publish') && cmd.includes('review')) {
      const r = await env.DB.prepare(`UPDATE reviews SET published = 1`).run();
      return Response.json({ result: `Published all reviews. Rows affected: ${r.meta?.changes || 0}` });
    }

    // ── Unpublish commands ──
    if (cmd.includes('unpublish') && cmd.includes('casino')) {
      const casinoMatch = cmd.match(/unpublish\s+(?:casino\s+)?(.+)/);
      if (casinoMatch) {
        const name = casinoMatch[1].replace(/\s+casino/i, '').trim();
        const r = await env.DB.prepare(`UPDATE casinos SET published = 0 WHERE LOWER(name) LIKE ? OR slug = ?`).bind(`%${name.toLowerCase()}%`, name.toLowerCase()).run();
        return Response.json({ result: `Unpublished casino "${name}". Rows affected: ${r.meta?.changes || 0}` });
      }
    }

    // ── Show/list commands ──
    if (cmd.includes('show') || cmd.includes('list')) {
      if (cmd.includes('unpublished') && cmd.includes('casino')) {
        const r = await env.DB.prepare(`SELECT name, slug, rating FROM casinos WHERE published = 0`).all();
        const list = (r.results || []).map(c => `${c.name} (${c.slug}) — Rating: ${c.rating}`).join('\n');
        return Response.json({ result: list || 'No unpublished casinos found.' });
      }
      if (cmd.includes('published') && cmd.includes('casino')) {
        const r = await env.DB.prepare(`SELECT name, slug, rating FROM casinos WHERE published = 1`).all();
        const list = (r.results || []).map(c => `${c.name} (${c.slug}) — Rating: ${c.rating}`).join('\n');
        return Response.json({ result: list || 'No published casinos found.' });
      }
      if (cmd.includes('casino')) {
        const r = await env.DB.prepare(`SELECT name, slug, rating, published, featured FROM casinos ORDER BY rating DESC LIMIT 50`).all();
        const list = (r.results || []).map(c => `${c.name} — Rating: ${c.rating} — ${c.published ? 'Published' : 'Unpublished'} ${c.featured ? '⭐' : ''}`).join('\n');
        return Response.json({ result: list || 'No casinos found.' });
      }
    }

    // ── Feature commands ──
    if (cmd.includes('feature') && cmd.includes('casino')) {
      const casinoMatch = cmd.match(/(?:make\s+)?feature\s+(?:casino\s+)?(.+)/);
      if (casinoMatch) {
        const name = casinoMatch[1].replace(/\s+casino/i, '').trim();
        const r = await env.DB.prepare(`UPDATE casinos SET featured = 1 WHERE LOWER(name) LIKE ? OR slug = ?`).bind(`%${name.toLowerCase()}%`, name.toLowerCase()).run();
        return Response.json({ result: `Featured casino "${name}". Rows affected: ${r.meta?.changes || 0}` });
      }
    }

    // ── Update rating ──
    if (cmd.includes('update') && cmd.includes('rating')) {
      const ratingMatch = cmd.match(/rating to (\d+(\.\d+)?)/);
      const casinoMatch = cmd.match(/(?:update\s+)?(.+?)'s rating/);
      if (ratingMatch && casinoMatch) {
        const rating = parseFloat(ratingMatch[1]);
        const name = casinoMatch[1].trim();
        const r = await env.DB.prepare(`UPDATE casinos SET rating = ? WHERE LOWER(name) LIKE ? OR slug = ?`).bind(rating, `%${name.toLowerCase()}%`, name.toLowerCase()).run();
        return Response.json({ result: `Updated ${name}'s rating to ${rating}. Rows affected: ${r.meta?.changes || 0}` });
      }
    }

    // ── Create casino ──
    if (cmd.includes('create') && cmd.includes('casino')) {
      const nameMatch = cmd.match(/called\s+(.+?)(?:\s+with|\s+and|$)/i);
      const bonusMatch = cmd.match(/(\d+%)\s*(?:welcome\s+)?bonus/i);
      const licenseMatch = cmd.match(/(?:license|licensed)\s+(?:in\s+)?(\w+)/i);

      if (nameMatch) {
        const name = nameMatch[1].trim();
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const bonus = bonusMatch ? bonusMatch[1] : '';
        const license = licenseMatch ? licenseMatch[1] : '';

        const r = await env.DB.prepare(`
          INSERT INTO casinos (slug, name, website_url, affiliate_url, rating, bonus_title, license, published, status, created_at, updated_at)
          VALUES (?, ?, '', '', 0, ?, ?, 0, 'draft', datetime('now'), datetime('now'))
        `).bind(slug, name, bonus ? `Welcome Bonus ${bonus}` : '', license).run();

        return Response.json({ result: `Created casino "${name}" (slug: ${slug}). Bonus: ${bonus || 'None'}. License: ${license || 'None'}. It is currently unpublished and in draft status.` });
      }
    }

    // ── Delete commands ──
    if (cmd.includes('delete') && cmd.includes('news')) {
      if (cmd.includes('older than')) {
        const yearMatch = cmd.match(/older than (\d{4})/);
        if (yearMatch) {
          const year = parseInt(yearMatch[1]);
          const r = await env.DB.prepare(`DELETE FROM news WHERE created_at < datetime(?)`).bind(`${year}-01-01`).run();
          return Response.json({ result: `Deleted news older than ${year}. Rows affected: ${r.meta?.changes || 0}` });
        }
      }
    }

    // ── Generate review ──
    if (cmd.includes('generate') && cmd.includes('review')) {
      const casinoMatch = cmd.match(/review for\s+(.+)/i);
      if (casinoMatch) {
        const name = casinoMatch[1].trim();
        const review = await generateReview(env, name, 'RW', name.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
        return Response.json({ result: review ? `Review generated for ${name}.` : 'Review generation failed.' });
      }
    }

    // ── Generate SEO ──
    if (cmd.includes('generate') && cmd.includes('seo')) {
      if (cmd.includes('all') || cmd.includes('bulk')) {
        const casinos = await env.DB.prepare(`SELECT slug, name FROM casinos WHERE (seo_title IS NULL OR seo_title = '') AND published = 1 LIMIT 20`).all();
        let count = 0;
        for (const casino of (casinos.results || [])) {
          const seo = await generateSeo(env, site.hostname, { type: 'casino', slug: casino.slug, country: 'Global' });
          if (seo) {
            await env.DB.prepare(`UPDATE casinos SET seo_title = ?, seo_description = ? WHERE slug = ?`).bind(seo.title, seo.description, casino.slug).run();
            count++;
          }
        }
        return Response.json({ result: `Generated SEO for ${count} casinos.` });
      }
    }

    // ── Unknown command ──
    return Response.json({ result: `I didn't understand that command. Try: "Publish all casinos", "Show unpublished casinos", "Create a casino called X with 100% bonus", "Update Stake's rating to 4.5", "Generate review for BC.Game", or "Generate SEO for all casinos".` });
  } catch (error) {
    console.error('Lummet AI command error:', error.message);
    return Response.json({ error: 'Command failed: ' + error.message }, { status: 500 });
  }
}

/**
 * Generate review (admin)
 * POST /api/admin/generate-review
 */
export async function handleGenerateReview(request, env) {
  const admin = await verifyAdmin(env, request.headers.get('Authorization'));
  if (!admin) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { casinoName, countryCode } = await request.json();
  const slug = casinoName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const review = await generateReview(env, casinoName, countryCode || 'RW', slug);

  return Response.json({ review });
}

/**
 * Bulk SEO generation
 * POST /api/admin/bulk-seo
 */
export async function handleBulkSEO(request, env) {
  const admin = await verifyAdmin(env, request.headers.get('Authorization'));
  if (!admin) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const site = await getSiteContext(request, env);
  const casinos = await env.DB.prepare(`SELECT slug, name FROM casinos WHERE (seo_title IS NULL OR seo_title = '') AND published = 1 LIMIT 20`).all();
  let count = 0;
  for (const casino of (casinos.results || [])) {
    const seo = await generateSeo(env, site.hostname, { type: 'casino', slug: casino.slug, country: 'Global' });
    if (seo) {
      await env.DB.prepare(`UPDATE casinos SET seo_title = ?, seo_description = ? WHERE slug = ?`).bind(seo.title, seo.description, casino.slug).run();
      count++;
    }
  }
  return Response.json({ result: `Generated SEO for ${count} casinos.` });
}

/**
 * Bulk FAQ generation
 * POST /api/admin/bulk-faqs
 */
export async function handleBulkFAQs(request, env) {
  const admin = await verifyAdmin(env, request.headers.get('Authorization'));
  if (!admin) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const casinos = await env.DB.prepare(`SELECT slug, name FROM casinos WHERE published = 1 LIMIT 10`).all();
  let count = 0;
  for (const casino of (casinos.results || [])) {
    const faqs = await generateFAQs(env, casino.name);
    if (faqs && faqs.length > 0) {
      // Store FAQs in the casino's faq_json or in the faqs table
      const faqJson = JSON.stringify(faqs);
      await env.DB.prepare(`UPDATE casinos SET features = ? WHERE slug = ?`).bind(faqJson, casino.slug).run();
      count++;
    }
  }
  return Response.json({ result: `Generated FAQs for ${count} casinos.` });
}

/**
 * Bulk review generation
 * POST /api/admin/bulk-reviews
 */
export async function handleBulkReviews(request, env) {
  const admin = await verifyAdmin(env, request.headers.get('Authorization'));
  if (!admin) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // Find casinos without reviews
  const casinos = await env.DB.prepare(`
    SELECT c.slug, c.name FROM casinos c
    WHERE c.published = 1
    AND c.slug NOT IN (SELECT casino_slug FROM reviews WHERE casino_slug IS NOT NULL)
    LIMIT 5
  `).all();

  let count = 0;
  for (const casino of (casinos.results || [])) {
    const review = await generateReview(env, casino.name, 'RW', casino.slug);
    if (review) {
      const reviewSlug = casino.slug + '-review';
      await env.DB.prepare(`
        INSERT INTO reviews (slug, title, casino_slug, content, rating, published, ai_generated, created_at)
        VALUES (?, ?, ?, ?, 0, 0, 1, datetime('now'))
      `).bind(reviewSlug, `${casino.name} Review`, casino.slug, review).run();
      count++;
    }
  }
  return Response.json({ result: `Generated ${count} reviews.` });
}
