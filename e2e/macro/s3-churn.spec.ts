import { test } from '../harness/fixtures';
import { BY_ID } from '../locators/strategies';
import { timeOnceSettled } from '../harness/measure';
import { MACRO_SET } from './macro-set';

/**
 * S3 - action cost while the page keeps re-rendering.
 *
 * Playwright locators are lazy. Every actionability poll re-runs the query from
 * scratch, so on a page that never settles the per-query cost measured in S1 is
 * multiplied by however many polls the action needs. This is the mechanism by
 * which a locator difference that looks like a rounding error becomes seconds.
 *
 * Two variables:
 *   hz       how often the list re-renders (0, 10, 30, 60 times a second)
 *   trackby  whether Angular's @for has a stable track expression
 *
 * trackby=0 is the pathological case: every row is destroyed and recreated each
 * tick, so a resolved element handle is detached before it can be used and
 * Playwright has to start over. It is included because this failure is routinely
 * reported as Playwright flakiness when it is an application bug, and the data
 * should be able to say which it is.
 */

test.use({ scenario: 'S3' });

const ROWS = 300;
const TARGET = 150;
const CLICKS = 8;

/**
 * Per-click ceiling. Long enough that a slow-but-working locator on a churning
 * page still succeeds, short enough that a cell of failures does not run for half
 * an hour.
 */
const CLICK_TIMEOUT_MS = 8_000;

/**
 * Consecutive failures after which the remaining clicks are abandoned.
 *
 * A strategy that cannot land three clicks in a row on this page will not land
 * the next five either; continuing only buys identical data at forty seconds a
 * sample. The abandoned repetitions are recorded as `abandoned` so the failure
 * rate is never computed against a denominator that was silently truncated.
 */
const GIVE_UP_AFTER = 3;

const MATRIX = [
  { hz: 0, trackby: 1 },
  { hz: 10, trackby: 1 },
  { hz: 30, trackby: 1 },
  { hz: 60, trackby: 1 },
  { hz: 10, trackby: 0 },
  { hz: 30, trackby: 0 },
  { hz: 60, trackby: 0 },
] as const;

for (const cell of MATRIX) {
  test(`S3 churn | hz=${cell.hz} trackby=${cell.trackby}`, async ({ bench, page }) => {
    const state = await bench.goto('churn', {
      rows: ROWS, hz: cell.hz, trackby: cell.trackby,
    });

    const target = await bench.describe(`churn-r${TARGET}`);
    test.expect(target.found).toBe(true);

    // Confirm the page really is churning; a silent zero would make every
    // measurement in this cell a measurement of a static page.
    if (cell.hz > 0) {
      const t0 = Number(await page.getByTestId('status.tick').textContent());
      await page.waitForTimeout(500);
      const t1 = Number(await page.getByTestId('status.tick').textContent());
      test.expect(t1, 'page must actually be re-rendering').toBeGreaterThan(t0);
    }

    const dims = {
      hz: cell.hz,
      trackby: cell.trackby === 1,
      rows: ROWS,
      domNodes: state.domNodes,
      targetRow: TARGET,
    };

    for (const id of MACRO_SET) {
      const strategy = BY_ID.get(id)!;
      if (!strategy.applicable(target)) continue;

      const samples: number[] = [];
      const failures: string[] = [];
      let consecutiveFailures = 0;
      let abandoned = 0;

      for (let i = 0; i < CLICKS; i++) {
        if (consecutiveFailures >= GIVE_UP_AFTER) {
          abandoned = CLICKS - i;
          break;
        }
        const locator = strategy.build(page, target);
        const { ms, ok, error } = await timeOnceSettled(() =>
          locator.click({ timeout: CLICK_TIMEOUT_MS }),
        );
        samples.push(ms);
        if (ok) {
          consecutiveFailures = 0;
        } else {
          failures.push(error ?? 'unknown');
          consecutiveFailures++;
        }
      }

      bench.emitRaw({
        strategyId: id,
        family: strategy.family,
        metric: 'action_click_ms',
        samples,
        target,
        matches: null,
        ok: failures.length === 0,
        error: failures[0] ?? null,
        dims: {
          ...dims,
          failures: failures.length,
          attempted: samples.length,
          abandoned,
          clicks: CLICKS,
          clickTimeoutMs: CLICK_TIMEOUT_MS,
          // Rate over what was actually attempted. Abandoned repetitions are
          // reported separately rather than folded in as successes or failures.
          failureRate: samples.length ? failures.length / samples.length : -1,
        },
      });
    }
  });
}
