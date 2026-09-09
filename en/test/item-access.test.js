// test/item-access.test.js
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { seedBaseFixtures } from './support/fixtures.js';
import { getAccessibleIdCondition, getAccessibleWhereClause } from '../worker/database/item-access.js';

describe('getAccessibleIdCondition (the analytics-table scoping adapter)', () => {
  let db, fx;

  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    fx = await seedBaseFixtures(db);
  });

  test('admin gets an unconditional true condition, no params', async () => {
    const { condition, params } = await getAccessibleIdCondition(db, fx.admin, 'casinos', 'read', 'dimension_id');
    assert.equal(condition, '1=1');
    assert.deepEqual(params, []);
  });

  test('"assigned" scope resolves to exactly the assigned IDs -- editor sees Casino A, not B or C', async () => {
    const { condition, params } = await getAccessibleIdCondition(db, fx.editorAssigned, 'casinos', 'read', 'dimension_id');
    const check = await db.prepare(`
      SELECT id AS dimension_id FROM (SELECT 101 AS id UNION SELECT 102 UNION SELECT 103) WHERE ${condition}
    `).bind(...params).all();
    const visibleIds = check.results.map(r => r.dimension_id);
    assert.deepEqual(visibleIds, [101]);
  });

  test('"own" scope resolves to items the user created -- editor-own sees only Casino C', async () => {
    const { condition, params } = await getAccessibleIdCondition(db, fx.editorOwn, 'casinos', 'read', 'dimension_id');
    const check = await db.prepare(`
      SELECT id AS dimension_id FROM (SELECT 101 AS id UNION SELECT 102 UNION SELECT 103) WHERE ${condition}
    `).bind(...params).all();
    assert.deepEqual(check.results.map(r => r.dimension_id), [103]);
  });

  test('"none" scope resolves to zero rows -- never falls back to allow-all', async () => {
    const { condition, params } = await getAccessibleIdCondition(db, fx.editorNone, 'casinos', 'read', 'dimension_id');
    assert.equal(condition, '1=0');
    const check = await db.prepare(`
      SELECT id AS dimension_id FROM (SELECT 101 AS id UNION SELECT 102 UNION SELECT 103) WHERE ${condition}
    `).bind(...params).all();
    assert.equal(check.results.length, 0);
  });

  test('no user (null) denies everything rather than throwing', async () => {
    const { condition } = await getAccessibleIdCondition(db, null, 'casinos', 'read', 'dimension_id');
    assert.equal(condition, '1=0');
  });

  test('the returned condition is ALWAYS a non-empty valid SQL fragment (never empty string)', async () => {
    for (const user of [fx.admin, fx.editorAssigned, fx.editorOwn, fx.editorNone]) {
      const { condition, params } = await getAccessibleIdCondition(db, user, 'casinos', 'read', 'dimension_id');
      assert.ok(condition && condition.length > 0, `condition was empty for user ${user.user_id}`);
      // Splicing "AND <condition>" must always be syntactically valid --
      // this is the exact bug class the analytics.js rewrite fixed.
      // Needs a FROM clause supplying a `dimension_id` column since the
      // condition references one by name.
      await db.prepare(`
        SELECT 1 AS ok FROM (SELECT 101 AS dimension_id) WHERE 1=1 AND ${condition}
      `).bind(...params).all().catch(e => {
        throw new Error(`condition "${condition}" is not valid SQL: ${e.message}`);
      });
    }
  });
});

describe('getAccessibleWhereClause (used for querying the resource\'s OWN table directly)', () => {
  let db, fx;
  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    fx = await seedBaseFixtures(db);
  });

  test('scopes a direct query against casinos itself, not a derived table', async () => {
    const { condition, params } = await getAccessibleWhereClause(db, fx.editorAssigned, 'casinos', 'read');
    const result = await db.prepare(`SELECT id FROM casinos WHERE ${condition || '1=1'}`).bind(...params).all();
    assert.deepEqual(result.results.map(r => r.id), [101]);
  });
});
