// =====================================================
// item-access.js — Item-Level Access Control Engine
// =====================================================
// Independent authorization layer that sits ON TOP of
// the existing role/resource permission system.
//
//   AUTHENTICATION
//       ↓
//   EXISTING permissions.js (resource-level gate)
//       ↓
//   THIS MODULE (item-level scope)
//       ↓
//   ALLOW / DENY
//
// Scopes: 'none' | 'own' | 'all' | 'assigned'
//
// DEFAULT SCOPE when no user_item_access row exists:
//   Read from system_settings table ('item_access_default_scope')
//   Falls back to 'all' during transition, change to 'none' for production
// =====================================================

// ── Resource Registry ──────────────────────────────
// Single source of truth for ownership mapping.
// Never scatter ownership logic across API endpoints.

const RESOURCE_REGISTRY = {
  'casinos':           { table: 'casinos',          idColumn: 'id', slugColumn: 'slug', ownerColumn: 'created_by' },
  'reviews':           { table: 'reviews',          idColumn: 'id', slugColumn: 'slug', ownerColumn: 'created_by' },
  'news':              { table: 'news',             idColumn: 'id', slugColumn: 'slug', ownerColumn: 'created_by' },
  'pages':             { table: 'pages',            idColumn: 'id', slugColumn: 'slug', ownerColumn: 'created_by' },
  'platform-updates':  { table: 'platform_updates', idColumn: 'id', slugColumn: 'slug', ownerColumn: 'created_by' },
  'media':             { table: 'media_library',    idColumn: 'id', slugColumn: null,   ownerColumn: 'uploaded_by' },
  'seo_pages':         { table: 'seo_pages',         idColumn: 'id', slugColumn: null,   ownerColumn: 'created_by' }
};

const VALID_SCOPES = ['none', 'own', 'all', 'assigned'];
const VALID_ACTIONS = ['create', 'read', 'update', 'delete'];

// Hard fallback if system_settings table doesn't exist yet
const FALLBACK_DEFAULT_SCOPE = 'all';

// ── Registry helpers ──────────────────────────────

export function getResourceConfig(resource) {
  return RESOURCE_REGISTRY[resource] || null;
}

export function getRegisteredResources() {
  return Object.keys(RESOURCE_REGISTRY);
}

// ── System Default Scope ───────────────────────────

/**
 * Get the system-wide default scope used when no user_item_access row exists.
 * This is an EXPLICIT policy stored in system_settings, not an accident.
 *
 * Transition period: 'all' (backward compatible)
 * Production: 'none' (secure — admin must explicitly grant access)
 */
export async function getSystemDefaultScope(db) {
  try {
    const row = await db.prepare(
      `SELECT value FROM system_settings WHERE key = 'item_access_default_scope' LIMIT 1`
    ).first();
    if (row && VALID_SCOPES.includes(row.value)) return row.value;
  } catch (e) {
    // Table might not exist yet during early migration
  }
  return FALLBACK_DEFAULT_SCOPE;
}

/**
 * Set the system-wide default scope.
 * Admin-only — called from admin API.
 */
export async function setSystemDefaultScope(db, scope) {
  if (!VALID_SCOPES.includes(scope)) {
    throw new Error(`Invalid scope: ${scope}. Must be one of: ${VALID_SCOPES.join(', ')}`);
  }
  return await db.prepare(`
    INSERT INTO system_settings (key, value, updated_at)
    VALUES ('item_access_default_scope', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).bind(scope).run();
}

// ── Scope Policy CRUD ─────────────────────────────

/**
 * Get a user's item-level scope for a specific resource + action.
 * If no row exists, returns the system default scope (explicit policy).
 */
export async function getItemScope(db, userId, resource, action = 'read') {
  const row = await db.prepare(`
    SELECT scope FROM user_item_access
    WHERE user_id = ? AND resource = ? AND action = ?
    LIMIT 1
  `).bind(userId, resource, action).first();

  if (row) return row.scope;

  // No explicit row — use system default (NOT a hardcoded 'all')
  return await getSystemDefaultScope(db);
}

/**
 * Alias for backward compatibility
 */
export const getUserItemAccess = getItemScope;

/**
 * Set a user's item-level scope for a specific resource + action.
 */
export async function setUserItemAccess(db, userId, resource, action, scope) {
  if (!VALID_SCOPES.includes(scope)) {
    throw new Error(`Invalid scope: ${scope}. Must be one of: ${VALID_SCOPES.join(', ')}`);
  }
  if (!VALID_ACTIONS.includes(action)) {
    throw new Error(`Invalid action: ${action}. Must be one of: ${VALID_ACTIONS.join(', ')}`);
  }

  return await db.prepare(`
    INSERT INTO user_item_access (user_id, resource, action, scope, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, resource, action)
    DO UPDATE SET scope = excluded.scope, updated_at = CURRENT_TIMESTAMP
  `).bind(userId, resource, action, scope).run();
}

/**
 * Delete a user's item-level scope.
 * Removing the row reverts to system default scope.
 */
export async function deleteUserItemAccess(db, userId, resource, action) {
  return await db.prepare(`
    DELETE FROM user_item_access
    WHERE user_id = ? AND resource = ? AND action = ?
  `).bind(userId, resource, action).run();
}

/**
 * Get all item-level access rules for a user.
 */
export async function getAllUserItemAccess(db, userId) {
  const result = await db.prepare(`
    SELECT resource, action, scope FROM user_item_access
    WHERE user_id = ?
    ORDER BY resource, action
  `).bind(userId).all();

  return result.results || [];
}

// ── Assignment CRUD ───────────────────────────────

/**
 * Assign a specific item to a user.
 * Used when scope = 'assigned'.
 */
export async function assignItem(db, userId, resource, itemId, assignedBy = null) {
  return await db.prepare(`
    INSERT INTO item_access_assignments (user_id, resource, item_id, created_by)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, resource, item_id)
    DO NOTHING
  `).bind(userId, resource, itemId, assignedBy).run();
}

/**
 * Remove an item assignment from a user.
 */
export async function unassignItem(db, userId, resource, itemId) {
  return await db.prepare(`
    DELETE FROM item_access_assignments
    WHERE user_id = ? AND resource = ? AND item_id = ?
  `).bind(userId, resource, itemId).run();
}

/**
 * Check if a specific item is assigned to a user.
 */
export async function isItemAssigned(db, userId, resource, itemId) {
  const row = await db.prepare(`
    SELECT 1 FROM item_access_assignments
    WHERE user_id = ? AND resource = ? AND item_id = ?
    LIMIT 1
  `).bind(userId, resource, itemId).first();

  return !!row;
}

/**
 * Get all item IDs assigned to a user for a resource.
 */
export async function getAccessibleItemIds(db, userId, resource) {
  const result = await db.prepare(`
    SELECT item_id FROM item_access_assignments
    WHERE user_id = ? AND resource = ?
    ORDER BY item_id
  `).bind(userId, resource).all();

  return (result.results || []).map(r => r.item_id);
}

/**
 * Get all users assigned to a specific item.
 */
export async function getItemAssignees(db, resource, itemId) {
  const result = await db.prepare(`
    SELECT ia.user_id, u.email, u.role, ia.created_at
    FROM item_access_assignments ia
    JOIN users u ON u.id = ia.user_id
    WHERE ia.resource = ? AND ia.item_id = ?
    ORDER BY ia.created_at DESC
  `).bind(resource, itemId).all();

  return result.results || [];
}

// ── Central Authorization Function ─────────────────

/**
 * Check if a user can access a specific item.
 *
 * This is the SECOND gate — call AFTER checkPermission() passes.
 *
 * @param {Object} db - D1 database binding
 * @param {Object} user - Authenticated user ({ user_id, role })
 * @param {string} resource - Resource name (e.g. 'casinos')
 * @param {string} action - Action ('read' | 'create' | 'update' | 'delete')
 * @param {Object} item - Database row being accessed (must include id + owner column)
 * @returns {Promise<boolean>}
 */
export async function canAccessItem(db, user, resource, action, item) {
  // 1. No user = no access
  if (!user) return false;

  // 2. Admin bypasses item-level checks
  //    (but admin config is separate — see admin API)
  if (user.role === 'admin') return true;

  // 3. Unregistered resource = no item-level control = allow
  const config = getResourceConfig(resource);
  if (!config) return true;

  // 4. Get scope (from explicit row OR system default)
  const scope = await getItemScope(db, user.user_id, resource, action);

  // 5. Evaluate scope
  switch (scope) {
    case 'all':
      return true;

    case 'none':
      return false;

    case 'own':
      // User can only access items they created
      // NULL created_by = legacy record = DENY (NULL ≠ user.id)
      if (!item) return false;
      const ownerId = item[config.ownerColumn];
      if (ownerId === null || ownerId === undefined) return false;
      return Number(ownerId) === Number(user.user_id);

    case 'assigned':
      // User can only access explicitly assigned items
      if (!item) return false;
      return await isItemAssigned(
        db, user.user_id, resource, Number(item[config.idColumn])
      );

    default:
      // Unknown scope = DENY (fail safe)
      return false;
  }
}

// ── List Query Filter Builder ─────────────────────

/**
 * Build a SQL WHERE clause fragment + bind params for item-level filtering.
 *
 * Inject this into list queries so unauthorized records never leave D1.
 *
 * @param {Object} db - D1 database binding
 * @param {Object} user - Authenticated user ({ user_id, role })
 * @param {string} resource - Resource name
 * @param {string} action - Action (usually 'read')
 * @param {string} tableAlias - SQL alias (e.g. 'c' for casinos, 'pu' for platform_updates)
 * @returns {Promise<{ condition: string, params: Array }>}
 *
 * Returns:
 *   ALL       → { condition: '', params: [] }
 *   NONE      → { condition: '1=0', params: [] }
 *   OWN       → { condition: 'alias.created_by = ?', params: [userId] }
 *   ASSIGNED  → { condition: 'alias.id IN (SELECT ...)', params: [...] }
 */
export async function getAccessibleWhereClause(
  db, user, resource, action = 'read', tableAlias = ''
) {
  // No user = deny all
  if (!user) return { condition: '1=0', params: [] };

  // Admin = no restriction
  if (user.role === 'admin') return { condition: '', params: [] };

  // Unregistered resource = no item-level control
  const config = getResourceConfig(resource);
  if (!config) return { condition: '', params: [] };

  // Get scope (explicit row OR system default)
  const scope = await getItemScope(db, user.user_id, resource, action);

  const prefix = tableAlias ? `${tableAlias}.` : '';

  switch (scope) {
    case 'all':
      return { condition: '', params: [] };

    case 'none':
      return { condition: '1=0', params: [] };

    case 'own':
      return {
        condition: `${prefix}${config.ownerColumn} = ?`,
        params: [user.user_id]
      };

    case 'assigned':
      return {
        condition: `${prefix}${config.idColumn} IN (
          SELECT item_id FROM item_access_assignments
          WHERE user_id = ? AND resource = ?
        )`,
        params: [user.user_id, resource]
      };

    default:
      // Unknown scope = deny (fail safe)
      return { condition: '1=0', params: [] };
  }
}

// Alias for backward compatibility
export const getItemAccessCondition = getAccessibleWhereClause;

// ── Item Fetch Helpers ─────────────────────────────

/**
 * Fetch an item by slug so canAccessItem can evaluate it.
 */
export async function getItemBySlug(db, resource, slug) {
  const config = getResourceConfig(resource);
  if (!config || !config.slugColumn) return null;

  const result = await db.prepare(
    `SELECT * FROM ${config.table} WHERE ${config.slugColumn} = ? LIMIT 1`
  ).bind(slug).first();

  return result || null;
}

/**
 * Fetch an item by ID so canAccessItem can evaluate it.
 */
export async function getItemById(db, resource, id) {
  const config = getResourceConfig(resource);
  if (!config) return null;

  const result = await db.prepare(
    `SELECT * FROM ${config.table} WHERE ${config.idColumn} = ? LIMIT 1`
  ).bind(id).first();

  return result || null;
}

// ── Ownership Helpers ─────────────────────────────

/**
 * Returns the owner column name for a resource.
 */
export function getOwnerColumn(resource) {
  const config = getResourceConfig(resource);
  return config?.ownerColumn || null;
}

/**
 * Returns full ownership info for a resource.
 */
export function getOwnershipInfo(resource) {
  const config = getResourceConfig(resource);
  if (!config) return null;
  return {
    ownerColumn: config.ownerColumn,
    idColumn: config.idColumn,
    slugColumn: config.slugColumn
  };
}
