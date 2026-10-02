import { expect, test, type Locator, type Page } from '@playwright/test';
import { MAX_RUNS, MAX_SAMPLES, measureNoiseFloor, measurePaired } from '../harness/measure';

/**
 * The harness never runs one operation more than MAX_RUNS times on a static
 * page. Counted with stub locators, so it checks the loops, not the browser.
 */
function stub(costMs = 0): { locator: Locator; calls: () => number } {
  let n = 0;
  const run = async () => {
    n++;
    if (costMs) await new Promise((r) => setTimeout(r, costMs));
    return 1;
  };
  const locator = { count: run, first: () => ({ evaluate: run }) } as unknown as Locator;
  return { locator, calls: () => n };
}

function page(baseline: Locator): Page {
  return { locator: () => baseline } as unknown as Page;
}

test('MAX_RUNS is 10 and leaves 8 recorded samples', () => {
  expect(MAX_RUNS).toBe(10);
  expect(MAX_SAMPLES).toBe(8);
});

for (const warmedUp of [false, true]) {
  test(`paired measurement stays within MAX_RUNS (warmedUp=${warmedUp})`, async () => {
    const base = stub();
    const target = stub();
    // A request for far more samples than allowed is clamped, not honoured.
    const r = await measurePaired(page(base.locator), target.locator, { reps: 500, warmedUp });
    const callerCount = warmedUp ? 1 : 0;
    expect(target.calls() + callerCount).toBeLessThanOrEqual(MAX_RUNS);
    expect(base.calls()).toBeLessThanOrEqual(MAX_RUNS);
    expect(r.samples).toHaveLength(MAX_SAMPLES);
  });
}

test('resolveFirst is capped the same way', async () => {
  const base = stub();
  const target = stub();
  await measurePaired(page(base.locator), target.locator, { op: 'resolveFirst' });
  expect(target.calls()).toBeLessThanOrEqual(MAX_RUNS);
});

test('the time budget can lower the count but never below MIN_REPS', async () => {
  const base = stub();
  const target = stub(20);
  const r = await measurePaired(page(base.locator), target.locator, { budgetMs: 10 });
  expect(r.samples).toHaveLength(5);
  expect(r.budgetLimited).toBe(true);
});

test('a probe over probeOnlyAboveMs is the only execution', async () => {
  const base = stub();
  const target = stub(30);
  const r = await measurePaired(page(base.locator), target.locator, { probeOnlyAboveMs: 10 });
  expect(target.calls()).toBe(1);
  expect(r.probeOnly).toBe(true);
});

test('noise floor stays within MAX_RUNS', async () => {
  const base = stub();
  const r = await measureNoiseFloor(page(base.locator));
  expect(base.calls()).toBeLessThanOrEqual(MAX_RUNS);
  expect(r.deltas).toHaveLength(4);
});
