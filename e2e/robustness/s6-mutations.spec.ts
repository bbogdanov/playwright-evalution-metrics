import { test } from '../harness/fixtures';
import { applicable } from '../locators/strategies';
import { ALL_MUTATIONS } from './mutations';
import { outcomeFor, type Outcome } from './outcome';

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
 * Identity is verified through data-qa; see ./outcome.ts.
 */

test.use({ scenario: 'S6' });

const ROWS = 120;
const COLS = 6;
const TARGET_ROW = 60;

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
