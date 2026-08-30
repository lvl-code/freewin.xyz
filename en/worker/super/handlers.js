// =====================================================
// SUPER API — HANDLERS
// Thin wrappers around the tenant's existing
// worker/database/*.js modules. No business logic is
// duplicated here — every mutation calls the same
// function the normal dashboard/API already uses.
// =====================================================

import * as casinosDB from "../database/casinos.js";
import * as reviewsDB from "../database/reviews.js";
import * as newsDB from "../database/news.js";
import * as pagesDB from "../database/pages.js";
import * as categoriesDB from "../database/categories.js";
import * as countriesDB from "../database/countries.js";
import * as authorsDB from "../database/authors.js";
import * as mediaDB from "../database/media_library.js";
import * as settingsDB from "../database/settings.js";
import * as adminTools from "../database/admin_tools.js";

import { getSiteContext } from "../site-context.js";
import { SUPER_API_VERSION, getCapabilities } from "./capabilities.js";

// -----------------------------------------------------
// Response helpers
// -----------------------------------------------------

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function ok(data = {}) {
  return json({ success: true, ...data }, 200);
}

function created(data = {}) {
  return json({ success: true, ...data }, 201);
}

function fail(message, status = 400) {
  return json({ success: false, error: message }, status);
}

async function readJsonBody(request, bodyText) {
  if (!bodyText) return {};
  try {
    return JSON.parse(bodyText);
  } catch (_) {
    return {};
  }
}

// -----------------------------------------------------
// Settings: keys that must never be exposed or set
// through the Super API (rule #26).
// -----------------------------------------------------

const SENSITIVE_SETTING_PATTERN =
  /secret|password|credential|private[_-]?key|api[_-]?key|token/i;

function filterSafeSettings(settingsObject) {
  const out = {};
  for (const [key, value] of Object.entries(settingsObject || {})) {
    if (!SENSITIVE_SETTING_PATTERN.test(key)) {
      out[key] = value;
    }
  }
  return out;
}

// =====================================================
// HANDSHAKE / HEALTH / CAPABILITIES
// =====================================================

export async function handleHandshake(request, env) {
  const site = await getSiteContext(request, env);

  return ok({
    platform: "levelcasino-cms",
    host: site.hostname,
    site_name: site.siteName,
    deployment_id: env.DEPLOYMENT_ID || site.hostname,
    api_version: SUPER_API_VERSION,
    capabilities: Object.keys(getCapabilities()).filter(
      (k) => getCapabilities()[k]
    )
  });
}

export async function handleHealth(request, env) {
  try {
    await env.DB.prepare("SELECT 1").first();
    return ok({ status: "online" });
  } catch (error) {
    return fail("database_unavailable", 503);
  }
}

export async function handleCapabilities(request, env) {
  return ok({
    api_version: SUPER_API_VERSION,
    capabilities: getCapabilities()
  });
}

// =====================================================
// GENERIC LIST HELPERS FOR RESOURCES WITHOUT AN
// EXISTING "list all" EXPORT (read-only, fixed query —
// not arbitrary SQL; see rule #25).
// =====================================================

async function listAllReviews(db) {
  const result = await db
    .prepare(`SELECT * FROM reviews ORDER BY created_at DESC`)
    .all();
  return result.results || [];
}

// =====================================================
// CASINOS
// =====================================================

export async function handleListCasinos(request, env) {
  const rows = await casinosDB.getAllCasinos(env.DB);
  return ok({ data: rows });
}

export async function handleGetCasino(request, env, slug) {
  const row = await casinosDB.getCasino(env.DB, slug);
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleCreateCasino(request, env, _slug, bodyText) {
  const body = await readJsonBody(request, bodyText);
  const id = await casinosDB.createCasino(env.DB, body);
  return created({ data: { id } });
}

export async function handleUpdateCasino(request, env, slug, bodyText) {
  const body = await readJsonBody(request, bodyText);
  await casinosDB.updateCasino(env.DB, slug, body);
  return ok();
}

export async function handleDeleteCasino(request, env, slug) {
  await casinosDB.deleteCasino(env.DB, slug);
  return ok();
}

// =====================================================
// REVIEWS
// =====================================================

export async function handleListReviews(request, env) {
  const rows = await listAllReviews(env.DB);
  return ok({ data: rows });
}

export async function handleGetReview(request, env, slug) {
  const row = await reviewsDB.getReview(env.DB, slug);
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleCreateReview(request, env, _slug, bodyText) {
  const body = await readJsonBody(request, bodyText);
  const id = await reviewsDB.createReview(env.DB, body);
  return created({ data: { id } });
}

export async function handleUpdateReview(request, env, slug, bodyText) {
  const body = await readJsonBody(request, bodyText);
  await reviewsDB.updateReview(env.DB, slug, body);
  return ok();
}

export async function handleDeleteReview(request, env, slug) {
  await reviewsDB.deleteReview(env.DB, slug);
  return ok();
}

// =====================================================
// NEWS
// =====================================================

export async function handleListNews(request, env) {
  const rows = await newsDB.getAllNewsAdmin(env.DB);
  return ok({ data: rows });
}

export async function handleGetNews(request, env, slug) {
  const row = await newsDB.getNews(env.DB, slug);
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleCreateNews(request, env, _slug, bodyText) {
  const body = await readJsonBody(request, bodyText);
  const id = await newsDB.createNews(env.DB, body);
  return created({ data: { id } });
}

export async function handleUpdateNews(request, env, slug, bodyText) {
  const body = await readJsonBody(request, bodyText);
  await newsDB.updateNews(env.DB, slug, body);
  return ok();
}

export async function handleDeleteNews(request, env, slug) {
  await newsDB.deleteNews(env.DB, slug);
  return ok();
}

// =====================================================
// PAGES
// =====================================================

export async function handleListPages(request, env) {
  const rows = await pagesDB.getAllPages(env.DB);
  return ok({ data: rows });
}

export async function handleGetPage(request, env, slug) {
  const row = await pagesDB.getPage(env.DB, slug);
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleCreatePage(request, env, _slug, bodyText) {
  const body = await readJsonBody(request, bodyText);
  const id = await pagesDB.createPage(env.DB, body);
  return created({ data: { id } });
}

export async function handleUpdatePage(request, env, slug, bodyText) {
  const body = await readJsonBody(request, bodyText);
  await pagesDB.updatePage(env.DB, slug, body);
  return ok();
}

export async function handleDeletePage(request, env, slug) {
  await pagesDB.deletePage(env.DB, slug);
  return ok();
}

// =====================================================
// CATEGORIES
// =====================================================

export async function handleListCategories(request, env) {
  const rows = await categoriesDB.getAllCategories(env.DB);
  return ok({ data: rows });
}

export async function handleGetCategory(request, env, slug) {
  const row = await categoriesDB.getCategory(env.DB, slug);
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleCreateCategory(request, env, _slug, bodyText) {
  const body = await readJsonBody(request, bodyText);
  const id = await categoriesDB.createCategory(env.DB, body);
  return created({ data: { id } });
}

export async function handleUpdateCategory(request, env, slug, bodyText) {
  const body = await readJsonBody(request, bodyText);
  await categoriesDB.updateCategory(env.DB, slug, body);
  return ok();
}

export async function handleDeleteCategory(request, env, slug) {
  await categoriesDB.deleteCategory(env.DB, slug);
  return ok();
}

// =====================================================
// COUNTRIES
// =====================================================

export async function handleListCountries(request, env) {
  const rows = await countriesDB.getAllCountries(env.DB);
  return ok({ data: rows });
}

export async function handleGetCountry(request, env, code) {
  const row = await countriesDB.getCountry(env.DB, code);
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleCreateCountry(request, env, _code, bodyText) {
  const body = await readJsonBody(request, bodyText);
  const id = await countriesDB.createCountry(env.DB, body);
  return created({ data: { id } });
}

export async function handleUpdateCountry(request, env, code, bodyText) {
  const body = await readJsonBody(request, bodyText);
  await countriesDB.updateCountry(env.DB, code, body);
  return ok();
}

export async function handleDeleteCountry(request, env, code) {
  await countriesDB.deleteCountry(env.DB, code);
  return ok();
}

// =====================================================
// AUTHORS
// =====================================================

export async function handleListAuthors(request, env) {
  const rows = await authorsDB.getAllAuthorsAdmin(env.DB);
  return ok({ data: rows });
}

export async function handleGetAuthor(request, env, id) {
  const row = await authorsDB.getAuthorById(env.DB, id);
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleCreateAuthor(request, env, _slug, bodyText) {
  const body = await readJsonBody(request, bodyText);
  const id = await authorsDB.createAuthor(env.DB, body);
  return created({ data: { id } });
}

export async function handleUpdateAuthor(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  await authorsDB.updateAuthor(env.DB, id, body);
  return ok();
}

export async function handleDeleteAuthor(request, env, id) {
  await authorsDB.deleteAuthor(env.DB, id);
  return ok();
}

// =====================================================
// MEDIA (safe subset — metadata only, no upload/binary
// handling through the Super API in Phase 1)
// =====================================================

export async function handleListMedia(request, env) {
  const url = new URL(request.url);
  const folder = url.searchParams.get("folder") || null;
  const rows = await mediaDB.getAllMedia(env.DB, folder);
  return ok({ data: rows });
}

export async function handleGetMedia(request, env, id) {
  const row = await mediaDB.getMedia(env.DB, id);
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleUpdateMedia(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  await mediaDB.updateMedia(env.DB, id, body);
  return ok();
}

export async function handleDeleteMedia(request, env, id) {
  await mediaDB.deleteMedia(env.DB, id);
  return ok();
}

// =====================================================
// SETTINGS (safe configuration only — rule #26)
// =====================================================

export async function handleListSettings(request, env) {
  const all = await settingsDB.getAllSettings(env.DB);
  return ok({ data: filterSafeSettings(all) });
}

export async function handleUpdateSettings(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  const safe = filterSafeSettings(body);

  if (Object.keys(safe).length === 0) {
    return fail("no_safe_settings_provided", 422);
  }

  await settingsDB.saveSettings(env.DB, safe);
  return ok({ data: safe });
}

// =====================================================
// USERS (list / role-only — no password reads, no
// create/delete through the Super API in Phase 1)
// =====================================================

export async function handleListUsers(request, env) {
  const rows = await adminTools.getAllUsers(env.DB);
  const safe = (rows || []).map(({ password_hash, ...rest }) => rest);
  return ok({ data: safe });
}

export async function handleGetUser(request, env, id) {
  const row = await adminTools.getUserById(env.DB, id);
  if (!row) return fail("not_found", 404);
  const { password_hash, ...safe } = row;
  return ok({ data: safe });
}

export async function handleUpdateUserRole(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  if (!body.role) return fail("role_required", 422);
  await adminTools.updateUserRole(env.DB, id, body.role);
  return ok();
}
