// =====================================================
// SUPER API — HANDLERS (Systems 1-3: Affiliate Partner/Program
// Management, Offer & Bonus Management, Tracking Link Management)
//
// Same convention as handlers.js: thin wrappers around the tenant's
// existing worker/database/*.js modules. No business logic is
// duplicated here — every mutation calls the same function the
// normal dashboard/API (worker/api.js) already uses. Kept in a
// separate file from handlers.js purely for size; router.js imports
// both under separate namespaces.
// =====================================================

import * as partnersDB from "../database/affiliate-partners.js";
import * as programsDB from "../database/affiliate-programs.js";
import * as accountsDB from "../database/affiliate-accounts.js";
import * as termsDB from "../database/affiliate-commercial-terms.js";
import * as offersDB from "../database/offers.js";
import * as trackingLinksDB from "../database/tracking-links.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
function ok(data = {}) { return json({ success: true, ...data }, 200); }
function created(data = {}) { return json({ success: true, ...data }, 201); }
function fail(message, status = 400) { return json({ success: false, error: message }, status); }

async function readJsonBody(request, bodyText) {
  if (!bodyText) return {};
  try { return JSON.parse(bodyText); } catch (_) { return {}; }
}

// Mirrors handlers.js's own validateRequired() exactly.
function validateRequired(body, required) {
  const missing = required.filter(
    (field) => body[field] === undefined || body[field] === null || body[field] === ""
  );
  if (missing.length > 0) {
    throw new Error(`${missing[0]} is required`);
  }
}

// =====================================================
// AFFILIATE PARTNERS
// =====================================================

export async function handleListPartners(request, env) {
  const url = new URL(request.url);
  const rows = await partnersDB.getAllPartnersAdmin(env.DB, {
    status: url.searchParams.get("status") || null,
    search: url.searchParams.get("search") || null,
  });
  return ok({ data: rows });
}

export async function handleGetPartner(request, env, id) {
  const row = await partnersDB.getPartnerById(env.DB, Number(id));
  if (!row) return fail("not_found", 404);
  row.contacts = await partnersDB.getPartnerContacts(env.DB, row.id);
  return ok({ data: row });
}

export async function handleCreatePartner(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    validateRequired(body, ["name"]);
    body.slug = body.slug || await partnersDB.generateUniquePartnerSlug(env.DB, body.name);
    const id = await partnersDB.createPartner(env.DB, body);
    return created({ data: { id } });
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleUpdatePartner(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    validateRequired(body, ["name"]);
    const existing = await partnersDB.getPartnerById(env.DB, Number(id));
    if (!existing) return fail("not_found", 404);
    body.slug = body.slug || existing.slug;
    await partnersDB.updatePartner(env.DB, Number(id), body);
    return ok();
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleDeletePartner(request, env, id) {
  const dependents = await partnersDB.getPartnerDependents(env.DB, Number(id));
  if (dependents) {
    return fail(`Cannot delete: ${dependents.programs} affiliate program(s) attached. Archive instead.`, 409);
  }
  const trackingDependents = await trackingLinksDB.getPartnerTrackingLinkDependents(env.DB, Number(id));
  if (trackingDependents) {
    return fail(`Cannot delete: ${trackingDependents.tracking_links} tracking link(s) attached. Archive instead.`, 409);
  }
  await partnersDB.deletePartner(env.DB, Number(id));
  return ok();
}

// =====================================================
// AFFILIATE PROGRAMS
// =====================================================

export async function handleListPrograms(request, env) {
  const url = new URL(request.url);
  const rows = await programsDB.getAllProgramsAdmin(env.DB, {
    partnerId: url.searchParams.get("partner_id") ? Number(url.searchParams.get("partner_id")) : null,
    status: url.searchParams.get("status") || null,
    search: url.searchParams.get("search") || null,
  });
  return ok({ data: rows });
}

export async function handleGetProgram(request, env, id) {
  const row = await programsDB.getProgramById(env.DB, Number(id));
  if (!row) return fail("not_found", 404);
  // casino_ids alongside the record, same virtual-field pattern
  // handlers.js already uses for casinos.category_ids/geo_rules.
  const casinos = await programsDB.getProgramCasinos(env.DB, row.id);
  row.casino_ids = casinos.map((c) => c.id);
  row.casinos = casinos;
  return ok({ data: row });
}

export async function handleCreateProgram(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    validateRequired(body, ["partner_id", "name"]);
    const partner = await partnersDB.getPartnerById(env.DB, Number(body.partner_id));
    if (!partner) return fail("partner_id does not reference an existing affiliate partner", 422);
    const id = await programsDB.createProgram(env.DB, body);
    if (Array.isArray(body.casino_ids)) {
      await programsDB.setProgramCasinos(env.DB, id, body.casino_ids);
    }
    return created({ data: { id } });
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleUpdateProgram(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    validateRequired(body, ["name"]);
    const existing = await programsDB.getProgramById(env.DB, Number(id));
    if (!existing) return fail("not_found", 404);
    await programsDB.updateProgram(env.DB, Number(id), body);
    if (Array.isArray(body.casino_ids)) {
      await programsDB.setProgramCasinos(env.DB, Number(id), body.casino_ids);
    }
    return ok();
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleDeleteProgram(request, env, id) {
  const dependents = await programsDB.getProgramDependents(env.DB, Number(id));
  if (dependents) {
    const parts = Object.entries(dependents).map(([k, v]) => `${v} ${k}`).join(", ");
    return fail(`Cannot delete: ${parts} attached. Archive instead.`, 409);
  }
  const offerDependents = await offersDB.getProgramOfferDependents(env.DB, Number(id));
  if (offerDependents) return fail(`Cannot delete: ${offerDependents.offers} offer(s) attached. Archive instead.`, 409);
  const trackingDependents = await trackingLinksDB.getProgramTrackingLinkDependents(env.DB, Number(id));
  if (trackingDependents) return fail(`Cannot delete: ${trackingDependents.tracking_links} tracking link(s) attached. Archive instead.`, 409);

  await programsDB.deleteProgram(env.DB, Number(id));
  return ok();
}

// =====================================================
// AFFILIATE ACCOUNTS
// =====================================================

export async function handleListAccounts(request, env) {
  const url = new URL(request.url);
  const rows = await accountsDB.getAllAccountsAdmin(env.DB, {
    programId: url.searchParams.get("program_id") ? Number(url.searchParams.get("program_id")) : null,
    status: url.searchParams.get("status") || null,
    search: url.searchParams.get("search") || null,
  });
  return ok({ data: rows });
}

export async function handleGetAccount(request, env, id) {
  const row = await accountsDB.getAccountById(env.DB, Number(id));
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleCreateAccount(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    validateRequired(body, ["program_id", "account_name"]);
    const program = await programsDB.getProgramById(env.DB, Number(body.program_id));
    if (!program) return fail("program_id does not reference an existing affiliate program", 422);
    const id = await accountsDB.createAccount(env.DB, body);
    return created({ data: { id } });
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleUpdateAccount(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    validateRequired(body, ["account_name"]);
    const existing = await accountsDB.getAccountById(env.DB, Number(id));
    if (!existing) return fail("not_found", 404);
    await accountsDB.updateAccount(env.DB, Number(id), body);
    return ok();
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleDeleteAccount(request, env, id) {
  const dependents = await accountsDB.getAccountDependents(env.DB, Number(id));
  if (dependents) return fail(`Cannot delete: ${dependents.commercial_terms} commercial term(s) attached. Archive instead.`, 409);
  await accountsDB.deleteAccount(env.DB, Number(id));
  return ok();
}

// =====================================================
// COMMERCIAL TERMS
// Deliberately read+create only through this generic contract --
// terms are versioned/immutable by design (see
// migrations/0023_affiliate_partners_programs.sql and
// worker/database/affiliate-commercial-terms.js). The tenant's own
// admin UI has no plain "edit" for terms either, only create +
// supersede. handleUpdateTerm exists only so a PUT request gets a
// clear, honest rejection instead of a 404/500 -- superseding a term
// (closing the old one, opening a new one) is a deliberate two-step
// action, not a field edit, and isn't bolted onto the generic
// edit-in-place CRUD form to avoid implying otherwise.
// =====================================================

export async function handleListTerms(request, env) {
  const url = new URL(request.url);
  const programId = url.searchParams.get("program_id");
  if (!programId) return fail("program_id is required", 400);
  const rows = await termsDB.getTermHistory(env.DB, {
    programId: Number(programId),
    accountId: url.searchParams.get("account_id") ? Number(url.searchParams.get("account_id")) : null,
    casinoId: url.searchParams.get("casino_id") ? Number(url.searchParams.get("casino_id")) : null,
  });
  return ok({ data: rows });
}

export async function handleGetTerm(request, env, id) {
  const row = await termsDB.getTermById(env.DB, Number(id));
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleCreateTerm(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    validateRequired(body, ["program_id", "term_type", "effective_date"]);
    const program = await programsDB.getProgramById(env.DB, Number(body.program_id));
    if (!program) return fail("program_id does not reference an existing affiliate program", 422);
    const id = await termsDB.createCommercialTerm(env.DB, body);
    return created({ data: { id } });
  } catch (error) {
    const isOverlap = /already covers this exact scope/.test(error.message || "");
    return fail(error.message || "invalid_input", isOverlap ? 409 : 422);
  }
}

export async function handleUpdateTerm(request, env, id) {
  return fail(
    "Commercial terms are immutable once created -- supersede this term (POST a new one with a later effective_date) instead of editing it in place.",
    409
  );
}

// =====================================================
// OFFERS
// No delete endpoint by design (status transitions only, never
// hard-deleted) -- matches worker/api.js's own /offer/* routes,
// which likewise have no delete.
// =====================================================

export async function handleListOffers(request, env) {
  const url = new URL(request.url);
  const rows = await offersDB.getAllOffersAdmin(env.DB, {
    casinoId: url.searchParams.get("casino_id") ? Number(url.searchParams.get("casino_id")) : null,
    programId: url.searchParams.get("program_id") ? Number(url.searchParams.get("program_id")) : null,
    status: url.searchParams.get("status") || null,
    search: url.searchParams.get("search") || null,
  });
  return ok({ data: rows });
}

export async function handleGetOffer(request, env, id) {
  const row = await offersDB.getOfferById(env.DB, Number(id));
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleCreateOffer(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    validateRequired(body, ["casino_id", "offer_type", "internal_name"]);
    const casino = await env.DB.prepare(`SELECT id FROM casinos WHERE id = ?`).bind(Number(body.casino_id)).first();
    if (!casino) return fail("casino_id does not reference an existing casino", 422);
    const id = await offersDB.createOffer(env.DB, body);
    return created({ data: { id } });
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleUpdateOffer(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    const existing = await offersDB.getOfferById(env.DB, Number(id));
    if (!existing) return fail("not_found", 404);
    await offersDB.updateOffer(env.DB, Number(id), body, { changeReason: body.change_reason || null });
    return ok();
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

// =====================================================
// TRACKING LINKS
// No delete endpoint by design, same reasoning as offers.
// =====================================================

export async function handleListTrackingLinks(request, env) {
  const url = new URL(request.url);
  const rows = await trackingLinksDB.getAllTrackingLinksAdmin(env.DB, {
    casinoId: url.searchParams.get("casino_id") ? Number(url.searchParams.get("casino_id")) : null,
    status: url.searchParams.get("status") || null,
    healthStatus: url.searchParams.get("health_status") || null,
    search: url.searchParams.get("search") || null,
  });
  return ok({ data: rows });
}

export async function handleGetTrackingLink(request, env, id) {
  const row = await trackingLinksDB.getTrackingLinkById(env.DB, Number(id));
  if (!row) return fail("not_found", 404);
  row.geo_destinations = await trackingLinksDB.getGeoDestinations(env.DB, row.id);
  return ok({ data: row });
}

export async function handleCreateTrackingLink(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    validateRequired(body, ["internal_name", "destination_url"]);
    const ownDomains = [new URL(request.url).hostname];
    const result = await trackingLinksDB.createTrackingLink(env.DB, body, { ownDomains });
    if (Array.isArray(body.geo_destinations)) {
      await trackingLinksDB.setGeoDestinations(env.DB, result.id, body.geo_destinations, { ownDomains });
    }
    return created({ data: result });
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleUpdateTrackingLink(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    const existing = await trackingLinksDB.getTrackingLinkById(env.DB, Number(id));
    if (!existing) return fail("not_found", 404);
    const ownDomains = [new URL(request.url).hostname];
    await trackingLinksDB.updateTrackingLink(env.DB, Number(id), body, { ownDomains });
    if (Array.isArray(body.geo_destinations)) {
      await trackingLinksDB.setGeoDestinations(env.DB, Number(id), body.geo_destinations, { ownDomains });
    }
    return ok();
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}
