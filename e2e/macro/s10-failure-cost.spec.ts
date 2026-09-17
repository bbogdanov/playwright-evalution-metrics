import { expect, test } from '../harness/fixtures';
import { BY_ID, type Strategy } from '../locators/strategies';
import { timeOnceSettled } from '../harness/measure';
import type { TargetDescriptor } from '../locators/describe';
import { MACRO_SET } from './macro-set';

/**
 * S10 - what a broken locator costs.
 *
 * The scenario most benchmarks skip, and the one most likely to dominate real CI
 * bills. A locator that resolves in 0.01ms and a locator that resolves in 5ms are
 * indistinguishable in a suite's wall clock. A locator that resolves to nothing
 * costs the full timeout — by default 30 seconds — every time it runs, and a
 * locator that resolves to two elements fails the run outright.
 *
 * Two failure modes are measured:
 *
 *   miss    the locator matches nothing. Cost is the timeout; the question is
 *           whether the error names what was being looked for.
 *   strict  the locator matches several elements. Playwright refuses to guess.
 *           Cost should be near zero, and the error should say what it found.
 *
 * Error legibility is scored rather than described: does the message contain the
 * selector, the match count, and a suggestion? That is what determines whether a
 * failure costs a developer thirty seconds or thirty minutes.
 */

test.use({ scenario: 'S10' });

const TIMEOUT_MS = 4_000;

/** Corrupts the descriptor so every strategy built from it matches nothing. */
function makeUnmatchable(t: TargetDescriptor): TargetDescriptor {
  const tag = 'zzznomatch';
  return {
    ...t,
    domId: `${t.domId}-${tag}`,
    testId: `${t.testId}.${tag}`,
    qaId: `${t.qaId}${tag}`,
    accessibleName: `${t.accessibleName} ${tag}`,
    text: `${t.text}-${tag}`,
    semanticClass: `${t.semanticClass}-${tag}`,
    variantClass: `${t.variantClass}-${tag}`,
    hashedClass: `_ffffff`,
    cssChain: `${t.cssChain}.${tag}`,
    cssChainScoped: `${t.cssChainScoped}.${tag}`,
    xpathAbs: `${t.xpathAbs}/${tag}`,
    xpathRel: `//${tag}[@id="nope"]`,
    scopeTestId: t.scopeTestId,
  };
}

/** Rates how much the failure message tells a developer, 0..3. */
function legibility(message: string, strategy: Strategy): number {
  let score = 0;
  if (/waiting for|locator|selector/i.test(message)) score++;
  if (message.includes('resolved to') || /\d+ elements?/.test(message)) score++;
  if (message.length > 60 && !/^Timeout \d+ms exceeded\.?$/.test(message.trim())) score++;
  void strategy;
  return score;
}

test('S10 failure cost | locator matches nothing', async ({ bench, page }) => {
  const state = await bench.goto('grid', { rows: 400, cols: 6, seed: 'bm-v1' });
  const real = await bench.describe('cell-r200-c2');
  expect(real.found).toBe(true);
  const broken = makeUnmatchable(real);

  for (const id of MACRO_SET) {
    const strategy = BY_ID.get(id)!;
    if (!strategy.applicable(broken)) continue;

    const locator = strategy.build(page, broken);
    const result = await timeOnceSettled(() => locator.click({ timeout: TIMEOUT_MS }));
    expect(result.ok, `${id} was supposed to fail but matched something`).toBe(false);

    bench.emitRaw({
      strategyId: id,
      family: strategy.family,
      metric: 'failure_miss_ms',
      samples: [result.ms],
      target: real,
      matches: 0,
      ok: false,
      error: result.error,
      dims: {
        failureMode: 'miss',
        timeoutMs: TIMEOUT_MS,
        domNodes: state.domNodes,
        errorChars: (result.error ?? '').length,
        legibility: legibility(result.error ?? '', strategy),
      },
    });
  }
});

test('S10 failure cost | locator matches several elements', async ({ bench, page }) => {
  // 300 identical cards: every non-identity strategy collides here.
  const CARDS = 300;
  const state = await bench.goto('ambiguous', { dup: CARDS });
  const target = await bench.describe(`action-r${Math.floor(CARDS / 2)}`);
  expect(target.found).toBe(true);

  for (const id of MACRO_SET) {
    const strategy = BY_ID.get(id)!;
    if (!strategy.applicable(target)) continue;

    const locator = strategy.build(page, target);
    const matches = await locator.count();
    const result = await timeOnceSettled(() => locator.click({ timeout: TIMEOUT_MS }));

    bench.emitRaw({
      strategyId: id,
      family: strategy.family,
      metric: 'failure_strict_ms',
      samples: [result.ms],
      target,
      matches,
      ok: result.ok,
      error: result.error,
      dims: {
        failureMode: matches > 1 ? 'strict' : 'unique',
        cards: CARDS,
        timeoutMs: TIMEOUT_MS,
        domNodes: state.domNodes,
        errorChars: (result.error ?? '').length,
        legibility: result.error ? legibility(result.error, strategy) : 3,
      },
    });
  }
});
