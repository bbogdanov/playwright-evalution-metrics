import { type Locator, type Page } from '@playwright/test';
import { expect, test as base } from '../harness/fixtures';
import { measurePaired } from '../harness/measure';
import { recordProof, setBrowserVersion } from '../harness/proof';

/**
 * S14 - how locators compose, and what the common compositions cost.
 *
 * Every other scenario measures one locator against one element. Nobody writes
 * tests that way. Real suites hand a locator out of a fixture, chain onto it,
 * store it on a page object, pass it between helpers, and index into it - and
 * most of the ways a suite goes wrong are in that composition rather than in the
 * choice of engine.
 *
 * Each pattern below is a DO/DON'T pair that resolves the same element or
 * answers the same question both ways, and each records a proof:
 *
 *   cost         both forms work; the DON'T is measurably slower, paired and
 *                baseline-subtracted like every other timing in this project.
 *   correctness  the DON'T is wrong. The proof is what it produced.
 *
 * The code between the `>>> do:` and `>>> dont:` markers is extracted verbatim
 * by analysis/build-patterns-page.mjs, so the published examples are the code
 * that actually ran rather than a transcription of it.
 */

base.use({ scenario: 'S14' });

// >>> setup: constants
/** Production-ish page: ~30,000 elements, matching S1's `m` tier. */
const BIG = { rows: 1_500, cols: 6, seed: 'bm-v1' } as const;
const BIG_ROW = 750;
const BIG_COL = 2;
/** Column 2's accessible name on that row, stamped by the target directive. */
const BIG_NAME = `Status for row ${BIG_ROW}`;
// <<<

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/**
 * The page object this scenario recommends: locators are built on demand from
 * `page`, and nothing is resolved or awaited in the constructor.
 *
 * Every accessor returns a Locator, which is a description of how to find
 * something rather than something found. That is what makes it safe to build one
 * in a fixture, hand it to a test, and chain onto it after the DOM has changed.
 */
// >>> setup: page-object
class GridPage {
  constructor(private readonly page: Page) {}

  /** A uniquely addressable container. Everything else is scoped through it. */
  row(r: number): Locator {
    return this.page.getByTestId(`row.${r}`);
  }

  /** Deliberately takes a root: the caller decides what this is scoped to. */
  cellByName(root: Locator, name: string): Locator {
    return root.getByRole('button', { name, exact: true });
  }
}

/**
 * A fixture that hands the test a page object rather than a resolved element.
 *
 * The fixture never awaits anything about the DOM, so it cannot bake in a state
 * that has already changed by the time the test body runs.
 */
const test = base.extend<{ grid: GridPage }>({
  grid: async ({ page }, use) => {
    await use(new GridPage(page));
  },
});
// <<<

// Proofs are only comparable within one browser build, same as every timing in
// this project, so the artefact records which one produced them.
test.beforeEach(({ page }) => setBrowserVersion(page.context().browser()?.version()));

// ---------------------------------------------------------------------------
// Fixture and page-object composition
// ---------------------------------------------------------------------------

test('S14 fixture.handle | a handle from a fixture dies with the DOM that made it', async ({ bench, page }) => {
  // A list that replaces its nodes on every tick: `trackby=0` gives the @for no
  // stable identity, so Angular tears the rows down and rebuilds them.
  const state = await bench.goto('churn', { rows: 40, hz: 10, trackby: 0 });

  // >>> dont: fixture.handle
  // A fixture that resolves the element and hands back the handle.
  const handle = await page.getByTestId('churn.12').elementHandle();
  // <<<

  // >>> do: fixture.handle
  // A fixture that hands back the locator instead.
  const target = page.getByTestId('churn.12');
  // <<<

  const tick = await page.getByTestId('status.tick').textContent();
  await expect(page.getByTestId('status.tick')).not.toHaveText(tick ?? '', { timeout: 10_000 });

  const stillAttached = await handle!.evaluate((el) => el.isConnected);
  let handleError = '';
  try {
    await handle!.click({ timeout: 2_000 });
  } catch (e) {
    handleError = (e as Error).message.split('\n')[0];
  }

  // The locator re-resolves against the DOM that exists now.
  await target.click({ timeout: 5_000 });
  const clicked = await page.getByTestId('status.last-clicked.value').textContent();

  expect(stillAttached, 'the handle should be detached after the re-render').toBe(false);
  expect(handleError, 'clicking a detached handle should fail').not.toBe('');
  expect(clicked).toBe('churn-12');

  recordProof({
    pattern: 'fixture.handle',
    kind: 'correctness',
    url: state.url,
    dont: `element handle detached after one re-render; click failed with "${handleError}"`,
    did: 'locator re-resolved and clicked the current element',
    facts: { stillAttached, domNodes: state.domNodes, clicked: clicked ?? '' },
  });
});

test('S14 fixture.state | a page object that awaits in its constructor is already stale', async ({ bench, page }) => {
  // The control arrives 800ms after the page reports itself rendered.
  const state = await bench.goto('late', { lateMode: 'append', delay: 800, rows: 200 });

  // >>> dont: fixture.state
  // A page object that resolves state while it is being constructed.
  const submitCount = await page.getByTestId('late.slot').getByRole('button').count();
  // <<<

  // >>> do: fixture.state
  // A page object that exposes the locator and lets the assertion do the waiting.
  const submit = page.getByTestId('late.slot').getByRole('button', { name: 'Submit' });
  await expect(submit).toHaveCount(1);
  // <<<

  const after = await page.getByTestId('late.slot').getByRole('button').count();

  expect(submitCount, 'the constructor-time count should be taken before the control exists').toBe(0);
  expect(after).toBe(1);

  recordProof({
    pattern: 'fixture.state',
    kind: 'correctness',
    url: state.url,
    dont: `count() in the constructor returned ${submitCount}`,
    did: `the same locator, asserted rather than counted, resolved to ${after}`,
    facts: { delayMs: 800, constructorCount: submitCount, laterCount: after },
  });
});

test('S14 fixture.lazy | a locator can be built before the page it describes exists', async ({ bench, page }) => {
  // >>> do: fixture.lazy
  // Built against a blank page: a locator is a description, not a lookup.
  const submit = page.getByRole('button', { name: 'Submit' });
  // <<<

  // >>> dont: fixture.lazy
  // The same intent, resolved eagerly: there is nothing to find yet.
  const handleBefore = await page.$('button');
  // <<<

  const state = await bench.goto('late', { lateMode: 'append', delay: 0, rows: 200 });
  const resolved = await submit.count();

  expect(handleBefore, 'nothing can be resolved before navigation').toBeNull();
  expect(resolved, 'the locator built earlier resolves now').toBe(1);

  recordProof({
    pattern: 'fixture.lazy',
    kind: 'correctness',
    url: state.url,
    dont: 'page.$() before navigation returned null, and would have to be re-resolved after every navigation',
    did: 'the locator built before navigation resolved to 1 element afterwards',
    facts: { resolved },
  });
});

test('S14 fixture.binding | a locator is bound to the page that created it', async ({ bench, page, context }) => {
  const state = await bench.goto('grid', { rows: 5, cols: 6, seed: 'bm-v1' });

  // >>> dont: fixture.binding
  // A locator captured from one page, then used after opening another.
  const rowsOnFirstPage = page.locator('tr.bm-grid__row');
  const second = await context.newPage();
  await second.goto('/grid?rows=40&cols=6&seed=bm-v1', { waitUntil: 'commit' });
  await second.waitForSelector('html[data-bm-ready]');
  const seenFromFirst = await rowsOnFirstPage.count();
  // <<<

  // >>> do: fixture.binding
  // Each page gets its own locators, built from that page.
  const rowsOnSecondPage = second.locator('tr.bm-grid__row');
  const seenFromSecond = await rowsOnSecondPage.count();
  // <<<

  await second.close();

  expect(seenFromFirst, 'the first page still has its own 5 rows').toBe(5);
  expect(seenFromSecond, 'the second page has 40').toBe(40);

  recordProof({
    pattern: 'fixture.binding',
    kind: 'correctness',
    url: state.url,
    dont: `the captured locator kept reporting ${seenFromFirst} rows, its own page's count, after a second page opened`,
    did: `a locator built from the second page reported ${seenFromSecond}`,
    facts: { firstPageRows: 5, secondPageRows: 40, seenFromFirst, seenFromSecond },
  });
});

// ---------------------------------------------------------------------------
// Scoping and chaining cost
// ---------------------------------------------------------------------------

/** One paired measurement per form, same element, same page. */
async function costPair(
  page: Page,
  pattern: string,
  url: string,
  domNodes: number,
  forms: { do: Locator; dont: Locator },
  facts?: Record<string, string | number | boolean>,
): Promise<{ doMs: number; dontMs: number }> {
  const opts = { reps: 25, warmup: 5, budgetMs: 8_000 };
  const doPaired = await measurePaired(page, forms.do, opts);
  const dontPaired = await measurePaired(page, forms.dont, opts);
  const doMs = median(doPaired.net);
  const dontMs = median(dontPaired.net);

  recordProof({ pattern, kind: 'cost', url, domNodes, doMs, dontMs, facts });
  return { doMs, dontMs };
}

test('S14 scope.role | scoping a role query to its container', async ({ bench, page, grid }) => {
  const state = await bench.goto('grid', BIG);

  // >>> dont: scope.role
  // Every element of that role in the document is a candidate.
  const unscoped = page.getByRole('button', { name: BIG_NAME, exact: true });
  // <<<

  // >>> do: scope.role
  // The container is found by test id; the accessible name is asserted inside it.
  const scoped = grid.cellByName(grid.row(BIG_ROW), BIG_NAME);
  // <<<

  await expect(unscoped).toHaveCount(1);
  await expect(scoped).toHaveCount(1);

  const { doMs, dontMs } = await costPair(page, 'scope.role', state.url, state.domNodes, {
    do: scoped, dont: unscoped,
  }, { role: 'button', name: BIG_NAME });

  expect(doMs, 'scoping should not be slower than not scoping').toBeLessThan(dontMs);
});

test('S14 scope.chain | chaining from a unique root against chaining from a broad one', async ({ bench, page, grid }) => {
  const state = await bench.goto('grid', BIG);
  const index = BIG_ROW * BIG.cols + BIG_COL;

  // >>> dont: scope.chain
  // Each step re-resolves against every match of the step before it.
  const fromBroadRoot = page
    .locator('tr.bm-grid__row')
    .locator('td.bm-grid__cellwrap')
    .locator('button.bm-grid__cell')
    .nth(index);
  // <<<

  // >>> do: scope.chain
  // Identical chaining, but the first step matches exactly one element.
  const fromUniqueRoot = grid.row(BIG_ROW)
    .locator('td.bm-grid__cellwrap')
    .locator('button.bm-grid__cell')
    .nth(BIG_COL);
  // <<<

  // Same physical element, reached two ways.
  await expect(fromBroadRoot).toHaveAttribute('data-testid', `cell.${BIG_ROW}.${BIG_COL}`);
  await expect(fromUniqueRoot).toHaveAttribute('data-testid', `cell.${BIG_ROW}.${BIG_COL}`);

  const { doMs, dontMs } = await costPair(page, 'scope.chain', state.url, state.domNodes, {
    do: fromUniqueRoot, dont: fromBroadRoot,
  }, { chainSteps: 3, broadFirstStep: BIG.rows });

  expect(doMs).toBeLessThan(dontMs);
});

test('S14 scope.filter | filtering a narrow set against filtering the document', async ({ bench, page, grid }) => {
  const state = await bench.goto('grid', BIG);

  // >>> dont: scope.filter
  // Every row is a candidate, and each candidate pays a text scan.
  const filtered = page
    .getByRole('row')
    .filter({ hasText: `Row ${BIG_ROW} ` })
    .getByRole('button', { name: BIG_NAME, exact: true });
  // <<<

  // >>> do: scope.filter
  // The row is addressed directly; there is nothing left to filter.
  const addressed = grid.cellByName(grid.row(BIG_ROW), BIG_NAME);
  // <<<

  await expect(filtered).toHaveCount(1);
  await expect(addressed).toHaveCount(1);

  const { doMs, dontMs } = await costPair(page, 'scope.filter', state.url, state.domNodes, {
    do: addressed, dont: filtered,
  }, { candidateRows: BIG.rows });

  expect(doMs).toBeLessThan(dontMs);
});

// ---------------------------------------------------------------------------
// Strict mode, .first() and ambiguity
// ---------------------------------------------------------------------------

test('S14 strict.first | .first() silences the violation and keeps the wrong element', async ({ bench, page }) => {
  // Four elements reuse the canonical target's id, rendered ahead of it.
  const state = await bench.goto('ambiguous', { dup: 60, dupIds: 4, target: 30 });
  const canonicalId = 'action-r30';

  // >>> dont: strict.first
  // The strict-mode violation is real; .first() hides it and takes whatever is
  // first in document order.
  const first = page.locator(`#${canonicalId}`).first();
  const clash = await first.getAttribute('data-clash');
  // <<<

  // >>> do: strict.first
  // Scope to something that is genuinely unique, and let strict mode stand.
  const scoped = page.getByTestId('card.30').getByRole('button', { name: 'Open 30', exact: true });
  const testId = await scoped.getAttribute('data-testid');
  // <<<

  let strictError = '';
  try {
    await page.locator(`#${canonicalId}`).click({ timeout: 2_000 });
  } catch (e) {
    strictError = (e as Error).message.split('\n')[0];
  }

  expect(await page.locator(`#${canonicalId}`).count(), 'the id is not unique').toBe(5);
  expect(clash, '.first() resolved to one of the id clashes, not the target').not.toBeNull();
  expect(testId, 'the scoped locator resolved to the canonical target').toBe('action.30');
  expect(strictError, 'without .first() the ambiguity is raised, not hidden').toContain('strict mode');

  recordProof({
    pattern: 'strict.first',
    kind: 'correctness',
    url: state.url,
    dont: `.first() resolved to a decoy (data-clash="${clash}") while reporting success`,
    did: `the scoped locator resolved to data-testid="${testId}"`,
    facts: { idMatches: 5, strictError },
  });
});

test('S14 strict.nth | nth() indexes the template, not the data', async ({ bench, page, grid }) => {
  const params = { rows: 40, cols: 6, seed: 'bm-v1' } as const;
  await bench.goto('grid', params);

  // >>> dont: strict.nth
  // Position within the row, which the template owns.
  const byPosition = grid.row(10).getByRole('button').nth(BIG_COL);
  // <<<

  // >>> do: strict.nth
  // Identity within the row, which the data owns.
  const byIdentity = grid.row(10).getByTestId(`cell.10.${BIG_COL}`);
  // <<<

  const before = {
    position: await byPosition.getAttribute('data-col'),
    identity: await byIdentity.getAttribute('data-col'),
  };

  // The `reorder` mutation reverses the DOM order of the columns. data-col keeps
  // telling the truth about which column each cell actually is.
  const state = await bench.goto('grid', { ...params, mutate: 'reorder' });

  const after = {
    position: await byPosition.getAttribute('data-col'),
    identity: await byIdentity.getAttribute('data-col'),
  };

  expect(before.position, 'the positional locator pointed at column 2').toBe('2');
  expect(after.position, 'after the reorder it points somewhere else').not.toBe('2');
  expect(before.identity).toBe('2');
  expect(after.identity, 'the identity locator is unmoved').toBe('2');

  recordProof({
    pattern: 'strict.nth',
    kind: 'correctness',
    url: state.url,
    dont: `nth(${BIG_COL}) resolved to column ${before.position} before the reorder and column ${after.position} after it`,
    did: 'the identity locator resolved to column 2 both times',
    facts: { mutation: 'reorder', positionBefore: before.position ?? '', positionAfter: after.position ?? '' },
  });
});

// ---------------------------------------------------------------------------
// Waiting, retry and assertions
// ---------------------------------------------------------------------------

test('S14 wait.count | count() is a question, toHaveCount is a wait', async ({ bench, page }) => {
  const delay = 800;
  const state = await bench.goto('late', { lateMode: 'append', delay, rows: 200 });
  const submit = page.getByTestId('late.slot').getByRole('button', { name: 'Submit' });

  // >>> dont: wait.count
  // A snapshot of right now. No retry, so the assertion runs against whatever
  // the page happened to be mid-render.
  const countNow = await submit.count();
  // <<<

  const started = Date.now();
  // >>> do: wait.count
  // Retries until the page agrees or the timeout expires.
  await expect(submit).toHaveCount(1);
  // <<<
  const waitedMs = Date.now() - started;

  expect(countNow, 'the snapshot is taken before the control exists').toBe(0);
  expect(waitedMs, 'the assertion waited roughly the render delay').toBeGreaterThan(delay * 0.5);

  recordProof({
    pattern: 'wait.count',
    kind: 'correctness',
    url: state.url,
    dont: `count() returned ${countNow} while the control was still ${delay}ms away`,
    did: `toHaveCount(1) retried for ${waitedMs}ms and passed`,
    facts: { delayMs: delay, countNow, waitedMs },
  });
});

test('S14 wait.all | all() snapshots the list, and lists move', async ({ bench, page }) => {
  const state = await bench.goto('churn', { rows: 40, hz: 10, trackby: 0 });

  // >>> dont: wait.all
  // A frozen array of positional locators. Each one means "the nth match as of
  // whenever you next use it", which is not the element you looked at.
  const items = await page.getByTestId('churn.list').locator('.bm-churn__cell').all();
  const thirdValueThen = await items[3].textContent();
  // <<<

  const tick = await page.getByTestId('status.tick').textContent();
  await expect(page.getByTestId('status.tick')).not.toHaveText(tick ?? '', { timeout: 10_000 });

  const thirdValueNow = await items[3].textContent();

  // >>> do: wait.all
  // Address the item, not its position, and assert on the locator.
  const item = page.getByTestId('churn.3');
  await expect(item).toHaveAttribute('data-row', '3');
  // <<<

  expect(items.length).toBe(40);
  expect(thirdValueNow, 'the same array entry now reports a different value').not.toBe(thirdValueThen);

  recordProof({
    pattern: 'wait.all',
    kind: 'correctness',
    url: state.url,
    dont: `items[3] read "${thirdValueThen}" and then "${thirdValueNow}" without anything re-reading the list`,
    did: 'an identity locator kept pointing at data-row="3" across the same re-render',
    facts: { items: items.length, thirdValueThen: thirdValueThen ?? '', thirdValueNow: thirdValueNow ?? '' },
  });
});

test('S14 wait.snapshot | an awaited value is not an assertion', async ({ bench, page }) => {
  const state = await bench.goto('churn', { rows: 40, hz: 10, trackby: 0 });
  const cell = page.getByTestId('churn.7');

  // >>> dont: wait.snapshot
  // A string. Whatever it says, it says forever.
  const text = await cell.textContent();
  // <<<

  const tick = await page.getByTestId('status.tick').textContent();
  await expect(page.getByTestId('status.tick')).not.toHaveText(tick ?? '', { timeout: 10_000 });

  const textNow = await cell.textContent();

  // >>> do: wait.snapshot
  // The locator, asserted. Re-reads the element until it agrees or times out.
  await expect(cell).toHaveText(textNow ?? '');
  // <<<

  expect(textNow, 'the value the string captured is gone').not.toBe(text);

  recordProof({
    pattern: 'wait.snapshot',
    kind: 'correctness',
    url: state.url,
    dont: `the captured string still reads "${text}" after the element changed to "${textNow}"`,
    did: 'the assertion re-read the element and matched its current value',
    facts: { captured: text ?? '', current: textNow ?? '' },
  });
});

test('S14 wait.sleep | a fixed sleep pays the worst case every time', async ({ bench, page }) => {
  const delay = 800;
  const sleepMs = 3_000;
  const state = await bench.goto('late', { lateMode: 'append', delay, rows: 200 });
  const submit = page.getByTestId('late.slot').getByRole('button', { name: 'Submit' });

  const sleepStarted = Date.now();
  // >>> dont: wait.sleep
  // Costs the same whether the page took 10ms or 2 seconds, and still fails when
  // the machine is slower than whoever picked the number.
  await page.waitForTimeout(sleepMs);
  await expect(submit).toHaveCount(1);
  // <<<
  const sleepTotal = Date.now() - sleepStarted;

  await bench.goto('late', { lateMode: 'append', delay, rows: 200 });
  const assertStarted = Date.now();
  // >>> do: wait.sleep
  // Returns as soon as the page is ready, and waits longer when it has to.
  await expect(page.getByTestId('late.slot').getByRole('button', { name: 'Submit' })).toHaveCount(1);
  // <<<
  const assertTotal = Date.now() - assertStarted;

  expect(assertTotal).toBeLessThan(sleepTotal);

  recordProof({
    pattern: 'wait.sleep',
    kind: 'cost',
    url: state.url,
    domNodes: state.domNodes,
    doMs: assertTotal,
    dontMs: sleepTotal,
    facts: { renderDelayMs: delay, sleepMs },
  });
});
