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

/**
 * S5b - what happens when ids themselves collide.
 *
 * The sweep above can never break an id locator, because the application under
 * test guarantees unique ids. That makes "ids never collide" a property of this
 * fixture rather than a finding, and stating it as a finding would be dishonest.
 *
 * Duplicate ids are invalid HTML and happen constantly: a component rendered
 * twice, a modal reusing a template, a list that forgets to suffix its keys. The
 * dangerous arrangement is a duplicate rendered *ahead* of the intended target,
 * because anything resolving by document order silently switches to the new
 * element instead of failing. That is what this renders.
 *
 * Three behaviours are recorded separately, because they differ:
 *   strict      the plain locator, which should refuse rather than guess
 *   first       the same locator with .first(), the usual way people silence
 *               strict mode - and the way to get a silent wrong element
 *   native      document.getElementById, for comparison
 */
for (const clashes of [0, 1, 3] as const) {
  test(`S5b id collisions | duplicates=${clashes}`, async ({ bench, page }) => {
    const CARDS = 20;
    const state = await bench.goto('ambiguous', { dup: CARDS, dupIds: clashes });
    const targetCard = Math.floor(CARDS / 2);
    const canonicalId = `action-r${targetCard}`;

    const dims = {
      cards: CARDS,
      duplicateIds: clashes,
      targetCard,
      domNodes: state.domNodes,
    };

    for (const [id, selector] of [
      ['id.css', `#${canonicalId}`],
      ['id.engine', `id=${canonicalId}`],
    ] as const) {
      const locator = page.locator(selector);
      const matches = await locator.count();

      // Does the plain locator refuse, or act on a guess?
      let strictOutcome = 'resolved uniquely';
      try {
        await locator.click({ timeout: 2_000 });
      } catch (e) {
        const message = (e as Error).message;
        strictOutcome = /strict mode violation/.test(message)
          ? 'strict mode violation'
          : message.split('\n')[0].slice(0, 60);
      }

      // .first() never refuses. Which element does it land on?
      const landedOnClash = await locator.first().evaluate((el) => el.hasAttribute('data-clash'));
      // The native API for comparison: it returns the first in document order.
      const nativeIsClash = await page.evaluate(
        (domId) => document.getElementById(domId)?.hasAttribute('data-clash') ?? false,
        canonicalId,
      );

      bench.emitRaw({
        strategyId: id,
        family: 'identity',
        metric: 'id_collision',
        samples: [matches],
        matches,
        ok: matches === 1,
        error: matches === 1 ? null : strictOutcome,
        dims: {
          ...dims,
          selector,
          strictOutcome,
          // The finding that matters: .first() silences strict mode and takes
          // whatever comes first in document order, wrong element included.
          firstResolvesToWrongElement: landedOnClash,
          nativeResolvesToWrongElement: nativeIsClash,
        },
      });
    }
  });
}
