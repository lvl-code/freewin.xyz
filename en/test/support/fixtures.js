// test/support/fixtures.js
//
// Builds a small, realistic multi-tenant-like dataset directly against
// the real schema (via the D1 shim) -- an admin, two editors with
// different item-access scopes, and casinos assigned so leakage tests
// have something real to fail against.

export async function seedBaseFixtures(db) {
  // Users: one admin (bypasses item-access entirely, per item-access.js),
  // one editor scoped to specific casinos via 'assigned', one editor
  // with 'own' scope (only casinos they created).
  await db.prepare(`INSERT INTO users (id, email, password_hash, role) VALUES
    (1, 'admin@test.local', 'x', 'admin'),
    (2, 'editor-assigned@test.local', 'x', 'editor'),
    (3, 'editor-own@test.local', 'x', 'editor'),
    (4, 'editor-none@test.local', 'x', 'editor')
  `).run();

  // Three casinos: A and B created by admin, C created by editor-own (user 3)
  await db.prepare(`INSERT INTO casinos (id, name, slug, website_url, affiliate_url, created_by) VALUES
    (101, 'Casino A', 'casino-a', 'https://casino-a.example', 'https://aff.example/a', 1),
    (102, 'Casino B', 'casino-b', 'https://casino-b.example', 'https://aff.example/b', 1),
    (103, 'Casino C', 'casino-c', 'https://casino-c.example', 'https://aff.example/c', 3)
  `).run();

  // editor-assigned (user 2) can see Casino A only, via explicit assignment
  await db.prepare(`INSERT INTO user_item_access (user_id, resource, action, scope) VALUES
    (2, 'casinos', 'read', 'assigned')
  `).run();
  await db.prepare(`INSERT INTO item_access_assignments (user_id, resource, item_id) VALUES
    (2, 'casinos', 101)
  `).run();

  // editor-own (user 3) can see only casinos they created (Casino C)
  await db.prepare(`INSERT INTO user_item_access (user_id, resource, action, scope) VALUES
    (3, 'casinos', 'read', 'own')
  `).run();

  // editor-none (user 4) has explicit 'none' scope -- should see nothing
  await db.prepare(`INSERT INTO user_item_access (user_id, resource, action, scope) VALUES
    (4, 'casinos', 'read', 'none')
  `).run();

  return {
    admin: { user_id: 1, role: 'admin' },
    editorAssigned: { user_id: 2, role: 'editor' }, // sees Casino A (101) only
    editorOwn: { user_id: 3, role: 'editor' },      // sees Casino C (103) only
    editorNone: { user_id: 4, role: 'editor' },     // sees nothing
    casinoA: 101, casinoB: 102, casinoC: 103
  };
}

/**
 * Inserts analytics_events rows directly (bypassing logEvent's
 * validation, since tests want full control over occurred_at for
 * deterministic date-range queries).
 */
export async function insertEvent(db, { eventType, casinoId = null, offerId = null, trackingLinkId = null, clickId = null, occurredAt, visitorHash = null }) {
  await db.prepare(`
    INSERT INTO analytics_events (event_type, casino_id, offer_id, tracking_link_id, click_id, occurred_at, visitor_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(eventType, casinoId, offerId, trackingLinkId, clickId, occurredAt, visitorHash).run();
}

export async function insertConversion(db, { casinoId = null, trackingLinkId = null, clickId = null, reportedValue, calculatedCommission, currency = 'USD', occurredAt, status = 'confirmed' }) {
  await db.prepare(`
    INSERT INTO analytics_conversions (casino_id, tracking_link_id, click_id, reported_value, calculated_commission, currency, occurred_at, status, conversion_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'deposit')
  `).bind(casinoId, trackingLinkId, clickId, reportedValue, calculatedCommission, currency, occurredAt, status).run();
}
