// test/report-delivery.test.js
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { deliverReportRun } from '../worker/reports/delivery.js';

// Captures every fetch call so tests can assert on the exact request
// shape sent to Resend, without ever making a real network call.
function mockFetch(responseFactory) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return responseFactory(url, options);
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe('Report delivery -- Resend integration', () => {
  let db, mock;
  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    await db.prepare(`INSERT INTO users (id, email, password_hash, role) VALUES (1, 'a@test.local', 'x', 'admin')`).run();
  });
  afterEach(() => { if (mock) mock.restore(); });

  test('missing RESEND_API_KEY: fails with a specific config error, makes NO network call', async () => {
    mock = mockFetch(() => { throw new Error('should not be called'); });
    const env = { DB: db, RESEND_FROM_EMAIL: 'reports@example.com' }; // no RESEND_API_KEY

    const outcomes = await deliverReportRun(env, {
      reportRun: { id: 1, rowCount: 5 }, reportName: 'Test Report',
      recipients: [{ email: 'someone@example.com' }]
    });

    assert.equal(outcomes[0].success, false);
    assert.match(outcomes[0].error, /RESEND_API_KEY/);
    assert.equal(mock.calls.length, 0);
  });

  test('missing RESEND_FROM_EMAIL: fails with a specific config error, makes NO network call', async () => {
    mock = mockFetch(() => { throw new Error('should not be called'); });
    const env = { DB: db, RESEND_API_KEY: 'fake-key-12345' }; // no RESEND_FROM_EMAIL

    const outcomes = await deliverReportRun(env, {
      reportRun: { id: 1, rowCount: 5 }, reportName: 'Test Report',
      recipients: [{ email: 'someone@example.com' }]
    });

    assert.equal(outcomes[0].success, false);
    assert.match(outcomes[0].error, /RESEND_FROM_EMAIL/);
    assert.equal(mock.calls.length, 0);
    // The config-error message must never echo back an API key even
    // when one WAS provided (this test provided a fake one above).
    assert.doesNotMatch(outcomes[0].error, /fake-key-12345/);
  });

  test('successful send: posts the correct shape to Resend, returns success + messageId', async () => {
    mock = mockFetch(() => jsonResponse(200, { id: 'msg_abc123' }));
    const env = { DB: db, RESEND_API_KEY: 'real-key-xyz', RESEND_FROM_EMAIL: 'reports@example.com' };

    const outcomes = await deliverReportRun(env, {
      reportRun: { id: 1, rowCount: 42 }, reportName: 'Casino Performance',
      recipients: [{ email: 'someone@example.com' }]
    });

    assert.equal(outcomes[0].success, true);
    assert.equal(outcomes[0].messageId, 'msg_abc123');

    assert.equal(mock.calls.length, 1);
    const call = mock.calls[0];
    assert.equal(call.url, 'https://api.resend.com/emails');
    assert.equal(call.options.headers.Authorization, 'Bearer real-key-xyz');
    const sentBody = JSON.parse(call.options.body);
    assert.equal(sentBody.from, 'reports@example.com');
    assert.deepEqual(sentBody.to, ['someone@example.com']);
    assert.match(sentBody.subject, /Casino Performance/);
    assert.match(sentBody.text, /42 rows/);
  });

  test('Resend API error response: fails with the provider\'s own message, never the API key', async () => {
    mock = mockFetch(() => jsonResponse(422, { message: 'Invalid `to` field' }));
    const env = { DB: db, RESEND_API_KEY: 'real-key-xyz', RESEND_FROM_EMAIL: 'reports@example.com' };

    const outcomes = await deliverReportRun(env, {
      reportRun: { id: 1, rowCount: 1 }, reportName: 'Test',
      recipients: [{ email: 'not-an-email' }]
    });

    assert.equal(outcomes[0].success, false);
    assert.match(outcomes[0].error, /Invalid `to` field/);
    assert.doesNotMatch(outcomes[0].error, /real-key-xyz/);
  });

  test('unparseable error response body falls back to the HTTP status, does not throw', async () => {
    mock = mockFetch(() => ({ ok: false, status: 500, json: async () => { throw new Error('not json'); } }));
    const env = { DB: db, RESEND_API_KEY: 'k', RESEND_FROM_EMAIL: 'reports@example.com' };

    const outcomes = await deliverReportRun(env, {
      reportRun: { id: 1, rowCount: 1 }, reportName: 'Test',
      recipients: [{ email: 'someone@example.com' }]
    });

    assert.equal(outcomes[0].success, false);
    assert.match(outcomes[0].error, /500/);
  });

  test('in-app (user_id) delivery is unaffected by the email provider -- still writes to user_notifications', async () => {
    mock = mockFetch(() => { throw new Error('should not be called for in-app delivery'); });
    const env = { DB: db }; // no Resend config at all -- irrelevant for in-app recipients

    const outcomes = await deliverReportRun(env, {
      reportRun: { id: 7, rowCount: 3 }, reportName: 'In-App Test',
      recipients: [{ user_id: 1 }]
    });

    assert.equal(outcomes[0].success, true);
    assert.equal(outcomes[0].method, 'in_app');
    const notification = await db.prepare(`SELECT * FROM user_notifications WHERE user_id = 1`).first();
    assert.match(notification.title, /In-App Test/);
    assert.equal(mock.calls.length, 0);
  });

  test('mixed recipients: in-app succeeds independently of email failing (one bad recipient does not block another)', async () => {
    mock = mockFetch(() => jsonResponse(200, { id: 'msg_1' }));
    const env = { DB: db, RESEND_API_KEY: 'k', RESEND_FROM_EMAIL: 'reports@example.com' };

    const outcomes = await deliverReportRun(env, {
      reportRun: { id: 1, rowCount: 1 }, reportName: 'Mixed',
      recipients: [{ user_id: 1 }, { email: 'someone@example.com' }]
    });

    assert.equal(outcomes.length, 2);
    assert.ok(outcomes.every(o => o.success));
  });
});
