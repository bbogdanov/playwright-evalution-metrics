import { test } from '../harness/fixtures';
import { applicable } from '../locators/strategies';

/**
 * S2 - does where the target sits in the document change what it costs to find?
 *
 * Engines that scan in document order can short-circuit on the first match, so a
 * target in row 0 is the best case and a target in the last row is the worst. Any
 * benchmark that only ever measures the first match is measuring the short
 * circuit, not the engine — this scenario exists to quantify how much that choice
 * would have distorted S1.
 *
 * DOM size is held fixed so that position is the only variable.
 */

test.use({ scenario: 'S2' });

const ROWS = 1_500;
const COLS = 6;
const REPS = 25;

const POSITIONS = [
  { name: 'first', row: 0 },
  { name: 'middle', row: Math.floor(ROWS / 2) },
  { name: 'last', row: ROWS - 1 },
] as const;

for (const pos of POSITIONS) {
  test(`S2 position | ${pos.name} (row ${pos.row} of ${ROWS})`, async ({ bench, page }) => {
    const state = await bench.goto('grid', { rows: ROWS, cols: COLS, seed: 'bm-v1' });
    const target = await bench.describe(`cell-r${pos.row}-c2`);
    test.expect(target.found).toBe(true);

    const dims = {
      position: pos.name,
      targetRow: pos.row,
      rows: ROWS,
      cols: COLS,
      domNodes: state.domNodes,
      tier: 'm',
    };

    await bench.measureNoiseFloor(dims);

    for (const strategy of applicable(target)) {
      await bench.measureStrategy({ strategy, target, dims, options: { reps: REPS } });
    }
  });
}

/**
 * Scoping: the one locator optimisation that is widely recommended, measured
 * against the flat equivalent on identical markup.
 *
 * /ambiguous renders N structurally identical cards. Reaching the button in card
 * K either means narrowing to that card first and searching a handful of nodes,
 * or searching the whole document and taking the Kth result. Both are one line of
 * test code; they are not the same amount of work.
 */
test('S2 scoping | container-scoped vs document-wide', async ({ bench, page }) => {
  const CARDS = 600;
  const state = await bench.goto('ambiguous', { dup: CARDS });
  const targetCard = Math.floor(CARDS / 2);
  const target = await bench.describe(`action-r${targetCard}`);
  test.expect(target.found).toBe(true);
  test.expect(target.scopeTestId, 'target must sit inside an addressable container').not.toBe('');

  const dims = {
    cards: CARDS,
    targetCard,
    domNodes: state.domNodes,
    scopeTestId: target.scopeTestId,
  };

  await bench.measureNoiseFloor(dims);

  for (const strategy of applicable(target)) {
    await bench.measureStrategy({ strategy, target, dims, options: { reps: 30 } });
  }
});
