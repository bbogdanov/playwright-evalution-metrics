import { expect, test } from '../harness/fixtures';
import { applicable } from '../locators/strategies';

/**
 * S12 - does depth cost anything, independently of page size?
 *
 * S1 varies element count while depth stays fixed. This scenario does the
 * opposite: the total element count is held constant and only the number of
 * levels between <body> and the target changes. Without that control, "deep
 * elements are slow" is unfalsifiable, because deeper pages are usually also
 * bigger pages.
 *
 * The fillers are real buttons with distinct accessible names, so role and text
 * engines have genuine per-candidate work to do at every depth, and they carry a
 * different semantic class from the target so class locators stay unambiguous.
 *
 * Every record from every scenario also carries targetDepth, so the slow-query
 * report can correlate cost with depth across the whole corpus rather than only
 * here.
 */

test.use({ scenario: 'S12' });

/** Element count held constant; only the number of levels changes. */
const FILL = 6_000;

const DEPTHS = [5, 15, 30, 50] as const;

for (const depth of DEPTHS) {
  test(`S12 depth | ${depth} levels at ~${FILL} elements`, async ({ bench }) => {
    const state = await bench.goto('deep', { depth, fill: FILL });

    const target = await bench.describe(`leaf-r${depth}`);
    expect(target.found).toBe(true);
    // The whole point of the scenario: confirm depth actually varied.
    expect(target.depth, 'target depth must track the requested nesting').toBeGreaterThan(depth);

    const dims = {
      requestedDepth: depth,
      fill: FILL,
      domNodes: state.domNodes,
      renderMs: state.renderMs ?? -1,
    };

    await bench.measureNoiseFloor(dims);

    for (const strategy of applicable(target)) {
      await bench.measureStrategy({
        strategy, target, dims,
        options: { reps: 30, probeOnlyAboveMs: 5_000 },
      });
      await bench.measureFloor(strategy, target, dims);
    }
  });
}
