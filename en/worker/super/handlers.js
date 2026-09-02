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
import * as componentsDB from "../database/components.js";
import * as permissionsDB from "../database/permissions.js";
import * as navDB from "../database/nav.js";
import * as bannersDB from "../database/banners.js";
import * as geoDB from "../database/geo.js";
import * as itemAccessDB from "../database/item-access.js";
import * as reviewBlocksDB from "../database/review_blocks.js";
import * as adRulesDB from "../database/ad-rules.js";
import * as platformUpdatesDB from "../database/platform-updates.js";
import {
  validateFile,
  generateR2Key,
  generatePublicUrl,
  generateThumbnailUrls,
  handleDelete as mediaUploadHandleDelete
} from "../media-upload.js";
import { createMediaItem } from "../database/media_library.js";

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

// Mirrors en/worker/api.js's own validate() exactly — same fields
// required, same "empty string counts as missing" rule, same error
// message shape — so the Super API rejects invalid input exactly
// like the tenant's own admin does, rather than silently accepting
// an incomplete record that the DB layer doesn't itself guard.
function validateRequired(body, required) {
  const missing = required.filter(
    (field) => body[field] === undefined || body[field] === null || body[field] === ""
  );
  if (missing.length > 0) {
    throw new Error(`${missing[0]} is required`);
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
  const rows = await casinosDB.getAllCasinosAdmin(env.DB);
  return ok({ data: rows });
}

export async function handleGetCasino(request, env, slug) {
  const row = await casinosDB.getCasinoAdmin(env.DB, slug);
  if (!row) return fail("not_found", 404);

  // Enrich with the casino's category assignments (casino_categories
  // join table) and per-country geo rules (geo_rules table) — these
  // aren't columns on `casinos` itself, but the control plane's form
  // needs them alongside the record to let admins choose categories
  // and countries, matching what the tenant's own /api/v1/casino/get
  // and /api/v1/geo/list already expose.
  row.category_ids = await casinosDB.getCasinoCategories(env.DB, row.id);
  row.geo_rules = await geoDB.getGeoRulesForCasino(env.DB, row.slug);

  return ok({ data: row });
}

export async function handleCreateCasino(request, env, _slug, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    validateRequired(body, ["slug", "name", "affiliate_url"]);
    const id = await casinosDB.createCasino(env.DB, body);
    if (Array.isArray(body.category_ids)) {
      await casinosDB.setCasinoCategories(env.DB, id, body.category_ids);
    }
    if (Array.isArray(body.geo_rules)) {
      await geoDB.setCasinoGeoRules(env.DB, body.slug, body.geo_rules);
    }
    return created({ data: { id } });
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleUpdateCasino(request, env, slug, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    // slug/name/affiliate_url required on update too, matching
    // api.js's updateCasino. Note: casinos CAN be renamed — `slug`
    // (URL path segment) is the identity used to find the row,
    // but body.slug (if different) becomes the new slug, exactly
    // like the tenant's own admin (which calls this old_slug vs
    // slug). Whatever value the caller sends in body.slug wins.
    validateRequired(body, ["name", "affiliate_url"]);
    await casinosDB.updateCasino(env.DB, slug, body);

    const newSlug = body.slug || slug;
    const casinoId = await casinosDB.getCasinoIdBySlug(env.DB, newSlug);

    if (casinoId && Array.isArray(body.category_ids)) {
      await casinosDB.setCasinoCategories(env.DB, casinoId, body.category_ids);
    }
    if (Array.isArray(body.geo_rules)) {
      // Geo rules are keyed by casino_slug, not id — if the slug
      // changed, the old rows are orphaned under the old slug and
      // must be cleared out before writing the new set.
      if (newSlug !== slug) {
        await geoDB.deleteGeoRulesForCasino(env.DB, slug);
      }
      await geoDB.setCasinoGeoRules(env.DB, newSlug, body.geo_rules);
    }

    return ok();
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
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
  try {
    validateRequired(body, ["slug", "title", "content", "casino_slug"]);
    const id = await reviewsDB.createReview(env.DB, body);
    return created({ data: { id } });
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleUpdateReview(request, env, slug, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    validateRequired(body, ["title", "content"]);
    await reviewsDB.updateReview(env.DB, slug, body);
    return ok();
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
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
  try {
    const id = await newsDB.createNews(env.DB, body);
    return created({ data: { id } });
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleUpdateNews(request, env, slug, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    await newsDB.updateNews(env.DB, slug, body);
    return ok();
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
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
  try {
    validateRequired(body, ["slug", "type", "template", "title"]);
    const id = await pagesDB.createPage(env.DB, body);
    return created({ data: { id } });
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleUpdatePage(request, env, slug, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    validateRequired(body, ["title"]);
    await pagesDB.updatePage(env.DB, slug, body);
    return ok();
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
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

export async function handleListMediaFolders(request, env) {
  const folders = await mediaDB.getMediaFolders(env.DB);
  return ok({ data: folders });
}

// Adds an externally-hosted image to the library by URL, without
// uploading bytes through this worker — mirrors the tenant's own
// "Add Image from External URL" form (static/js/media-admin.js ->
// /api/v1/media/create), using the same plain-metadata createMedia,
// not the R2-aware createMediaItem the real upload path uses.
// Body: { url, filename, thumbnail_url?, folder?, alt_text? }
export async function handleCreateMediaFromUrl(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  if (!body.url || !body.filename) {
    return fail("url_and_filename_required", 422);
  }
  const id = await mediaDB.createMedia(env.DB, body);
  return created({ data: { id } });
}

export async function handleGetMedia(request, env, id) {
  const row = await mediaDB.getMedia(env.DB, id);
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleUpdateMedia(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  await mediaDB.updateMediaItem(env, id, body);
  return ok();
}

export async function handleDeleteMedia(request, env, id) {
  // Reuses the tenant's own full delete path (R2 object + D1 row),
  // not just the D1-only deleteMediaItem — avoids orphaning R2
  // objects when a media item is deleted through Lummet. Lummet is
  // a trusted platform-level caller, so it gets the "admin" role
  // here rather than the editor-only-own-uploads restriction that
  // applies to normal tenant users.
  const syntheticAdminUser = { role: "admin", user_id: null };
  return mediaUploadHandleDelete(request, env, syntheticAdminUser, id);
}

/**
 * Uploads a new media item. Takes the file as base64 in a JSON body
 * rather than multipart/form-data, deliberately — the Super API's
 * signature verification (super/auth.js) reads the request body
 * once as text to compute the HMAC body hash before handing off to
 * a handler; a raw multipart body can't be re-read as FormData
 * after that without corrupting binary bytes or double-consuming
 * the stream. Base64-in-JSON keeps everything as plain text through
 * the whole signing pipeline. Reuses the tenant's own validation,
 * R2 key generation, and thumbnail URL logic — the only new code
 * here is the base64 decode and D1 row creation via createMediaItem
 * (already used by the tenant's own upload path).
 *
 * Body: { filename, mime_type, folder?, alt_text?, caption?, data_base64 }
 */
export async function handleUploadMedia(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);

  if (!env.MEDIA_BUCKET) {
    return fail("r2_not_configured", 500);
  }

  const filename = String(body.filename || "").trim();
  const mimeType = String(body.mime_type || "").trim();
  const base64 = body.data_base64;

  if (!filename || !mimeType || !base64) {
    return fail("filename_mime_type_and_data_base64_required", 422);
  }

  let bytes;
  try {
    const binary = atob(base64);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  } catch (error) {
    return fail("invalid_base64_data", 422);
  }

  const validation = validateFile(filename, mimeType, bytes.byteLength);
  if (!validation.valid) {
    return fail(validation.error || "invalid_file", 422);
  }

  const folderSlug = String(body.folder || "general");
  const r2Key = generateR2Key(folderSlug, validation.ext);

  await env.MEDIA_BUCKET.put(r2Key, bytes.buffer, {
    httpMetadata: { contentType: mimeType },
    customMetadata: {
      uploadedBy: "lummet",
      originalFilename: filename,
      uploadedAt: new Date().toISOString()
    }
  });

  const site = await getSiteContext(request, env);
  const publicUrl = generatePublicUrl(r2Key, site.hostname);

  let thumbnailUrl = null;
  if (validation.mediaType === "image") {
    thumbnailUrl = generateThumbnailUrls(publicUrl).thumbnail;
  }

  const mediaRecord = await createMediaItem(env, {
    filename: filename,
    url: publicUrl,
    thumbnail_url: thumbnailUrl,
    alt_text: body.alt_text || "",
    mime_type: mimeType,
    size: bytes.byteLength,
    folder: folderSlug,
    r2_key: r2Key,
    original_filename: filename,
    type: validation.mediaType,
    caption: body.caption || null,
    file_ext: validation.ext || null
  });

  return created({ data: { id: mediaRecord.id, url: publicUrl, thumbnail_url: thumbnailUrl } });
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

export async function handleDeleteUser(request, env, id) {
  // admin_tools.deleteUser already refuses to delete the last
  // remaining admin — that check is preserved as-is here.
  try {
    await adminTools.deleteUser(env.DB, id);
    return ok();
  } catch (error) {
    return fail(error.message || "delete_failed", 422);
  }
}

// =====================================================
// COMPONENTS (id-keyed)
// =====================================================

export async function handleListComponents(request, env) {
  const rows = await componentsDB.getAllComponents(env.DB);
  return ok({ data: rows });
}

export async function handleGetComponent(request, env, id) {
  const row = await componentsDB.getComponent(env.DB, id);
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleCreateComponent(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  const id = await componentsDB.createComponent(env.DB, body);
  return created({ data: { id } });
}

export async function handleUpdateComponent(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  await componentsDB.updateComponent(env.DB, id, body);
  return ok();
}

export async function handleDeleteComponent(request, env, id) {
  await componentsDB.deleteComponent(env.DB, id);
  return ok();
}

// =====================================================
// PAGE COMPONENTS ("blocks" — which components are placed
// on which pages, id-keyed)
// =====================================================

export async function handleListBlocks(request, env) {
  const rows = await componentsDB.getAllPageAssignments(env.DB);
  return ok({ data: rows });
}

export async function handleGetBlock(request, env, id) {
  const row = await componentsDB.getPageAssignmentById(env.DB, id);
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleCreateBlock(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  const result = await componentsDB.assignComponentToPage(env.DB, body);
  return created({ data: { id: result.meta?.last_row_id ?? null } });
}

export async function handleUpdateBlock(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  await componentsDB.updatePageComponentAssignment(env.DB, id, body);
  if (body.enabled !== undefined) {
    await componentsDB.togglePageComponent(env.DB, id, body.enabled);
  }
  return ok();
}

export async function handleDeleteBlock(request, env, id) {
  await componentsDB.removePageComponent(env.DB, id);
  return ok();
}

// =====================================================
// PERMISSIONS (role/resource/action matrix — not a normal
// id-keyed CRUD resource; the client reads/writes the whole
// matrix or one cell at a time)
// =====================================================

export async function handleListPermissions(request, env) {
  const matrix = await permissionsDB.getPermissionMatrix(env.DB);
  const rows = await permissionsDB.getAllPermissions(env.DB);
  return ok({ data: { matrix, rows } });
}

// PUT body: { role, resource, action, allowed }
export async function handleSetPermission(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  if (!body.role || !body.resource || !body.action) {
    return fail("role_resource_and_action_required", 422);
  }
  await permissionsDB.setPermission(env.DB, body.role, body.resource, body.action, !!body.allowed);
  return ok();
}

export async function handleDeletePermission(request, env, id) {
  await permissionsDB.deletePermission(env.DB, id);
  return ok();
}

// =====================================================
// ITEM-LEVEL ACCESS
// Wraps en/worker/database/item-access.js — the same module the
// tenant's own (unmounted) item-access-api.js already wraps, so no
// authorization logic is duplicated here. Sits ON TOP of the
// role/resource/action permissions above: permissions decide
// whether a role can act on a resource at all; this decides WHICH
// items of that resource a given user can act on
// (none/own/all/assigned).
// =====================================================

// GET — the whole picture for one user: their per-resource/action
// scopes, the system default, and (to avoid needing per-resource
// query params, which this Super API's request signature doesn't
// cover) their specific item assignments across every registered
// resource in one shot.
export async function handleGetUserItemAccess(request, env, userId) {
  const uid = Number(userId);
  const access = await itemAccessDB.getAllUserItemAccess(env.DB, uid);
  const defaultScope = await itemAccessDB.getSystemDefaultScope(env.DB);
  const resources = itemAccessDB.getRegisteredResources();
  const assignments = {};
  for (const resource of resources) {
    assignments[resource] = await itemAccessDB.getAccessibleItemIds(env.DB, uid, resource);
  }
  return ok({ data: { access, defaultScope, resources, assignments } });
}

// PUT body: { resource, action, scope }
export async function handleSetUserItemAccess(request, env, userId, bodyText) {
  const body = await readJsonBody(request, bodyText);
  if (!body.resource || !body.action || !body.scope) {
    return fail("resource_action_and_scope_required", 422);
  }
  try {
    await itemAccessDB.setUserItemAccess(env.DB, Number(userId), body.resource, body.action, body.scope);
    return ok();
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

// PUT body: { resource, item_id, assigned }. A single endpoint for
// both granting and revoking one item, so this never needs DELETE
// with a body (which this control plane's client can't send — its
// request signature is computed over the exact bytes sent).
export async function handleSetItemAssignment(request, env, userId, bodyText) {
  const body = await readJsonBody(request, bodyText);
  if (!body.resource || body.item_id == null) {
    return fail("resource_and_item_id_required", 422);
  }
  if (body.assigned) {
    await itemAccessDB.assignItem(env.DB, Number(userId), body.resource, Number(body.item_id));
  } else {
    await itemAccessDB.unassignItem(env.DB, Number(userId), body.resource, Number(body.item_id));
  }
  return ok();
}

export async function handleGetItemAccessDefaults(request, env) {
  const scope = await itemAccessDB.getSystemDefaultScope(env.DB);
  const resources = itemAccessDB.getRegisteredResources();
  return ok({ data: { scope, resources } });
}

// PUT body: { scope }
export async function handleSetItemAccessDefaultScope(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  if (!body.scope) return fail("scope_required", 422);
  try {
    await itemAccessDB.setSystemDefaultScope(env.DB, body.scope);
    return ok();
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

// =====================================================
// REVIEW BLOCKS
// Extra ordered title+content sub-sections attached to a review
// (e.g. "Deposit Methods", "Mobile Experience") — wraps
// en/worker/database/review_blocks.js, the same module the
// tenant's own admin already uses at /api/v1/review-blocks/*.
// =====================================================

export async function handleListReviewBlocks(request, env) {
  const url = new URL(request.url);
  const reviewSlug = url.searchParams.get("review_slug");
  if (!reviewSlug) return fail("review_slug_required", 422);
  const rows = await reviewBlocksDB.getReviewBlocks(env.DB, reviewSlug);
  return ok({ data: rows });
}

// POST body: { review_slug, title, content, position? }
export async function handleCreateReviewBlock(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  if (!body.review_slug || !body.title) {
    return fail("review_slug_and_title_required", 422);
  }
  const id = await reviewBlocksDB.createReviewBlock(env.DB, body);
  return created({ data: { id } });
}

// PUT body: { title, content, position? }
export async function handleUpdateReviewBlock(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  if (!body.title) return fail("title_required", 422);
  await reviewBlocksDB.updateReviewBlock(env.DB, id, body);
  return ok();
}

export async function handleDeleteReviewBlock(request, env, id) {
  await reviewBlocksDB.deleteReviewBlock(env.DB, id);
  return ok();
}

// =====================================================
// AD RULES
// Automatic ad-placement engine — wraps
// en/worker/database/ad-rules.js (validation lives there already,
// same module the tenant's own /api/v1/ad-rules/* uses).
// =====================================================

export async function handleListAdRules(request, env) {
  const rows = await adRulesDB.getAllAdRules(env.DB);
  return ok({ data: rows });
}

export async function handleCreateAdRule(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    const result = await adRulesDB.createAdRule(env.DB, body);
    return created({ data: { id: result.meta?.last_row_id } });
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleUpdateAdRule(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    await adRulesDB.updateAdRule(env.DB, id, body);
    return ok();
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleDeleteAdRule(request, env, id) {
  try {
    await adRulesDB.deleteAdRule(env.DB, id);
    return ok();
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

// =====================================================
// NAV ITEMS (id-keyed)
// =====================================================

export async function handleListNavItems(request, env) {
  const rows = await navDB.getAllNavItems(env.DB);
  return ok({ data: rows });
}

export async function handleCreateNavItem(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  const id = await navDB.createNavItem(env.DB, body);
  return created({ data: { id } });
}

export async function handleUpdateNavItem(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  await navDB.updateNavItem(env.DB, id, body);
  return ok();
}

export async function handleDeleteNavItem(request, env, id) {
  await navDB.deleteNavItem(env.DB, id);
  return ok();
}

// =====================================================
// BANNERS (id-keyed)
// =====================================================

export async function handleListBanners(request, env) {
  const rows = await bannersDB.getAllBanners(env.DB);
  return ok({ data: rows });
}

export async function handleGetBanner(request, env, id) {
  const row = await bannersDB.getBanner(env.DB, id);
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleCreateBanner(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  const id = await bannersDB.createBanner(env.DB, body);
  return created({ data: { id } });
}

export async function handleUpdateBanner(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  await bannersDB.updateBanner(env.DB, id, body);
  return ok();
}

export async function handleDeleteBanner(request, env, id) {
  await bannersDB.deleteBanner(env.DB, id);
  return ok();
}

// =====================================================
// PLATFORM UPDATES (id-keyed) — the tenant's changelog/announcements
// feature (en/worker/database/platform-updates.js). Not previously
// exposed on the Super API at all.
// =====================================================

export async function handleListPlatformUpdates(request, env) {
  const rows = await platformUpdatesDB.getAllPlatformUpdates(env.DB);
  return ok({ data: rows });
}

export async function handleGetPlatformUpdate(request, env, id) {
  const row = await platformUpdatesDB.getPlatformUpdateById(env.DB, id);
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleCreatePlatformUpdate(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  if (!body.slug || !body.title || !body.content) {
    return fail("slug_title_and_content_required", 422);
  }
  const result = await platformUpdatesDB.createPlatformUpdate(env.DB, body);
  return created({ data: { id: result.meta?.last_row_id } });
}

export async function handleUpdatePlatformUpdate(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  if (!body.slug || !body.title || !body.content) {
    return fail("slug_title_and_content_required", 422);
  }
  await platformUpdatesDB.updatePlatformUpdate(env.DB, id, body);
  return ok();
}

export async function handleDeletePlatformUpdate(request, env, id) {
  await platformUpdatesDB.deletePlatformUpdate(env.DB, id);
  return ok();
}
