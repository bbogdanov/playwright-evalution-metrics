import { expect, test } from '../harness/fixtures';
import { applicable } from '../locators/strategies';
import { DEEP, FILLERS, SHALLOW, fillFor } from './shape';

/**
 * S15 query - what every strategy costs at depth 50 and ~5,000 elements.
 *
 * Every strategy in the matrix against the leaf at the bottom of a 50-level page,
 * then again against the same leaf on a 5-level page carrying the same number of
 * elements. The pair answers the question this scenario exists for: at this size,
 * does depth on its own cost anything, and for which locators?
 *
 * Both `count()` (every match) and resolve-first (the shape an action takes) are
 * measured, because the structural engines can short-circuit on the second and
 * not on the first.
 */

test.use({ scenario: 'S15' });

for (const depth of [SHALLOW, DEEP]) {
  test(`S15 query | depth=${depth} with ${FILLERS} fillers`, async ({ bench }) => {
    const state = await bench.goto('deep', { depth, fill: fillFor(depth) });

    const target = await bench.describe(`leaf-r${depth}`);
    expect(target.found).toBe(true);
    expect(target.depth, 'target depth must track the requested nesting').toBeGreaterThan(depth);

    const dims = {
      part: 'query',
      requestedDepth: depth,
      fill: fillFor(depth),
      fillers: FILLERS,
      domNodes: state.domNodes,
      renderMs: state.renderMs ?? -1,
    };

    await bench.measureNoiseFloor(dims);

    for (const strategy of applicable(target)) {
      await bench.measureStrategy({
        strategy, target, dims,
        options: { probeOnlyAboveMs: 5_000 },
      });
      await bench.measureFloor(strategy, target, dims);
    }

    for (const strategy of applicable(target)) {
      await bench.measureStrategy({
        strategy, target,
        dims: { ...dims, op: 'resolveFirst' },
        options: { op: 'resolveFirst', probeOnlyAboveMs: 5_000 },
        metric: 'resolve_first_ms',
      });
    }
  });
}
