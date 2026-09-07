// Affiliate Partner CRUD — mirrors the conventions in
// worker/database/casinos.js (plain async functions, no ORM).

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Generates a unique slug from a name, appending -2, -3, ... on collision.
 * Mirrors the pattern components.js uses locally, exported here since
 * partners/programs/accounts all need slug-safety and casinos.js has
 * no equivalent helper to reuse.
 */
export async function generateUniquePartnerSlug(db, name, excludeId = null) {
  const base = slugify(name) || 'partner';
  let candidate = base;
  let suffix = 2;

  while (true) {
    const existing = await db
      .prepare(`SELECT id FROM affiliate_partners WHERE slug = ? LIMIT 1`)
      .bind(candidate)
      .first();

    if (!existing || (excludeId != null && existing.id === excludeId)) {
      return candidate;
    }
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

export async function getPartnerById(db, id) {
  return await db
    .prepare(`SELECT * FROM affiliate_partners WHERE id = ? LIMIT 1`)
    .bind(id)
    .first();
}

export async function getPartnerBySlug(db, slug) {
  return await db
    .prepare(`SELECT * FROM affiliate_partners WHERE slug = ? LIMIT 1`)
    .bind(slug)
    .first();
}

/**
 * Admin list with optional status/search filtering. No published/status
 * gate beyond what's requested — this is an admin-only resource, there
 * is no public-facing partner listing (unlike casinos).
 */
export async function getAllPartnersAdmin(db, { status = null, search = null, limit = 100, offset = 0 } = {}) {
  const conditions = [];
  const params = [];

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }
  if (search) {
    conditions.push('(name LIKE ? OR slug LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);

  const result = await db
    .prepare(`
      SELECT * FROM affiliate_partners
      ${whereClause}
      ORDER BY name ASC
      LIMIT ? OFFSET ?
    `)
    .bind(...params)
    .all();

  return result.results || [];
}

export async function createPartner(db, partner) {
  const result = await db
    .prepare(`
      INSERT INTO affiliate_partners (
        name, slug, website, description, partner_type, status,
        contact_name, contact_email, contact_phone, notes,
        external_reference, created_by, updated_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      partner.name,
      partner.slug,
      partner.website || null,
      partner.description || null,
      partner.partner_type || 'network',
      partner.status || 'active',
      partner.contact_name || null,
      partner.contact_email || null,
      partner.contact_phone || null,
      partner.notes || null,
      partner.external_reference || null,
      partner.created_by || null,
      partner.created_by || null
    )
    .run();

  return result.meta.last_row_id;
}

export async function updatePartner(db, id, partner) {
  return await db
    .prepare(`
      UPDATE affiliate_partners
      SET
        name = ?,
        slug = ?,
        website = ?,
        description = ?,
        partner_type = ?,
        status = ?,
        contact_name = ?,
        contact_email = ?,
        contact_phone = ?,
        notes = ?,
        external_reference = ?,
        updated_by = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .bind(
      partner.name,
      partner.slug,
      partner.website || null,
      partner.description || null,
      partner.partner_type || 'network',
      partner.status || 'active',
      partner.contact_name || null,
      partner.contact_email || null,
      partner.contact_phone || null,
      partner.notes || null,
      partner.external_reference || null,
      partner.updated_by || null,
      id
    )
    .run();
}

/**
 * Returns a summary of dependent records blocking a hard delete, or
 * null if the partner can be safely deleted. Called before attempting
 * deletePartner() so the API can give a clear error instead of
 * surfacing a raw SQLite FOREIGN KEY constraint failure.
 */
export async function getPartnerDependents(db, id) {
  const programs = await db
    .prepare(`SELECT COUNT(*) AS count FROM affiliate_programs WHERE partner_id = ?`)
    .bind(id)
    .first();

  if (programs.count > 0) {
    return { programs: programs.count };
  }
  return null;
}

export async function deletePartner(db, id) {
  return await db
    .prepare(`DELETE FROM affiliate_partners WHERE id = ?`)
    .bind(id)
    .run();
}

export async function archivePartner(db, id, updatedBy) {
  return await db
    .prepare(`
      UPDATE affiliate_partners
      SET status = 'archived', updated_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .bind(updatedBy || null, id)
    .run();
}

export async function getPartnerContacts(db, partnerId) {
  const result = await db
    .prepare(`SELECT * FROM affiliate_partner_contacts WHERE partner_id = ? ORDER BY name ASC`)
    .bind(partnerId)
    .all();
  return result.results || [];
}

export async function addPartnerContact(db, partnerId, contact) {
  const result = await db
    .prepare(`
      INSERT INTO affiliate_partner_contacts (partner_id, name, role, email, phone, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .bind(
      partnerId,
      contact.name,
      contact.role || null,
      contact.email || null,
      contact.phone || null,
      contact.notes || null
    )
    .run();
  return result.meta.last_row_id;
}

export async function deletePartnerContact(db, contactId) {
  return await db
    .prepare(`DELETE FROM affiliate_partner_contacts WHERE id = ?`)
    .bind(contactId)
    .run();
}
