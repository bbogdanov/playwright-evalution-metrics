import { expect, test } from '../harness/fixtures';
import { timeOnceSettled } from '../harness/measure';
import { BY_ID } from '../locators/strategies';
import { MACRO_SET } from '../macro/macro-set';
import { DEEP, FILLERS, SHALLOW, fillFor } from './shape';

/**
 * S15 click - what a whole action costs at depth 50, not just the query.
 *
 * A click is query + scroll into view + actionability checks + hit test +
 * dispatch. Depth can touch every one of those, and query cost is only the
 * first. Measured for the macro representatives, on the depth-50 page and on the
 * shallow control with the same element count.
 *
 * The click is verified through the app's action log, so a click that landed on
 * the wrong element cannot be timed as a success.
 */

test.use({ scenario: 'S15' });

const REPS = 15;

for (const depth of [SHALLOW, DEEP]) {
  test(`S15 click | depth=${depth} with ${FILLERS} fillers`, async ({ bench, page }) => {
    const state = await bench.goto('deep', { depth, fill: fillFor(depth) });
    const target = await bench.describe(`leaf-r${depth}`);
    expect(target.found).toBe(true);
    const logged = page.getByTestId('status.last-clicked.value');

    for (const id of MACRO_SET) {
      const strategy = BY_ID.get(id)!;
      if (!strategy.applicable(target)) continue;
      const locator = strategy.build(page, target);

      // One unrecorded click absorbs selector-engine injection and the first
      // scroll, which would otherwise land on whichever strategy ran first.
      await locator.click({ timeout: 30_000 });

      const samples: number[] = [];
      let error: string | null = null;
      for (let i = 0; i < REPS; i++) {
        await page.evaluate(() => window.scrollTo(0, 0));
        const r = await timeOnceSettled(() => locator.click({ timeout: 30_000 }));
        if (!r.ok) { error = r.error; break; }
        samples.push(r.ms);
      }

      // Proof the locator lands on the leaf: point the log elsewhere, click once
      // more outside the timing, and read it back.
      // The log is a signal rendered on the next change-detection pass, so it is
      // awaited rather than read: reading it straight after the click sees the
      // filler's entry and reports a good click as a miss.
      await page.locator('.bm-filler-btn').first().click();
      await expect(logged).not.toHaveText('deep-leaf');
      await locator.click({ timeout: 30_000 });
      const landed = await expect(logged).toHaveText('deep-leaf', { timeout: 5_000 })
        .then(() => true, () => false);

      bench.emitRaw({
        strategyId: id,
        family: strategy.family,
        metric: 'action_click_ms',
        samples,
        target,
        ok: error === null && landed,
        error: error ?? (landed ? null : 'click did not reach the leaf'),
        dims: {
          part: 'click',
          requestedDepth: depth,
          fill: fillFor(depth),
          fillers: FILLERS,
          domNodes: state.domNodes,
          // Every repetition starts scrolled to the top, so each one pays the
          // scroll into view that a test reaching this element would pay.
          scrolledFromTop: true,
        },
      });
    }
  });
}
