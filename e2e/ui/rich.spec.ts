import { Locator, Page, expect, test } from '@playwright/test';
import { numeric } from '../../app/src/app/rich/table-query';

const ready = (page: Page, prefix: string) =>
  expect(page.locator('html')).toHaveAttribute('data-bm-ready', new RegExp(`^${prefix}`));

async function column(page: Page, key: string): Promise<string[]> {
  return page.getByTestId('grid.row').locator(`td[data-col="${key}"]`).allInnerTexts();
}

const sorted = (xs: number[], dir: 1 | -1) => xs.every((x, i) => i === 0 || dir * (x - xs[i - 1]) >= 0);

test.describe('default DOM is untouched', () => {
  for (const path of ['/', '/grid?rows=20', '/deep?depth=5&fill=20']) {
    test(`${path} renders no Material shell or rich page`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('data-bm-ready', /.+/);
      await expect(page.locator('mat-toolbar, bm-data-table, bm-rich-deep, bm-rich-home')).toHaveCount(0);
    });
  }
});

test.describe('rich grid', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/grid?ui=rich&rows=120&cols=6');
    await ready(page, 'rich-grid:120:6');
  });

  test('shows the first page and the total', async ({ page }) => {
    await expect(page.getByTestId('grid.row')).toHaveCount(25);
    await expect(page.getByTestId('grid.count')).toHaveText('1–25 of 120 rows');
  });

  test('sorts numerically by header, ascending then descending', async ({ page }) => {
    // c4 is the quantity column: plain integers that sort wrongly as text.
    const head = page.getByTestId('grid.head.c4');
    await head.click();
    await expect(head).toHaveAttribute('aria-sort', 'ascending');
    expect(sorted((await column(page, 'c4')).map(Number), 1)).toBe(true);
    await head.click();
    await expect(head).toHaveAttribute('aria-sort', 'descending');
    expect(sorted((await column(page, 'c4')).map(Number), -1)).toBe(true);
  });

  test('sorts currency by value', async ({ page }) => {
    await page.getByTestId('grid.head.c0').click();
    const values = (await column(page, 'c0')).map(numeric);
    expect(values.every((v) => !Number.isNaN(v))).toBe(true);
    expect(sorted(values, 1)).toBe(true);
  });

  test('filters across all columns and reports the filtered count', async ({ page }) => {
    await page.getByTestId('grid.filter').fill('EMEA');
    await expect(page.getByTestId('grid.count')).toContainText('(filtered from 120)');
    const regions = await column(page, 'c1');
    expect(regions.length).toBeGreaterThan(0);
    expect(regions.every((r) => r === 'EMEA')).toBe(true);
  });

  test('limits the filter to one column', async ({ page }) => {
    // "1" appears somewhere in nearly every row; limited to the # column it matches
    // only the row numbers containing a 1.
    const expected = Array.from({ length: 120 }, (_, i) => String(i)).filter((s) => s.includes('1')).length;
    await page.getByTestId('grid.filter-column').click();
    await page.getByRole('option', { name: '#' }).click();
    await page.getByTestId('grid.filter').fill('1');
    await expect(page.getByTestId('grid.count')).toContainText(`of ${expected} rows (filtered from 120)`);
  });

  test('shows an empty state and resets', async ({ page }) => {
    await page.getByTestId('grid.filter').fill('no-such-value');
    await expect(page.getByTestId('grid.empty')).toBeVisible();
    await expect(page.getByTestId('grid.row')).toHaveCount(0);
    await page.getByTestId('grid.clear').click();
    await expect(page.getByTestId('grid.filter')).toHaveValue('');
    await expect(page.getByTestId('grid.row')).toHaveCount(25);
  });

  test('pages through the filtered, sorted rows', async ({ page }) => {
    await page.getByTestId('grid.head.r').click();
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page.getByTestId('grid.count')).toHaveText('26–50 of 120 rows');
    expect((await column(page, 'r'))[0]).toBe('25');
    // A new filter goes back to the first page.
    await page.getByTestId('grid.filter').fill('5');
    await expect(page.getByTestId('grid.count')).toContainText(/^1–/);
  });
});

test.describe('rich deep', () => {
  const node = (page: Page, id: string): Locator => page.getByTestId(`deep.node.${id}`);

  test('generates depth, breadth and items from the URL', async ({ page }) => {
    await page.goto('/deep?ui=rich&depth=3&breadth=3&items=2&nodes=1000');
    await ready(page, 'rich-deep:3:3:2:1000');
    await expect(page.locator('[data-testid^="deep.node."]')).toHaveCount(40);
    await expect(page.locator('[data-testid^="deep.item."]')).toHaveCount(80);
    await expect(page.getByTestId('deep.stats.nodes')).toHaveText('40');
    await expect(page.locator('[data-level="3"]')).toHaveCount(27);
  });

  test('reaches depth 50 under a small node budget, really nested in the DOM', async ({ page }) => {
    await page.goto('/deep?ui=rich&depth=50&breadth=2&items=1&nodes=60');
    await ready(page, 'rich-deep:50');
    await expect(page.getByTestId('deep.stats.level')).toHaveText('50');
    const deepest = page.locator('[data-level="50"]');
    await expect(deepest).toHaveCount(1);
    expect(await deepest.evaluate((el) => {
      let n = 0;
      for (let p = el.parentElement; p; p = p.parentElement) if (p.matches('article[data-level]')) n++;
      return n;
    })).toBe(50);
  });

  test('a preset rewrites the URL and regenerates', async ({ page }) => {
    await page.goto('/deep?ui=rich');
    await page.getByRole('button', { name: 'Wide' }).click();
    await expect(page).toHaveURL(/depth=3/);
    await expect(page).toHaveURL(/breadth=8/);
    await ready(page, 'rich-deep:3:8:4:600');
    await expect(page.getByTestId('deep.stats.nodes')).toHaveText('585');
  });

  test('collapsing a node removes its subtree and expanding restores it', async ({ page }) => {
    await page.goto('/deep?ui=rich&depth=4&breadth=2&items=0&nodes=100');
    await ready(page, 'rich-deep:4');
    await expect(node(page, '0.1.0.0.0')).toBeVisible();
    const toggle = page.getByTestId('deep.toggle.0.1');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('[data-testid^="deep.node.0.1."]')).toHaveCount(0);
    await toggle.click();
    await expect(page.locator('[data-testid^="deep.node.0.1."]')).toHaveCount(14);
  });

  test('the DOM count reflects what was rendered', async ({ page }) => {
    await page.goto('/deep?ui=rich&depth=4&breadth=2&items=3&nodes=100');
    await ready(page, 'rich-deep:4');
    const shown = Number(await page.getByTestId('deep.stats.dom').innerText());
    const actual = await page.getByTestId('deep.tree').evaluate((el) => el.querySelectorAll('*').length);
    expect(shown).toBe(actual);
  });
});

test.describe('rich shell', () => {
  test('route links keep ?ui=rich, and the benchmark link drops it', async ({ page }) => {
    await page.goto('/?ui=rich');
    await ready(page, 'rich-home');
    await page.getByRole('navigation', { name: 'Routes' }).getByRole('link', { name: 'grid' }).click();
    await expect(page).toHaveURL(/\/grid\?.*ui=rich/);
    await ready(page, 'rich-grid');
    await page.getByTestId('rich.plain').click();
    await expect(page).toHaveURL(/\/grid\?rows=200&cols=8$/);
    await expect(page.locator('table.bm-grid')).toBeVisible();
    await expect(page.locator('mat-toolbar')).toHaveCount(0);
  });

  test('other routes render their benchmark page inside the shell', async ({ page }) => {
    await page.goto('/forms?ui=rich&fields=5');
    await expect(page.locator('mat-toolbar')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-bm-ready', /.+/);
  });
});
