import { expect, test } from '../harness/fixtures';
import { timeOnceSettled } from '../harness/measure';

/**
 * S9 - the case where no locator can help.
 *
 * With virtual scrolling the target row is not in the document at all, so every
 * strategy fails identically until something scrolls it into existence. This is
 * included because "my data-testid locator is flaky on the big table" is one of
 * the most common locator complaints, and the honest answer is that the locator
 * was never the problem.
 *
 * Three approaches are compared against the same row:
 *   naive    click the locator and let Playwright wait. Cannot succeed.
 *   scroll   drive the viewport, then locate.
 *   nonvirtual  the same list rendered in full, as a control.
 */

test.use({ scenario: 'S9' });

const ROWS = 20_000;
const TARGET = 15_000;
const TIMEOUT_MS = 5_000;

test('S9 virtual scroll | target row is not in the DOM', async ({ bench, page }) => {
  const state = await bench.goto('virtual', { rows: ROWS, virtual: 1 });
  const dims = { rows: ROWS, targetRow: TARGET, virtual: true, domNodes: state.domNodes };

  const rendered = await page.locator('[data-kind="vrow"]').count();
  bench.emitRaw({
    strategyId: 'virtual.rendered-rows', family: 'identity', metric: 'match_count',
    samples: [rendered], matches: rendered, dims: { ...dims, note: 'rows actually in the DOM' },
  });

  const naive = await timeOnceSettled(() =>
    page.getByTestId(`vrow.${TARGET}`).click({ timeout: TIMEOUT_MS }),
  );
  bench.emitRaw({
    strategyId: 'virtual.naive-testid', family: 'identity', metric: 'failure_miss_ms',
    samples: [naive.ms], matches: 0, ok: naive.ok, error: naive.error,
    dims: { ...dims, note: 'No locator can reach a row that was never rendered', timeoutMs: TIMEOUT_MS },
  });

  // Drive the viewport directly. This is what actually fixes it, and it is not a
  // locator change.
  const scrolled = await timeOnceSettled(async () => {
    await page.evaluate((row) => {
      const vp = document.querySelector('cdk-virtual-scroll-viewport');
      if (vp) vp.scrollTop = row * 24;
    }, TARGET);
    await page.getByTestId(`vrow.${TARGET}`).waitFor({ state: 'visible', timeout: TIMEOUT_MS });
  });
  bench.emitRaw({
    strategyId: 'virtual.scroll-then-locate', family: 'composite', metric: 'action_click_ms',
    samples: [scrolled.ms], ok: scrolled.ok, error: scrolled.error,
    dims: { ...dims, note: 'Scroll the viewport, then locate', timeoutMs: TIMEOUT_MS },
  });
  expect(scrolled.ok, 'scrolling must make the row reachable').toBe(true);
});

test('S9 virtual scroll | non-virtual control', async ({ bench, page }) => {
  // Same row count rendered in full. Slow to build, but every row is reachable.
  const CONTROL_ROWS = 5_000;
  const CONTROL_TARGET = 3_750;
  const state = await bench.goto('virtual', { rows: CONTROL_ROWS, virtual: 0 });
  const dims = {
    rows: CONTROL_ROWS, targetRow: CONTROL_TARGET, virtual: false,
    domNodes: state.domNodes,
  };

  const direct = await timeOnceSettled(() =>
    page.getByTestId(`vrow.${CONTROL_TARGET}`).click({ timeout: 15_000 }),
  );
  bench.emitRaw({
    strategyId: 'virtual.nonvirtual-testid', family: 'identity', metric: 'action_click_ms',
    samples: [direct.ms], ok: direct.ok, error: direct.error,
    dims: { ...dims, note: 'Full render: locator works, but the page paid to build it' },
  });
});
