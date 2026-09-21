/**
 * Opens the generated pages in a real browser and checks the things a generator
 * cannot check itself: that nothing throws, that the popovers open with content,
 * that they stay on screen, and that a phone-width viewport has no horizontal
 * scroll.
 *
 * Everything here exists because it broke once. The scroll assertions are the
 * clearest case: clicking a control that sits across the fold makes the browser
 * scroll it into view, and a popover that closed on any scroll vanished the
 * instant it opened - which looked, in a screenshot, exactly like a click that
 * did nothing.
 *
 * Not a Playwright project: it tests the artefacts, not the application, and it
 * must run in CI where no benchmark ever runs.
 *
 *   node tools/verify-pages.mjs [dashboard-dir]
 *
 * BM_CHROMIUM overrides the browser binary; BM_SHOT writes screenshots there.
 */
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const out = process.argv[2] ?? 'results/dashboard';
const browser = await chromium.launch(
  process.env.BM_CHROMIUM ? { executablePath: process.env.BM_CHROMIUM } : {},
);
const problems = [];

async function check(file, width, height, theme, tag) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`${tag} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`${tag} console: ${m.text()}`); });
  await page.goto(pathToFileURL(resolve(file)).href);
  if (theme) await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
  await page.waitForTimeout(500);

  // horizontal overflow
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) problems.push(`${tag} horizontal overflow: ${overflow}px`);
  return { ctx, page };
}

// --- accessibility page -----------------------------------------------------
for (const [w, h, theme] of [[1280, 900, 'light'], [1280, 900, 'dark'], [390, 780, 'light']]) {
  const tag = `a11y ${w}x${h} ${theme}`;
  const { ctx, page } = await check(`${out}/accessibility.html`, w, h, theme, tag);

  const cells = page.locator('button[data-cell]');
  const n = await cells.count();
  if (n !== 36) problems.push(`${tag}: ${n} cells, expected 36`);

  const hrefs = await page.locator('#headerLinks a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  for (const want of ['index.html', 'patterns.html']) {
    if (!hrefs.includes(want)) problems.push(`${tag}: no header link to ${want} (${hrefs})`);
  }

  // first, last, and one near the bottom edge so the flip-above path runs
  for (const i of [0, 20, n - 1]) {
    const cell = cells.nth(i);
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    const pop = page.locator('#pop');
    if (!(await pop.isVisible())) { problems.push(`${tag}: popover did not open on cell ${i}`); continue; }
    const box = await pop.boundingBox();
    if (box.x < 0 || box.y < 0 || box.x + box.width > w + 1 || box.y + box.height > h + 1) {
      problems.push(`${tag}: popover off-screen on cell ${i}: ${JSON.stringify(box)}`);
    }
    const text = await pop.innerText();
    if (text.length < 80) problems.push(`${tag}: popover text too short on cell ${i}: ${text.length}`);
    if (!(await pop.locator('pre').count())) problems.push(`${tag}: no example on cell ${i}`);
    await page.keyboard.press('Escape');
    if (await pop.isVisible()) problems.push(`${tag}: Escape did not close popover`);
  }

  // A cell deliberately left half below the fold: the browser scrolls it into
  // view on click, and that scroll used to close the popover the click opened.
  {
    const i = Math.min(18, n - 1);
    const sliver = await page.evaluate((idx) => {
      const el = document.querySelectorAll('button[data-cell]')[idx];
      const y = el.getBoundingClientRect().top + scrollY;
      scrollTo(0, Math.max(0, y - innerHeight + 10));
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, vh: innerHeight };
    }, i);
    if (sliver.bottom <= sliver.vh) {
      problems.push(`${tag}: could not place a cell across the fold, test is vacuous`);
    }
    await cells.nth(i).click();
    await page.waitForTimeout(250);
    if (!(await page.locator('#pop').isVisible())) {
      problems.push(`${tag}: popover closed by the browser's own scroll-into-view`);
    }
    await page.keyboard.press('Escape');
  }

  // Scrolling re-anchors instead of closing, until the trigger leaves the viewport.
  {
    await page.evaluate(() => scrollTo(0, 0));
    const trigger = cells.nth(0);
    await trigger.click();
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(250);
    const pop = page.locator('#pop');
    if (!(await pop.isVisible())) problems.push(`${tag}: popover closed on a small scroll`);
    else {
      const t = await trigger.boundingBox();
      const p = await pop.boundingBox();
      // Still anchored: immediately below the trigger, or flipped immediately above it.
      const below = Math.abs(p.y - (t.y + t.height + 6));
      const above = Math.abs((p.y + p.height + 6) - t.y);
      if (Math.min(below, above) > 12) {
        problems.push(`${tag}: popover lost its anchor after scrolling ` +
          `(trigger ${t.y.toFixed(0)}..${(t.y + t.height).toFixed(0)}, pop ${p.y.toFixed(0)}..${(p.y + p.height).toFixed(0)})`);
      }
    }
    await page.mouse.wheel(0, 4000);
    await page.waitForTimeout(250);
    if (await pop.isVisible()) problems.push(`${tag}: popover survived its trigger leaving the viewport`);
  }

  if (process.env.BM_SHOT && w === 1280) {
    await page.screenshot({ path: `${process.env.BM_SHOT}/accessibility-${theme}.png`, fullPage: true });
  }
  await ctx.close();
}

// --- composition patterns page ----------------------------------------------
for (const [w, h, theme] of [[1280, 900, 'light'], [390, 780, 'dark']]) {
  const tag = `patterns ${w}x${h} ${theme}`;
  const { ctx, page } = await check(`${out}/patterns.html`, w, h, theme, tag);

  const cards = page.locator('article.pattern');
  const n = await cards.count();
  if (n < 12) problems.push(`${tag}: ${n} pattern cards, expected at least 12`);

  // Every card must show both halves of its comparison, or it is not a comparison.
  const halves = await cards.evaluateAll((els) =>
    els.map((el) => ({
      id: el.id,
      dont: (el.querySelector('.side.dont code')?.textContent ?? '').trim().length,
      do: (el.querySelector('.side.do code')?.textContent ?? '').trim().length,
    })));
  for (const c of halves) {
    if (!c.dont || !c.do) problems.push(`${tag}: pattern ${c.id} is missing a ${c.dont ? 'DO' : "DON'T"} example`);
  }

  const chips = page.locator('button[data-proof]:not([disabled])');
  const proved = await chips.count();
  if (proved < 12) problems.push(`${tag}: ${proved} proved patterns, expected at least 12`);

  for (const i of [0, Math.floor(proved / 2), proved - 1]) {
    const chip = chips.nth(i);
    await chip.scrollIntoViewIfNeeded();
    await chip.click();
    const pop = page.locator('#pop');
    if (!(await pop.isVisible())) { problems.push(`${tag}: proof ${i} did not open`); continue; }
    const box = await pop.boundingBox();
    if (box.x < 0 || box.y < 0 || box.x + box.width > w + 1 || box.y + box.height > h + 1) {
      problems.push(`${tag}: proof popover off-screen: ${JSON.stringify(box)}`);
    }
    if ((await pop.locator('.pop-row').count()) < 2) problems.push(`${tag}: proof ${i} has no figures`);
    await page.keyboard.press('Escape');
  }

  const fingerprint = (await page.locator('#fingerprint').innerText()).trim();
  if (!/patterns proved/.test(fingerprint)) problems.push(`${tag}: no run fingerprint (${fingerprint})`);

  if (process.env.BM_SHOT && w === 1280) {
    await page.screenshot({ path: `${process.env.BM_SHOT}/patterns-${theme}.png`, fullPage: true });
  }
  await ctx.close();
}

// --- dashboard regression ---------------------------------------------------
{
  const tag = 'dashboard 1280 light';
  const { ctx, page } = await check(`${out}/index.html`, 1280, 900, 'light', tag);
  const sections = await page.locator('#sections section').count();
  if (sections < 10) problems.push(`${tag}: only ${sections} sections rendered`);
  const term = page.locator('[data-term]').first();
  await term.scrollIntoViewIfNeeded();
  await term.click();
  if (!(await page.locator('#pop').isVisible())) problems.push(`${tag}: glossary popover did not open`);
  await page.keyboard.press('Escape');
  const hrefs = await page.locator('#headerLinks a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  if (!hrefs.includes('accessibility.html')) problems.push(`${tag}: no link to the matrix page (${hrefs})`);
  if (!hrefs.includes('patterns.html')) problems.push(`${tag}: no link to the patterns page (${hrefs})`);
  // theme toggle still wired
  await page.locator('#themeToggle').click();
  const t = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  if (t !== 'dark') problems.push(`${tag}: theme toggle did not flip (${t})`);
  await ctx.close();
}

await browser.close();
console.log(
  problems.length
    ? 'PROBLEMS:\n' + problems.map((p) => '  - ' + p).join('\n')
    : `Checked ${out}: pages render, popovers open and stay anchored, no console errors.`,
);
process.exit(problems.length ? 1 : 0);
