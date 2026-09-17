import { expect, test } from '../harness/fixtures';
import { timeOnceSettled } from '../harness/measure';

/**
 * S8 - overlays, portals, and whether container scoping reaches them.
 *
 * "Scope your locator to a container" is the most-repeated piece of locator
 * advice. Whether it works for an overlay depends on where the framework decides
 * to render that overlay, and that is a moving target:
 *
 *   Angular CDK <= 20  every overlay was projected into a .cdk-overlay-container
 *                      appended to <body>. The component that opened it was not
 *                      an ancestor, so container scoping could not reach it.
 *   Angular CDK 21     connected overlays (mat-select, mat-menu, autocomplete)
 *                      render inline as a descendant of their trigger and use the
 *                      native popover API for top-layer painting. Container
 *                      scoping now works for them. Global overlays (dialogs) still
 *                      go to .cdk-overlay-container.
 *
 * This scenario therefore *measures* placement rather than asserting it. Hard-coding
 * either behaviour would make the test a statement about one CDK version, and the
 * useful result is precisely that the answer moved - a locator written against the
 * old placement silently became dead code, and one written against the new
 * placement will not survive a downgrade.
 *
 * Every scoping attempt is recorded with what it actually matched. None of them
 * are asserted, because which ones work is the output, not the premise.
 */

test.use({ scenario: 'S8' });

const CARDS = 24;
const COLS = 5;
const TIMEOUT_MS = 4_000;

/** Reports where an element actually sits relative to the usual scoping anchors. */
async function placementOf(page: import('@playwright/test').Page, probe: string, ownerTestId: string) {
  return page.evaluate(
    ({ probe, ownerTestId }) => {
      const el = document.querySelector(probe);
      if (!el) return null;
      const owner = document.querySelector(`[data-testid="${ownerTestId}"]`);
      const chain: string[] = [];
      for (let n: Element | null = el; n; n = n.parentElement) {
        chain.unshift(
          n.tagName.toLowerCase() +
            (n.classList.length ? '.' + [...n.classList].slice(0, 2).join('.') : '') +
            (n.hasAttribute('popover') ? '[popover]' : ''),
        );
        if (n.tagName === 'BODY') break;
      }
      return {
        insideOwner: owner ? owner.contains(el) : false,
        insideOverlayContainer: !!el.closest('.cdk-overlay-container'),
        insidePopover: !!el.closest('[popover]'),
        chain: chain.join(' > '),
      };
    },
    { probe, ownerTestId },
  );
}

test('S8 overlays | reaching options inside a connected overlay', async ({ bench, page }) => {
  const state = await bench.goto('material', { dup: CARDS, cols: COLS, rows: 100 });
  const targetCard = Math.floor(CARDS / 2);
  const dims = { cards: CARDS, targetCard, domNodes: state.domNodes };

  const trigger = page.getByTestId(`select.${targetCard}`);
  await expect(trigger).toBeVisible();

  const open = await timeOnceSettled(() => trigger.click());
  bench.emitRaw({
    strategyId: 'overlay.open', family: 'composite', metric: 'action_click_ms',
    samples: [open.ms], ok: open.ok, error: open.error, dims,
  });

  // Version-agnostic: wait for the option by role, wherever the framework put it.
  await expect(page.getByRole('option').first()).toBeVisible({ timeout: 10_000 });

  const placement = await placementOf(page, 'mat-option', `mat-card.${targetCard}`);
  bench.emitRaw({
    strategyId: 'overlay.placement', family: 'composite', metric: 'overlay_placement',
    samples: [placement?.insideOwner ? 1 : 0],
    matches: 1,
    ok: true,
    dims: {
      ...dims,
      surface: 'mat-select',
      overlayKind: 'connected',
      insideOwner: placement?.insideOwner ?? false,
      insideOverlayContainer: placement?.insideOverlayContainer ?? false,
      insidePopover: placement?.insidePopover ?? false,
      chain: placement?.chain ?? '',
    },
  });

  const optionText = (await page.getByRole('option').nth(3).textContent())?.trim() ?? '';

  const attempts = [
    {
      id: 'overlay.scoped-to-card',
      family: 'composite',
      note: 'Scoped to the card owning the trigger. Works only while the panel renders inside it.',
      build: () => page.getByTestId(`mat-card.${targetCard}`).getByRole('option', { name: optionText, exact: true }),
    },
    {
      id: 'overlay.document-role',
      family: 'role',
      note: 'Unscoped role lookup. Indifferent to where the panel renders.',
      build: () => page.getByRole('option', { name: optionText, exact: true }),
    },
    {
      id: 'overlay.scoped-to-overlay-container',
      family: 'composite',
      note: 'Scoped to .cdk-overlay-container: correct for global overlays, dead for connected ones in CDK 21.',
      build: () => page.locator('.cdk-overlay-container').getByRole('option', { name: optionText, exact: true }),
    },
    {
      id: 'overlay.scoped-to-popover',
      family: 'composite',
      note: 'Scoped to the native popover element CDK 21 uses for the top layer.',
      build: () => page.locator('[popover]').getByRole('option', { name: optionText, exact: true }),
    },
    {
      id: 'overlay.panel-class',
      family: 'class',
      note: 'Scoped by the panel class Material generates. Survives the move, tracks Material internals.',
      build: () => page.locator('.mat-mdc-select-panel').getByRole('option', { name: optionText, exact: true }),
    },
  ];

  for (const attempt of attempts) {
    const locator = attempt.build();
    let matches = -1;
    try {
      matches = await locator.count();
    } catch {
      matches = -1;
    }
    const result = await timeOnceSettled(() =>
      locator.first().waitFor({ state: 'visible', timeout: TIMEOUT_MS }),
    );

    bench.emitRaw({
      strategyId: attempt.id,
      family: attempt.family,
      metric: 'overlay_resolve_ms',
      samples: [result.ms],
      matches,
      ok: result.ok,
      error: result.error,
      dims: {
        ...dims,
        overlayKind: 'connected',
        note: attempt.note,
        timeoutMs: TIMEOUT_MS,
        optionText,
        // The finding, per attempt: did this scoping reach the overlay at all?
        reached: result.ok,
      },
    });
  }
});

test('S8 overlays | reaching a dialog, which is a global overlay', async ({ bench, page }) => {
  const state = await bench.goto('material', { dup: 8, cols: COLS, rows: 60 });
  const dims = { domNodes: state.domNodes };

  await page.getByTestId('mat.open-dialog').click();
  await expect(page.getByTestId('dialog.title')).toBeVisible({ timeout: 10_000 });

  const placement = await placementOf(page, '[data-testid="dialog.title"]', 'mat.cards');
  bench.emitRaw({
    strategyId: 'overlay.placement', family: 'composite', metric: 'overlay_placement',
    samples: [placement?.insideOwner ? 1 : 0],
    matches: 1,
    ok: true,
    dims: {
      ...dims,
      surface: 'mat-dialog',
      overlayKind: 'global',
      insideOwner: placement?.insideOwner ?? false,
      insideOverlayContainer: placement?.insideOverlayContainer ?? false,
      insidePopover: placement?.insidePopover ?? false,
      chain: placement?.chain ?? '',
    },
  });

  const attempts = [
    {
      id: 'dialog.scoped-to-page-content',
      family: 'composite',
      note: 'Scoped to page content. A global overlay is not inside it.',
      build: () => page.getByTestId('mat.cards').getByRole('button', { name: 'Approve' }),
    },
    {
      id: 'dialog.scoped-to-overlay-container',
      family: 'composite',
      note: 'Scoped to .cdk-overlay-container, which is where global overlays still go.',
      build: () => page.locator('.cdk-overlay-container').getByRole('button', { name: 'Approve' }),
    },
    {
      id: 'dialog.testid',
      family: 'identity',
      note: 'Unscoped test id. Indifferent to where the node lives.',
      build: () => page.getByTestId('dialogbtn.0'),
    },
  ];

  for (const attempt of attempts) {
    const locator = attempt.build();
    let matches = -1;
    try {
      matches = await locator.count();
    } catch {
      matches = -1;
    }
    const result = await timeOnceSettled(() =>
      locator.first().waitFor({ state: 'visible', timeout: TIMEOUT_MS }),
    );
    bench.emitRaw({
      strategyId: attempt.id,
      family: attempt.family,
      metric: 'overlay_resolve_ms',
      samples: [result.ms],
      matches,
      ok: result.ok,
      error: result.error,
      dims: {
        ...dims, overlayKind: 'global', note: attempt.note,
        timeoutMs: TIMEOUT_MS, reached: result.ok,
      },
    });
  }
});
