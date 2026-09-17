import { expect, test } from '../harness/fixtures';
import { applicable } from '../locators/strategies';

/**
 * S5 - when does a locator stop being unique?
 *
 * A locator is written against whatever is on screen at the time, usually a small
 * fixture. The interesting question is what happens as the list grows. Strict
 * mode turns a locator that matches two elements into a hard failure, so this is
 * a correctness measurement, not a performance one — it just happens to be the
 * one that decides whether a suite survives contact with production data.
 *
 * The sweep holds the markup identical and varies only how many copies of it
 * exist, which is exactly what happens between a seeded dev database and a real
 * one.
 */

test.use({ scenario: 'S5' });

const SWEEP = [1, 2, 10, 100, 600] as const;

for (const cards of SWEEP) {
  test(`S5 ambiguity | cards=${cards}`, async ({ bench, page }) => {
    const state = await bench.goto('ambiguous', { dup: cards });
    const targetCard = Math.floor(cards / 2);
    const target = await bench.describe(`action-r${targetCard}`);
    expect(target.found).toBe(true);

    for (const strategy of applicable(target)) {
      const locator = strategy.build(page, target);
      let matches = -1;
      let error: string | null = null;
      try {
        matches = await locator.count();
      } catch (e) {
        error = (e as Error).message.split('\n')[0];
      }

      bench.emitRaw({
        strategyId: strategy.id,
        family: strategy.family,
        metric: 'match_count',
        samples: [matches],
        matches,
        ok: matches === 1,
        error,
        dims: {
          cards,
          targetCard,
          domNodes: state.domNodes,
          // The verdict a reader actually needs: would strict mode reject this?
          strictSafe: matches === 1,
          ambiguous: matches > 1,
          missing: matches === 0,
        },
      });
    }
  });
}
