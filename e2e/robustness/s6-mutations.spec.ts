import type { Page } from '@playwright/test';
import { test } from '../harness/fixtures';
import { applicable, type Strategy } from '../locators/strategies';
import type { TargetDescriptor } from '../locators/describe';
import { ALL_MUTATIONS } from './mutations';

/**
 * S6 - robustness under change.
 *
 * This is the half of the study that speed cannot answer. A locator is written
 * once and then has to survive every subsequent commit. Each mutation here is a
 * change a developer makes without thinking about tests at all:
 *
 *   locale       shipped in another language
 *   reword       product changed the copy
 *   classHash    the build re-hashed scoped class names
 *   classRename  someone renamed a CSS class
 *   wrap         someone added a layout div
 *   reorder      someone reordered columns
 *   attrRename   the team migrated its test-id convention
 *
 * Method: describe the target on the unmutated page, build every locator from
 * that descriptor, then apply the mutation and ask whether each locator still
 * reaches the same physical element.
 *
 * Identity is verified through data-qa, which is derived only from the target's
 * logical coordinates and is therefore invariant under every mutation. Counting
 * matches alone would score a locator as surviving when it had silently latched
 * onto a different element — which is worse than breaking, because it passes.
 */

test.use({ scenario: 'S6' });

type Outcome =
  /** Resolves to exactly the intended element. */
  | 'survived'
  /** Resolves to nothing: loud, immediate, cheap to diagnose. */
  | 'broken-none'
  /** Resolves to several elements: strict mode turns this into a failure. */
  | 'broken-ambiguous'
  /** Resolves to exactly one element, and it is the wrong one. Silent and worst. */
  | 'broken-wrong'
  /** The locator could not even be constructed against the mutated page. */
  | 'error';

const ROWS = 120;
const COLS = 6;
const TARGET_ROW = 60;

async function outcomeFor(
  page: Page,
  strategy: Strategy,
  target: TargetDescriptor,
): Promise<{ outcome: Outcome; matches: number; detail: string }> {
  try {
    const locator = strategy.build(page, target);
    const matches = await locator.count();
    if (matches === 0) return { outcome: 'broken-none', matches, detail: '' };
    if (matches > 1) return { outcome: 'broken-ambiguous', matches, detail: '' };
    const qa = await locator.first().getAttribute('data-qa');
    return qa === target.qaId
      ? { outcome: 'survived', matches, detail: '' }
      : { outcome: 'broken-wrong', matches, detail: `resolved data-qa=${qa}` };
  } catch (e) {
    return { outcome: 'error', matches: -1, detail: (e as Error).message.split('\n')[0] };
  }
}

for (const mutation of ALL_MUTATIONS) {
  test(`S6 robustness | mutate=${mutation}`, async ({ bench, page }) => {
    // Baseline: capture how the target can be addressed before anything changes.
    await bench.goto('grid', { rows: ROWS, cols: COLS, seed: 'bm-v1' });
    const target = await bench.describe(`cell-r${TARGET_ROW}-c2`);
    test.expect(target.found).toBe(true);
    const strategies = applicable(target);

    // Baseline outcome per strategy, kept rather than discarded.
    //
    // Some strategies are ambiguous before anything is mutated - a bare semantic
    // class matches every row in the grid. Scoring those as "broken" by every
    // mutation would charge them twice for one flaw: once here and again in the
    // ambiguity sweep. The baseline is recorded so the analysis can report
    // robustness only where the question is meaningful.
    const baseline = new Map<string, Outcome>();
    for (const strategy of strategies) {
      const pre = await outcomeFor(page, strategy, target);
      baseline.set(strategy.id, pre.outcome);
      test
        .expect(pre.outcome, `${strategy.id} must resolve on the unmutated page`)
        .not.toBe('error');
    }

    // Apply the mutation. Same seed, same dimensions: only the mutation differs.
    const state = await bench.goto('grid', {
      rows: ROWS, cols: COLS, seed: 'bm-v1', mutate: mutation,
    });

    for (const strategy of strategies) {
      const { outcome, matches, detail } = await outcomeFor(page, strategy, target);
      const baselineOutcome = baseline.get(strategy.id) ?? 'error';
      const baselineUnique = baselineOutcome === 'survived';

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
          mutation,
          outcome,
          baselineOutcome,
          // Only meaningful where the locator was unique to begin with.
          baselineUnique,
          rows: ROWS,
          cols: COLS,
          domNodes: state.domNodes,
          targetRow: TARGET_ROW,
        },
      });
    }
  });
}
