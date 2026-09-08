// test/kpi-math.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { safeDivide, computeKpis } from '../worker/database/analytics.js';

describe('safeDivide', () => {
  test('normal division', () => {
    assert.equal(safeDivide(10, 4), 2.5);
  });

  test('zero denominator returns 0, not NaN or Infinity', () => {
    assert.equal(safeDivide(10, 0), 0);
    assert.equal(Number.isFinite(safeDivide(10, 0)), true);
  });

  test('zero numerator returns 0', () => {
    assert.equal(safeDivide(0, 10), 0);
  });

  test('null/undefined inputs never produce NaN', () => {
    assert.equal(safeDivide(null, null), 0);
    assert.equal(safeDivide(undefined, 5), 0);
    assert.equal(safeDivide(5, null), 0);
    assert.ok(!Number.isNaN(safeDivide(null, undefined)));
  });

  test('zero over zero is 0, not NaN', () => {
    assert.equal(safeDivide(0, 0), 0);
  });
});

describe('computeKpis', () => {
  test('normal case computes all ratios correctly', () => {
    const kpis = computeKpis({ views: 1000, clicks: 100, conversions: 10, revenue: 500, commission: 50 });
    assert.equal(kpis.ctr, 0.1);
    assert.equal(kpis.cvr, 0.1);
    assert.equal(kpis.epc, 0.5);
    assert.equal(kpis.rpc, 5);
    assert.equal(kpis.cpa, 5);
    assert.equal(kpis.rpm, 500); // (500/1000)*1000
  });

  test('all-zero input never produces NaN/Infinity anywhere', () => {
    const kpis = computeKpis({ views: 0, clicks: 0, conversions: 0, revenue: 0, commission: 0 });
    for (const [key, value] of Object.entries(kpis)) {
      assert.ok(Number.isFinite(value), `${key} was not finite: ${value}`);
    }
  });

  test('clicks with zero views (CTR denominator zero) does not throw or NaN', () => {
    const kpis = computeKpis({ views: 0, clicks: 5, conversions: 1, revenue: 10, commission: 1 });
    assert.equal(kpis.ctr, 0); // can't compute CTR without views -- 0, not NaN
    assert.equal(Number.isFinite(kpis.ctr), true);
  });

  test('missing fields default to 0 rather than throwing', () => {
    const kpis = computeKpis({});
    assert.equal(kpis.views, 0);
    assert.equal(kpis.ctr, 0);
  });
});
