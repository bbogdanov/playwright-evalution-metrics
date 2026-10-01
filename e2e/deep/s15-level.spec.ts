import { expect, test } from '../harness/fixtures';
import { applicable } from '../locators/strategies';
import { DEEP, FILL, LEVELS } from './shape';

/**
 * S15 level - one depth-50 page, the target moved from the top to the bottom.
 *
 * S15 query compares two pages. This holds the page fixed - same 50 levels, same
 * ~5,000 elements, same markup - and only moves which level the target sits on.
 * Every level carries a test-id container and one addressable marker button
 * (`levelTargets=1`), so the target is always the same kind of element.
 *
 * It also measures scoping at depth honestly. The scoped strategies narrow to the
 * nearest test-id ancestor, which here is the target's own level - and a level's
 * container holds every level below it. Scoping near the top narrows almost
 * nothing; scoping near the bottom narrows to a hundred elements. Whether that
 * shows up in the cost is the question.
 */

test.use({ scenario: 'S15' });

for (const level of LEVELS) {
  test(`S15 level | target at level ${level} of ${DEEP}`, async ({ bench }) => {
    const state = await bench.goto('deep', { depth: DEEP, fill: FILL, levelTargets: 1 });

    const target = await bench.describe(`lvl-r${level}`);
    expect(target.found).toBe(true);
    expect(target.scopeTestId, 'the level container is the natural scope').toBe(`deep.level.${level}`);

    const dims = {
      part: 'level',
      requestedDepth: DEEP,
      level,
      fill: FILL,
      domNodes: state.domNodes,
      // Elements inside the scope container, i.e. how much a scoped locator
      // still has to search after narrowing.
      scopeSize: await bench.page.locator(`[data-testid="deep.level.${level}"]`)
        .evaluate((el) => el.querySelectorAll('*').length),
    };

    await bench.measureNoiseFloor(dims);

    for (const strategy of applicable(target)) {
      await bench.measureStrategy({
        strategy, target, dims,
        options: { reps: 30, probeOnlyAboveMs: 5_000 },
      });
    }
  });
}
