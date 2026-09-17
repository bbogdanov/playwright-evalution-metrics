import { expect, test } from '../harness/fixtures';
import { BY_ID } from '../locators/strategies';
import { timeOnceSettled } from '../harness/measure';
import { MACRO_SET } from './macro-set';

/**
 * S4 - the cost of waiting.
 *
 * `expect(locator).toBeVisible()` polls until it passes. Each poll re-runs the
 * query over the whole document, so the wait costs roughly
 * (query cost) x (number of polls) on top of the time actually spent waiting.
 *
 * The metric that matters is not total elapsed time — that is dominated by the
 * delay the page imposes, which is identical for every strategy. It is the
 * overshoot: how much later than the content's actual arrival the assertion
 * resolved. That isolates polling overhead from the wait itself.
 *
 * Each measurement needs a fresh navigation, because the delay only elapses once.
 */

test.use({ scenario: 'S4' });

const DELAY_MS = 1_500;
const FILLER_ROWS = 600;

/** Each mode blocks a different gate of Playwright's actionability loop. */
const MODES = ['append', 'visible', 'enabled', 'stable'] as const;

for (const mode of MODES) {
  test(`S4 actionability | lateMode=${mode}`, async ({ bench, page }) => {
    // One warm-up navigation to learn how the target is addressed. The target is
    // present here because delay=0, which is the only way to describe it.
    await bench.goto('late', { delay: 0, lateMode: mode, rows: FILLER_ROWS });
    const target = await bench.describe('late-r0');
    expect(target.found).toBe(true);

    for (const id of MACRO_SET) {
      const strategy = BY_ID.get(id)!;
      if (!strategy.applicable(target)) continue;

      // Fresh page state per strategy, so each one waits out the same delay from
      // the same starting point.
      const state = await bench.goto('late', {
        delay: DELAY_MS, lateMode: mode, rows: FILLER_ROWS,
      });

      const locator = strategy.build(page, target);
      const wait = await timeOnceSettled(() =>
        expect(locator).toBeVisible({ timeout: 30_000 }),
      );

      // For the 'enabled' and 'stable' gates visibility is satisfied immediately,
      // so the interesting wait is the action itself.
      const action = await timeOnceSettled(() => locator.click({ timeout: 30_000 }));

      bench.emitRaw({
        strategyId: id,
        family: strategy.family,
        metric: 'wait_visible_ms',
        samples: [wait.ms],
        target,
        ok: wait.ok,
        error: wait.error,
        dims: {
          lateMode: mode,
          delayMs: DELAY_MS,
          // How much longer than the page's own delay the visibility wait took.
          //
          // Near-zero means polling cost is negligible for this strategy at this
          // DOM size. Strongly negative is expected for the 'enabled' and
          // 'stable' gates, where the element is visible from the start and the
          // wait is paid by the action instead - read action_after_wait_ms there.
          overshootMs: Number((wait.ms - DELAY_MS).toFixed(3)),
          fillerRows: FILLER_ROWS,
          domNodes: state.domNodes,
        },
      });

      bench.emitRaw({
        strategyId: id,
        family: strategy.family,
        metric: 'action_after_wait_ms',
        samples: [action.ms],
        target,
        ok: action.ok,
        error: action.error,
        dims: {
          lateMode: mode,
          delayMs: DELAY_MS,
          fillerRows: FILLER_ROWS,
          domNodes: state.domNodes,
        },
      });
    }
  });
}
