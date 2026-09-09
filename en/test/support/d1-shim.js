// test/support/d1-shim.js
//
// A minimal, D1-API-compatible wrapper around Node's built-in
// node:sqlite (Node 22+, no npm install required). This exists
// because this repository has NO test framework, NO package.json, and
// no network access to install one (@cloudflare/vitest-pool-workers,
// the real way to test Workers+D1, requires npm). Rather than skip
// tests entirely or write fake ones, this shim lets the ACTUAL worker
// database modules run against a real (in-memory) SQLite database
// through the exact same .prepare(sql).bind(...).all()/.first()/.run()
// interface they call in production against D1.
//
// Known limitations (documented, not hidden):
// - D1 is SQLite-based but not byte-for-byte identical (subtle dialect
//   differences can exist between D1's engine version and node:sqlite's
//   bundled SQLite). Every query used by this codebase's analytics/
//   reports/alerts modules was manually verified to work identically
//   under node:sqlite (FILTER clause, ON CONFLICT upsert, date()) --
//   see the verification run in the commit that added this file.
// - No KV, R2, or Workers runtime globals (crypto.randomUUID IS
//   available in Node 22, so that one just works).
// - .run() returns { success: true, meta: { last_row_id, changes } },
//   matching D1's shape closely enough for the code under test, but is
//   not a guarantee of exact parity with every D1 meta field.
//
// This is a testing aid, not a claim that passing these tests
// guarantees identical behavior on real D1 -- it substantially reduces
// risk on the logic that matters most (item-access scoping, KPI math,
// aggregation correctness) without needing network access.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations');

/**
 * Wraps a node:sqlite prepared-statement handle so it matches D1's
 * PreparedStatement API (bind returns a bindable, chainable object;
 * .all()/.first()/.run() are async in D1 -- kept async here too so
 * calling code doesn't need to know the difference).
 */
function wrapStatement(sqliteDb, sql) {
  return {
    bind(...params) {
      const stmt = sqliteDb.prepare(sql);
      const boundParams = params.map(p => (p === undefined ? null : p));
      return {
        async all() {
          const rows = stmt.all(...boundParams);
          return { results: rows, success: true };
        },
        async first() {
          const row = stmt.get(...boundParams);
          return row === undefined ? null : row;
        },
        async run() {
          const result = stmt.run(...boundParams);
          return {
            success: true,
            meta: { last_row_id: Number(result.lastInsertRowid), changes: result.changes }
          };
        }
      };
    },
    // Some call sites in this codebase call .all()/.first()/.run()
    // directly on the prepared statement with no .bind() when there
    // are no parameters -- support that too.
    async all() { return this.bind().all(); },
    async first() { return this.bind().first(); },
    async run() { return this.bind().run(); }
  };
}

export function createTestDb() {
  const sqliteDb = new DatabaseSync(':memory:');
  sqliteDb.exec('PRAGMA foreign_keys = OFF;'); // D1 doesn't enforce FKs by default either

  return {
    prepare(sql) {
      return wrapStatement(sqliteDb, sql);
    },
    // exposed for fixture setup that wants raw exec (multi-statement
    // migration files) rather than the single-statement .prepare() path
    _exec(sql) {
      sqliteDb.exec(sql);
    },
    _raw: sqliteDb
  };
}

/**
 * Runs every migration file in /migrations, in filename order, against
 * a fresh test DB -- so tests run against the REAL schema, not a
 * hand-maintained copy that could drift from it.
 */
/**
 * Runs every migration file in /migrations, in filename order, against
 * a fresh test DB -- so tests run against the REAL schema, not a
 * hand-maintained copy that could drift from it.
 *
 * This repository has NO automated D1 migration tracking (no
 * migrations_dir/d1_migrations table in wrangler config) -- every
 * migration is applied by hand, per tenant database (there are 7+
 * separate tenant DBs sharing this codebase), via individual
 * `wrangler d1 execute`. That means schema.sql (a periodically
 * re-exported full-schema snapshot) and the numbered migration files
 * can legitimately overlap -- e.g. schema.sql already contains a
 * column that 0002_phase2_upgrade.sql also tries to ADD, because
 * schema.sql was re-exported from a DB where 0002 had already run.
 * Running schema.sql followed by every numbered migration (the only
 * way to test against the actual current full schema, since no single
 * file is guaranteed current for every tenant) surfaces exactly the
 * "duplicate column"/"table already exists" errors a human operator
 * re-running an already-applied migration against one tenant's DB
 * would also hit -- so those specific error classes are tolerated
 * per-statement here, matching the real operational reality of this
 * codebase, while any OTHER SQL error still fails loudly (that's a
 * real bug, not drift).
 */
export function applyMigrations(testDb) {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    // Rollback scripts (e.g. 0008_media_r2_rollback.sql) are manual,
    // opt-in undo scripts -- never part of the standard forward
    // migration sequence. Auto-running one here would undo an upgrade
    // migration that later migrations may depend on.
    .filter(f => !f.toLowerCase().includes('rollback'));

  // schema.sql is the baseline and must run FIRST regardless of
  // filename sort order -- alphabetically 's' (0x73) sorts after every
  // digit (0x30-0x39), so a plain .sort() would run every numbered
  // migration against tables that don't exist yet.
  const ordered = [
    ...files.filter(f => f === 'schema.sql'),
    ...files.filter(f => f !== 'schema.sql').sort() // zero-padded numeric prefixes, e.g. 0026_..., so lexical sort == numeric order
  ];

  const tolerated = /duplicate column name|already exists/i;

  for (const file of ordered) {
    const rawSql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
    // Strip `-- ...` line comments before splitting on ';' -- several
    // migration files have prose comments that themselves contain a
    // semicolon mid-sentence (e.g. "...won't fire automatically unless
    // PRAGMA foreign_keys=ON; a defensive cleanup helper is also..."),
    // which would otherwise break a naive statement split. None of
    // these files are known to use '--' inside an actual string
    // literal (they're DDL/seed-data files, not user content), so this
    // is safe for this specific migration set.
    const sql = rawSql.split('\n').map(line => {
      const idx = line.indexOf('--');
      return idx === -1 ? line : line.slice(0, idx);
    }).join('\n');

    const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
    for (const statement of statements) {
      try {
        testDb._exec(statement + ';');
      } catch (e) {
        if (tolerated.test(e.message)) continue;
        throw new Error(`Migration ${file} failed against the test DB on statement:\n${statement}\n\n${e.message}`);
      }
    }
  }
}
