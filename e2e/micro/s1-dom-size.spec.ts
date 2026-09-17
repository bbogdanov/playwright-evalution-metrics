import { test } from '../harness/fixtures';
import { applicable } from '../locators/strategies';

/**
 * S1 - query cost as a function of DOM size.
 *
 * The primary question: does locator choice cost measurable time, and does that
 * cost scale with the size of the document?
 *
 * Design notes that determine whether the answer means anything:
 *
 *  - One target, addressed every way. The descriptor is read back out of the
 *    rendered element, so all 20-odd strategies resolve to the same physical
 *    node at the same depth in the same subtree.
 *  - The target sits in the middle row. First and last are short-circuit cases
 *    for some engines, and picking either would flatter or punish whole families
 *    for reasons unrelated to how they are used in practice.
 *  - Every sample is paired against a trivial locator run immediately before it,
 *    and the pair is subtracted. Without that, most of what is recorded is the
 *    CDP round trip.
 *  - The native-DOM floor is captured alongside, so Playwright's own engine
 *    overhead is separable from the cost of the query itself.
 */

test.use({ scenario: 'S1' });

const COLS = 6;

/**
 * Chosen to span three orders of magnitude of element count on the same markup.
 *
 * `probeOnlyAbove` tightens with tier size. At the largest tier two strategies
 * cost over a minute per query, and sampling those properly would take longer
 * than the entire rest of the study; a single probe is enough to establish an
 * effect of that size. The threshold is part of the recorded configuration so
 * the run is reproducible.
 */
const TIERS = [
  { name: 'xs', rows: 20, reps: 40, probeOnlyAbove: 10_000 },
  { name: 's', rows: 200, reps: 40, probeOnlyAbove: 10_000 },
  { name: 'm', rows: 1_500, reps: 30, probeOnlyAbove: 5_000 },
  { name: 'l', rows: 6_000, reps: 15, probeOnlyAbove: 3_000 },
] as const;

for (const tier of TIERS) {
  test(`S1 query cost | tier=${tier.name} rows=${tier.rows}`, async ({ bench, page }) => {
    const state = await bench.goto('grid', { rows: tier.rows, cols: COLS, seed: 'bm-v1' });

    const targetRow = Math.floor(tier.rows / 2);
    const target = await bench.describe(`cell-r${targetRow}-c2`);
    test.expect(target.found, 'target element must exist before measuring').toBe(true);

    const dims = {
      tier: tier.name,
      rows: tier.rows,
      cols: COLS,
      domNodes: state.domNodes,
      targetRow,
      position: 'middle',
    };

    // Establish what a difference has to beat on this page before believing one.
    await bench.measureNoiseFloor(dims);

    for (const strategy of applicable(target)) {
      await bench.measureStrategy({
        strategy, target, dims,
        options: { reps: tier.reps, probeOnlyAboveMs: tier.probeOnlyAbove },
      });
      await bench.measureFloor(strategy, target, dims);
    }

    // Mechanism profiling runs once, on the small tier only. It answers what work
    // the query causes rather than how long it takes, and the per-candidate event
    // counts that answer it are the same at any page size - so there is no reason
    // to pay for it at 120,000 nodes, where tracing every strategy would cost more
    // than the rest of the scenario combined.
    if (tier.name === 's') {
      for (const strategy of applicable(target)) {
        await bench.measureMechanism(strategy, target, dims);
      }
    }

    // The same strategies again, resolving a single handle rather than counting
    // every match. This is the shape an action takes, and for ambiguous locators
    // it is dramatically cheaper than count() - which is exactly why count-based
    // microbenchmarks overstate how bad a broad class selector is in practice.
    for (const strategy of applicable(target)) {
      await bench.measureStrategy({
        strategy, target,
        dims: { ...dims, op: 'resolveFirst' },
        options: {
          reps: tier.reps, op: 'resolveFirst', probeOnlyAboveMs: tier.probeOnlyAbove,
        },
        metric: 'resolve_first_ms',
      });
    }
  });
}
