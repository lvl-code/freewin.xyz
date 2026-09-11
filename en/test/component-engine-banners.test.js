// test/component-engine-banners.test.js
//
// Verifies the batching design specifically: N banner components on one
// page produce exactly ONE ctx.waitUntil registration (not N), while
// still logging N real analytics_events rows underneath it.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { renderAllInjectionPoints, renderPageComponents } from '../worker/component-engine.js';

// Minimal fake Renderer -- component-engine.js only calls
// loadTemplate()/replaceVariables() on it. Returns a template that
// just echoes back the title, enough to prove rendering itself still
// works unmodified.
const fakeRenderer = {
  async loadTemplate(name) { return '<div>{{title}}</div>'; },
  replaceVariables(template, data) { return template.replace('{{title}}', data.title || ''); }
};

// Captures every ctx.waitUntil call so tests can assert on COUNT
// (the batching claim) as well as eventually awaiting the underlying
// work to confirm the DB rows actually landed.
function makeTrackingCtx() {
  const calls = [];
  return {
    waitUntil(promise) { calls.push(promise); },
    calls
  };
}

async function insertComponent(db, { id, type, name = 'test', title = null }) {
  await db.prepare(`INSERT INTO components (id, name, type, title, status) VALUES (?, ?, ?, ?, 'active')`).bind(id, name, type, title ?? name).run();
}
async function assignToPage(db, { componentId, pageType, pageSlug, injectionPoint = 'content_bottom', position = 0 }) {
  await db.prepare(`
    INSERT INTO page_components (page_type, page_slug, component_id, position, injection_point, enabled)
    VALUES (?, ?, ?, ?, ?, 1)
  `).bind(pageType, pageSlug, componentId, position, injectionPoint).run();
}

describe('BANNER_VIEW logging -- batched, not one write registration per banner', () => {
  let db;
  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
  });

  test('renderAllInjectionPoints: 3 banners on one page = exactly 1 ctx.waitUntil call, 3 analytics_events rows', async () => {
    await insertComponent(db, { id: 1, type: 'banner', name: 'Top Banner' });
    await insertComponent(db, { id: 2, type: 'banner', name: 'Sidebar Banner' });
    await insertComponent(db, { id: 3, type: 'banner', name: 'Bottom Banner' });
    await insertComponent(db, { id: 4, type: 'text', name: 'Some text block' }); // non-banner control
    await assignToPage(db, { componentId: 1, pageType: 'casino', pageSlug: 'test-casino', injectionPoint: 'top' });
    await assignToPage(db, { componentId: 2, pageType: 'casino', pageSlug: 'test-casino', injectionPoint: 'sidebar' });
    await assignToPage(db, { componentId: 3, pageType: 'casino', pageSlug: 'test-casino', injectionPoint: 'bottom' });
    await assignToPage(db, { componentId: 4, pageType: 'casino', pageSlug: 'test-casino', injectionPoint: 'content_bottom' });

    const ctx = makeTrackingCtx();
    const rendered = await renderAllInjectionPoints(fakeRenderer, db, 'casino', 'test-casino', ctx);

    // Rendering itself is unaffected by the analytics addition.
    assert.ok(rendered.top.includes('Top Banner'));
    assert.ok(rendered.content_bottom.includes('Some text block'));

    assert.equal(ctx.calls.length, 1, 'expected exactly ONE batched waitUntil call for all banners on the page');

    await Promise.all(ctx.calls); // let the batched inserts actually finish

    const events = await db.prepare(`SELECT * FROM analytics_events WHERE event_type = 'BANNER_VIEW'`).all();
    assert.equal(events.results.length, 3, 'expected 3 BANNER_VIEW rows -- one per banner component, not per injection point or page load');
  });

  test('a page with NO banners registers zero waitUntil calls -- no wasted work', async () => {
    await insertComponent(db, { id: 1, type: 'text', name: 'Just text' });
    await assignToPage(db, { componentId: 1, pageType: 'casino', pageSlug: 'no-banners-here' });

    const ctx = makeTrackingCtx();
    await renderAllInjectionPoints(fakeRenderer, db, 'casino', 'no-banners-here', ctx);

    assert.equal(ctx.calls.length, 0);
  });

  test('no ctx supplied (e.g. a future direct test call) never throws -- fails soft, same as every other analytics call site', async () => {
    await insertComponent(db, { id: 1, type: 'banner', name: 'Banner' });
    await assignToPage(db, { componentId: 1, pageType: 'casino', pageSlug: 'no-ctx-test' });

    await assert.doesNotReject(() => renderAllInjectionPoints(fakeRenderer, db, 'casino', 'no-ctx-test', null));
  });

  test('renderPageComponents (single-injection-point variant) also batches correctly', async () => {
    await insertComponent(db, { id: 1, type: 'banner', name: 'Banner A' });
    await insertComponent(db, { id: 2, type: 'banner', name: 'Banner B' });
    await assignToPage(db, { componentId: 1, pageType: 'review', pageSlug: 'test-review', injectionPoint: 'content_bottom' });
    await assignToPage(db, { componentId: 2, pageType: 'review', pageSlug: 'test-review', injectionPoint: 'content_bottom' });

    const ctx = makeTrackingCtx();
    await renderPageComponents(fakeRenderer, db, 'review', 'test-review', 'content_bottom', ctx);

    assert.equal(ctx.calls.length, 1);
    await Promise.all(ctx.calls);

    const events = await db.prepare(`SELECT * FROM analytics_events WHERE event_type = 'BANNER_VIEW'`).all();
    assert.equal(events.results.length, 2);
  });

  test('logged metadata identifies which component and page, without fabricating a casino/review/etc. FK it does not actually have', async () => {
    await insertComponent(db, { id: 1, type: 'banner', name: 'Identifiable Banner' });
    await assignToPage(db, { componentId: 1, pageType: 'casino', pageSlug: 'metadata-check' });

    const ctx = makeTrackingCtx();
    await renderAllInjectionPoints(fakeRenderer, db, 'casino', 'metadata-check', ctx);
    await Promise.all(ctx.calls);

    const row = await db.prepare(`SELECT * FROM analytics_events WHERE event_type = 'BANNER_VIEW'`).first();
    assert.equal(row.casino_id, null, 'no casino_id FK should be fabricated -- this function only knows pageType/pageSlug');
    const metadata = JSON.parse(row.metadata);
    assert.equal(metadata.componentId, 1);
    assert.equal(metadata.pageType, 'casino');
    assert.equal(metadata.pageSlug, 'metadata-check');
  });
});
