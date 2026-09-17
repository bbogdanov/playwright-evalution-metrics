import { expect, test } from '../harness/fixtures';
import { BY_ID } from '../locators/strategies';
import { describeTarget } from '../locators/describe';

/**
 * S11 - does any of this matter at suite scale?
 *
 * Micro benchmarks answer "how long does this query take". They cannot answer
 * "would switching strategy change my CI bill", because a real test spends most
 * of its time navigating, rendering and acting. This scenario runs the same
 * realistic flow end to end with one strategy family at a time and lets the wall
 * clock decide.
 *
 * The flow is deliberately ordinary: load a grid, interact with a spread of
 * cells, assert as you go. It is driven by tools/run-suite-scale.mjs, which
 * invokes it once per strategy and records the durations.
 *
 * If the totals come out within noise of each other, that is a result worth
 * publishing, and it is the honest counterweight to the five-orders-of-magnitude
 * spread the micro benchmarks show.
 */

test.use({ scenario: 'S11' });

const STRATEGY_ID = process.env.BM_SUITE_STRATEGY ?? 'testid.api';
const ROWS = Number(process.env.BM_SUITE_ROWS ?? 800);
const COLS = 6;
const INTERACTIONS = Number(process.env.BM_SUITE_INTERACTIONS ?? 20);

test(`S11 suite flow | strategy=${STRATEGY_ID} rows=${ROWS}`, async ({ bench, page }) => {
  const strategy = BY_ID.get(STRATEGY_ID);
  test.skip(!strategy, `unknown strategy ${STRATEGY_ID}`);

  const t0 = Date.now();
  const state = await bench.goto('grid', { rows: ROWS, cols: COLS, seed: 'bm-v1' });
  const navMs = Date.now() - t0;

  // Spread the interactions across the grid rather than clustering them at the
  // top, where a document-order engine would short-circuit every time.
  const targets = Array.from({ length: INTERACTIONS }, (_, i) =>
    Math.floor(((i + 0.5) / INTERACTIONS) * ROWS),
  );

  const perAction: number[] = [];
  const tFlow = Date.now();
  for (const row of targets) {
    const descriptor = await describeTarget(page, `cell-r${row}-c2`);
    if (!descriptor.found || !strategy!.applicable(descriptor)) continue;
    const a0 = Date.now();
    await strategy!.build(page, descriptor).first().click();
    perAction.push(Date.now() - a0);
  }
  const flowMs = Date.now() - tFlow;

  await expect(page.getByTestId('status.click-count')).toHaveText(String(perAction.length));

  bench.emitRaw({
    strategyId: STRATEGY_ID,
    family: strategy!.family,
    metric: 'suite_flow_ms',
    samples: perAction,
    ok: true,
    dims: {
      rows: ROWS,
      cols: COLS,
      interactions: perAction.length,
      domNodes: state.domNodes,
      navMs,
      flowMs,
      totalMs: Date.now() - t0,
      // The share of a realistic flow that locator resolution could possibly
      // account for. This is the number that decides how much speed deserves to
      // weigh in the composite.
      flowShare: Number((flowMs / Math.max(1, Date.now() - t0)).toFixed(4)),
    },
  });
});
