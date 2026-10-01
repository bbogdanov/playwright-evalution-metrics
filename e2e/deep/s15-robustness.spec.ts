import { test } from '../harness/fixtures';
import { applicable } from '../locators/strategies';
import { ALL_MUTATIONS } from '../robustness/mutations';
import { outcomeFor, type Outcome } from '../robustness/outcome';
import { DEEP, FILL } from './shape';

/**
 * S15 robustness - the S6 mutations, applied to the leaf of a depth-50 page.
 *
 * S6 asks which locators survive an ordinary commit on a flat grid, where the
 * structural selectors are nine steps long. Here they are fifty-odd steps long,
 * and every one of those steps is a place a refactor can land. Same method as S6:
 * describe on the unmutated page, mutate, and check each locator still reaches
 * the same physical element through data-qa.
 */

test.use({ scenario: 'S15' });

for (const mutation of ALL_MUTATIONS) {
  test(`S15 robustness | mutate=${mutation} at depth ${DEEP}`, async ({ bench, page }) => {
    await bench.goto('deep', { depth: DEEP, fill: FILL });
    const target = await bench.describe(`leaf-r${DEEP}`);
    test.expect(target.found).toBe(true);
    const strategies = applicable(target);

    const baseline = new Map<string, Outcome>();
    for (const strategy of strategies) {
      const pre = await outcomeFor(page, strategy, target);
      baseline.set(strategy.id, pre.outcome);
      test
        .expect(pre.outcome, `${strategy.id} must resolve on the unmutated page`)
        .not.toBe('error');
    }

    const state = await bench.goto('deep', { depth: DEEP, fill: FILL, mutate: mutation });

    for (const strategy of strategies) {
      const { outcome, matches, detail } = await outcomeFor(page, strategy, target);
      const baselineOutcome = baseline.get(strategy.id) ?? 'error';

      bench.emitRaw({
        strategyId: strategy.id,
        family: strategy.family,
        metric: 'robustness',
        matches,
        target,
        ok: outcome === 'survived',
        error: outcome === 'survived' ? null : `${outcome}${detail ? ` (${detail})` : ''}`,
        samples: [outcome === 'survived' ? 1 : 0],
        dims: {
          part: 'robustness',
          mutation,
          outcome,
          baselineOutcome,
          baselineUnique: baselineOutcome === 'survived',
          requestedDepth: DEEP,
          fill: FILL,
          domNodes: state.domNodes,
        },
      });
    }
  });
}
