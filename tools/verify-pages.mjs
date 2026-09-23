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

// Site bar, heading anchors, section list and phone menu - shared by every page.
async function checkNav(page, tag, file, w, h, { toc }) {
  const current = await page.locator('.site-nav a[aria-current="page"]').first().getAttribute('href');
  if (current !== file) problems.push(`${tag}: site bar marks ${current} as current, expected ${file}`);
  const hrefs = await page.locator('.site-nav a, #siteMenu a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  for (const want of ['index.html', 'accessibility.html', 'patterns.html']) {
    if (!hrefs.includes(want)) problems.push(`${tag}: no site link to ${want} (${hrefs})`);
  }

  const heads = await page.locator('main h2').evaluateAll((hs) =>
    hs.map((x) => ({ id: x.id || x.closest('section[id]')?.id || '', anchor: x.querySelector('.heading-anchor')?.getAttribute('href') })));
  if (!heads.length) problems.push(`${tag}: no section headings found`);
  const ids = heads.map((x) => x.id);
  if (ids.some((id) => !id)) problems.push(`${tag}: a section heading has no id`);
  if (new Set(ids).size !== ids.length) problems.push(`${tag}: duplicate section ids (${ids})`);
  for (const x of heads) {
    if (x.anchor !== '#' + x.id) problems.push(`${tag}: heading ${x.id} anchor is ${x.anchor}`);
  }
  const barBottom = await page.locator('.site-nav').evaluate((n) => n.getBoundingClientRect().bottom);

  if (w >= 1280) {
    const tocLinks = page.locator('.site-toc a');
    const n = await tocLinks.count();
    if (toc && n !== heads.length) problems.push(`${tag}: section list has ${n} entries for ${heads.length} headings`);
    if (!toc && (await page.locator('.site-toc').isVisible())) problems.push(`${tag}: section list shown on a page without one`);
    if (toc && n) {
      // Jumping lands the heading below the sticky bar, and the list follows.
      const mid = Math.floor(n / 2);
      await tocLinks.nth(mid).click();
      await page.waitForTimeout(250);
      const top = await page.locator('#' + ids[mid]).evaluate((el) => el.getBoundingClientRect().top);
      if (top < barBottom) problems.push(`${tag}: section ${ids[mid]} lands under the bar (${top.toFixed(0)} < ${barBottom.toFixed(0)})`);
      const on = await page.locator('.site-toc a.is-current').getAttribute('href');
      if (on !== '#' + ids[mid]) problems.push(`${tag}: section list highlights ${on} after jumping to #${ids[mid]}`);
      // On a tall screen the last section never reaches the highlight line on its
      // own; scrolled to the bottom, it must still be the one highlighted.
      await page.setViewportSize({ width: w, height: 1600 });
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(250);
      const last = await page.locator('.site-toc a.is-current').getAttribute('href');
      if (last !== '#' + ids.at(-1)) problems.push(`${tag}: at the bottom the list highlights ${last}, expected #${ids.at(-1)}`);
      await page.setViewportSize({ width: w, height: h });
      if (!(await page.locator('.to-top').isVisible())) problems.push(`${tag}: back-to-top missing after scrolling`);
      await page.locator('.to-top').click();
      await page.waitForTimeout(150);
      if ((await page.evaluate(() => scrollY)) > 0) problems.push(`${tag}: back-to-top did not scroll to the top`);
    }
  } else {
    const btn = page.locator('.site-menu-btn');
    if (!(await btn.isVisible())) { problems.push(`${tag}: no menu button on a narrow screen`); return; }
    if (await page.locator('.site-pages').isVisible()) problems.push(`${tag}: page links still inline on a narrow screen`);
    await btn.click();
    const menu = page.locator('#siteMenu');
    if (!(await menu.isVisible())) { problems.push(`${tag}: menu did not open`); return; }
    const box = await menu.boundingBox();
    if (box.x < 0 || box.x + box.width > w + 1 || box.y + box.height > h + 1) problems.push(`${tag}: menu off-screen ${JSON.stringify(box)}`);
    const sections = await menu.locator('.site-menu-toc a').count();
    if (sections !== heads.length) problems.push(`${tag}: menu lists ${sections} sections for ${heads.length} headings`);
    await page.keyboard.press('Escape');
    if (await menu.isVisible()) problems.push(`${tag}: Escape did not close the menu`);
    await btn.click();
    await menu.locator('.site-menu-toc a').last().click();
    await page.waitForTimeout(250);
    if (await menu.isVisible()) problems.push(`${tag}: menu stayed open after choosing a section`);
    await page.evaluate(() => scrollTo(0, 0));
  }
}

// --- accessibility page -----------------------------------------------------
for (const [w, h, theme] of [[1280, 900, 'light'], [1280, 900, 'dark'], [390, 780, 'light']]) {
  const tag = `a11y ${w}x${h} ${theme}`;
  const { ctx, page } = await check(`${out}/accessibility.html`, w, h, theme, tag);

  const cells = page.locator('button[data-cell]');
  const n = await cells.count();
  if (n !== 36) problems.push(`${tag}: ${n} cells, expected 36`);

  await checkNav(page, tag, 'accessibility.html', w, h, { toc: false });

  // first, last, and one near the bottom edge so the flip-above path runs
  for (const i of [0, 20, n - 1]) {
    const cell = cells.nth(i);
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    const pop = page.locator('#pop');
    if (!(await pop.isVisible())) { problems.push(`${tag}: popover did not open on cell ${i}`); continue; }
    const box = await pop.boundingBox();
    if (box.x < 0 || box.y < 48 || box.x + box.width > w + 1 || box.y + box.height > h + 1) {
      problems.push(`${tag}: popover off-screen or under the bar on cell ${i}: ${JSON.stringify(box)}`);
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

  // A screen too short for the popover above or below its cell: it is pinned to
  // the top of the free area, which starts under the sticky bar, not at 0.
  if (w < 800) {
    await page.setViewportSize({ width: w, height: 360 });
    const cell = cells.nth(0);
    await page.evaluate(() => {
      const el = document.querySelector('button[data-cell]');
      scrollBy(0, el.getBoundingClientRect().top - 170);
    });
    await cell.click();
    const pop = page.locator('#pop');
    const bar = await page.locator('.site-nav').evaluate((n) => n.getBoundingClientRect().bottom);
    const box = await pop.boundingBox();
    if (!box) problems.push(`${tag}: popover did not open on a short screen`);
    else if (box.height <= 360 - 170 - 8 && box.height <= 170 - bar) {
      problems.push(`${tag}: short-screen popover fits on one side (${box.height.toFixed(0)}px), test is vacuous`);
    } else if (box.y < bar) problems.push(`${tag}: popover under the bar on a short screen (${box.y.toFixed(0)} < ${bar.toFixed(0)})`);
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: w, height: h });
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

  await checkNav(page, tag, 'patterns.html', w, h, { toc: true });

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
    if (box.x < 0 || box.y < 48 || box.x + box.width > w + 1 || box.y + box.height > h + 1) {
      problems.push(`${tag}: proof popover off-screen or under the bar: ${JSON.stringify(box)}`);
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
  await checkNav(page, tag, 'index.html', 1280, 900, { toc: true });
  // theme toggle still wired
  await page.locator('#themeToggle').click();
  const t = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  if (t !== 'dark') problems.push(`${tag}: theme toggle did not flip (${t})`);
  await ctx.close();
}

// The dashboard at phone width: the menu replaces the bar's links, and nothing
// on the widest page may push the layout sideways.
{
  const tag = 'dashboard 390 dark';
  const { ctx, page } = await check(`${out}/index.html`, 390, 780, 'dark', tag);
  await checkNav(page, tag, 'index.html', 390, 780, { toc: true });
  await ctx.close();
}

await browser.close();
console.log(
  problems.length
    ? 'PROBLEMS:\n' + problems.map((p) => '  - ' + p).join('\n')
    : `Checked ${out}: pages render, popovers open and stay anchored, no console errors.`,
);
process.exit(problems.length ? 1 : 0);
