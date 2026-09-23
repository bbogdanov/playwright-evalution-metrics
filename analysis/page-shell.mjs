/**
 * Chrome shared by every generated page: theme tokens, the pinned popover, the
 * theme toggle, and the site navigation.
 *
 * Extracted so the dashboard and the accessibility matrix cannot drift apart.
 * Two pages published side by side that disagree about their own colours, or
 * behave differently when you click an explanation, read as two projects.
 *
 * Deliberately excludes anything page-specific: charts, glossary content, matrix
 * data. This is the frame, not the picture.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PALETTE } from './palette.mjs';
import { blobUrl } from './repo-link.mjs';

/** CSS custom properties per mode, emitted for both the OS setting and the theme toggle. */
export function tokenBlock(mode) {
  const p = PALETTE[mode];
  return `
    color-scheme: ${mode};
    --surface-1: ${p.surface};
    --plane: ${p.plane};
    --text-primary: ${p.primary};
    --text-secondary: ${p.secondary};
    --text-muted: ${p.muted};
    --grid: ${p.grid};
    --axis: ${p.axis};
    --border: ${p.border};
${p.series.map((c, i) => `    --series-${i + 1}: ${c};`).join('\n')}
${p.seq.map((c, i) => `    --seq-${i}: ${c};`).join('\n')}`;
}

/**
 * Styles for the popover and the affordances that open it.
 *
 * The popover is pinned rather than hover-only: its content runs to a paragraph
 * and a code sample, which is more than anyone should have to read while holding
 * a mouse still, and it can contain a link.
 */
export const SHELL_STYLES = `
.term {
  font: inherit;
  color: inherit;
  background: none;
  border: 0;
  padding: 0 1px;
  border-bottom: 1px dotted var(--text-muted);
  cursor: help;
}
.term:hover, .term:focus-visible { border-bottom-style: solid; color: var(--series-1); outline: none; }
.term[aria-expanded="true"] { border-bottom-style: solid; color: var(--series-1); }
.term-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.95em;
  border-bottom: 1px dotted var(--text-muted);
  cursor: help;
  background: none; border-top: 0; border-left: 0; border-right: 0;
  color: inherit; padding: 0;
}
.term-code:hover, .term-code:focus-visible { color: var(--series-1); border-bottom-style: solid; outline: none; }

#pop {
  position: fixed;
  z-index: 60;
  max-width: 420px;
  background: var(--surface-1);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: 9px;
  padding: 12px 14px;
  box-shadow: 0 10px 34px rgba(0,0,0,.20);
  font: 13px/1.55 system-ui, sans-serif;
  display: none;
}
#pop[data-open="true"] { display: block; }
#pop .pop-term { font-weight: 600; font-size: 13.5px; margin-bottom: 4px; padding-right: 18px; }
#pop .pop-short { color: var(--text-primary); margin-bottom: 8px; }
#pop .pop-detail { color: var(--text-secondary); font-size: 12.5px; }
#pop .pop-call, #pop pre {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px;
  line-height: 1.5;
  background: var(--plane);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 6px 8px;
  margin: 6px 0 8px;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
#pop .pop-close {
  position: absolute; top: 6px; right: 8px;
  background: none; border: 0; color: var(--text-muted);
  font-size: 15px; line-height: 1; cursor: pointer; padding: 2px 4px;
}
#pop .pop-close:hover { color: var(--text-primary); }
.ref-link {
  font-size: 12.5px;
  color: var(--series-1);
  text-decoration: none;
  border-bottom: 1px solid transparent;
}
.ref-link:hover { border-bottom-color: currentColor; }
.toggle {
  float: right; font-size: 12px; color: var(--text-secondary);
  background: none; border: 1px solid var(--border); border-radius: 6px;
  padding: 4px 10px; cursor: pointer;
}
`;

/**
 * Popover runtime and theme toggle.
 *
 * Positioned below the trigger, flipped above when there is no room, and clamped
 * to the viewport so it never renders off-screen on a phone. Closes on Escape, on
 * a click outside, and once its trigger has scrolled out of sight.
 *
 * Scrolling re-anchors rather than closing. Closing on any scroll looks correct
 * until you click a control that is only half on screen: the browser scrolls it
 * into view, that scroll fires, and the popover you just opened disappears.
 */
export const SHELL_SCRIPT = String.raw`
const pop = document.getElementById('pop');
let popTrigger = null;

// The sticky bar covers the top of the viewport; a popover placed there is hidden.
function navHeight() {
  const bar = document.querySelector('.site-nav');
  return bar ? bar.getBoundingClientRect().height : 0;
}

function openPop(trigger, html) {
  if (popTrigger === trigger && pop.dataset.open === 'true') { closePop(); return; }
  closePop();
  popTrigger = trigger;
  pop.innerHTML = '<button class="pop-close" type="button" aria-label="Close">×</button>' + html;
  pop.dataset.open = 'true';
  trigger.setAttribute('aria-expanded', 'true');
  placePop();
  pop.querySelector('.pop-close').addEventListener('click', closePop);
}

function placePop() {
  if (!popTrigger) return;
  const t = popTrigger.getBoundingClientRect();
  const r = pop.getBoundingClientRect();
  const margin = 8;
  const floor = navHeight() + margin;
  let top = t.bottom + 6;
  if (top + r.height > innerHeight - margin) {
    const above = t.top - r.height - 6;
    top = above >= floor ? above : Math.max(floor, innerHeight - r.height - margin);
  }
  let left = t.left;
  if (left + r.width > innerWidth - margin) left = innerWidth - r.width - margin;
  pop.style.left = Math.max(margin, left) + 'px';
  pop.style.top = top + 'px';
}

function closePop() {
  pop.dataset.open = 'false';
  if (popTrigger) popTrigger.setAttribute('aria-expanded', 'false');
  popTrigger = null;
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePop(); });
document.addEventListener('click', (e) => {
  if (pop.dataset.open !== 'true') return;
  if (pop.contains(e.target) || (popTrigger && popTrigger.contains(e.target))) return;
  closePop();
});

// One reposition per frame: scroll fires far more often than the layout changes.
let queued = false;
addEventListener('scroll', () => {
  if (pop.dataset.open !== 'true' || queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    if (!popTrigger || pop.dataset.open !== 'true') return;
    const t = popTrigger.getBoundingClientRect();
    if (t.bottom < navHeight() || t.top > innerHeight) { closePop(); return; }
    placePop();
  });
}, { passive: true });
addEventListener('resize', closePop);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

(function theme() {
  const btn = document.getElementById('themeToggle');
  if (!btn) return;
  let stored = null;
  try { stored = localStorage.getItem('bm-theme'); } catch { /* private mode */ }
  if (stored) document.documentElement.setAttribute('data-theme', stored);
  btn.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const isDark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    const next = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('bm-theme', next); } catch { /* ignore */ }
  });
})();
`;

/**
 * The pages published together, in reading order. `file` is relative to the
 * output directory, which is also the published site root.
 */
const PAGES = [
  { id: 'results', file: 'index.html', label: 'Results' },
  { id: 'accessibility', file: 'accessibility.html', label: 'Accessibility' },
  { id: 'patterns', file: 'patterns.html', label: 'Patterns' },
];

const escHtml = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * The sticky bar every page opens with, rendered at build time so it is there
 * before any script runs.
 *
 * A sibling page is linked only when its file exists next to this one, the same
 * rule the dashboard always used for its header links: a link to a page that was
 * never generated is worse than no link. The dashboard is the exception, because
 * it is the site root. The current page is always listed, even on a first build
 * where its file does not exist yet.
 */
export function siteNav(current, outDir) {
  const pages = PAGES.filter((p) =>
    p.id === current || p.id === 'results' || existsSync(resolve(outDir, p.file)));
  const external = [];
  if (existsSync(resolve(outDir, 'playwright-report/index.html'))) {
    external.push({ href: 'playwright-report/index.html', label: 'Run report', title: 'Playwright run report: every test, timing and failure', newTab: false });
  }
  const reference = blobUrl('docs/LOCATOR-REFERENCE.md');
  if (reference) {
    external.push({ href: reference, label: 'Reference', title: 'Locator reference: what every strategy actually executes', newTab: true });
  }
  const pageLinks = pages.map((p) =>
    `<a href="${p.file}"${p.id === current ? ' aria-current="page"' : ''}>${p.label}</a>`).join('');
  const extLinks = external.map((e) =>
    `<a class="site-ext" href="${escHtml(e.href)}" title="${escHtml(e.title)}"` +
    `${e.newTab ? ' target="_blank" rel="noopener"' : ''}>${e.label} <span aria-hidden="true">↗</span></a>`).join('');
  const currentLabel = PAGES.find((p) => p.id === current).label;

  return `<a class="skip-link" href="#main">Skip to content</a>
<nav class="site-nav" aria-label="Site">
  <span class="site-brand">Locator benchmark</span>
  <span class="site-pages">${pageLinks}</span>
  ${extLinks ? `<span class="site-sep" aria-hidden="true"></span>${extLinks}` : ''}
  <span class="site-spacer"></span>
  <button class="site-menu-btn" type="button" aria-expanded="false" aria-controls="siteMenu">${currentLabel} <span class="site-menu-sections">· Sections</span> <span aria-hidden="true">▾</span></button>
  <button class="toggle" id="themeToggle" type="button">Theme</button>
</nav>
<div class="site-menu" id="siteMenu" hidden>
  <div class="site-menu-grp">Pages</div>
  ${pages.map((p) => `<a href="${p.file}"${p.id === current ? ' aria-current="page"' : ''}>${p.label}</a>`).join('\n  ')}
  <div class="site-menu-grp site-menu-toc-head" hidden>On this page</div>
  <div class="site-menu-toc"></div>
  ${external.length ? `<div class="site-menu-grp">Elsewhere</div>
  ${external.map((e) => `<a href="${escHtml(e.href)}"${e.newTab ? ' target="_blank" rel="noopener"' : ''}>${e.label} ↗</a>`).join('\n  ')}` : ''}
</div>
<button class="to-top" type="button" aria-label="Back to top" hidden>↑</button>`;
}

/**
 * Styles for the bar, the section list, the phone menu and the heading anchors.
 *
 * The section list only appears on pages that ask for it with `data-toc` on the
 * body, and only from 1280px: below that, taking 260px from the content costs
 * more than a menu one tap away. The content column keeps its 1180px cap and
 * slides right only as far as the list needs, so a wide screen does not turn
 * into one very wide column.
 */
export const NAV_STYLES = `
:root { --nav-h: 48px; }
[id] { scroll-margin-top: calc(var(--nav-h) + 12px); }
.skip-link { position: absolute; left: 8px; top: -40px; z-index: 80; background: var(--surface-1); color: var(--text-primary);
  border: 1px solid var(--border); border-radius: 6px; padding: 6px 10px; font-size: 13px; }
.skip-link:focus { top: 8px; }
.site-nav {
  position: sticky; top: 0; z-index: 70; height: var(--nav-h);
  display: flex; align-items: center; gap: 2px; padding: 0 16px;
  background: color-mix(in srgb, var(--surface-1) 90%, transparent);
  -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--border);
  font: 13px/1 system-ui, -apple-system, "Segoe UI", sans-serif;
}
.site-brand { font-weight: 650; margin-right: 14px; white-space: nowrap; }
.site-pages { display: flex; gap: 2px; }
.site-nav a { color: var(--text-secondary); text-decoration: none; padding: 8px 10px; border-radius: 6px; white-space: nowrap; }
.site-nav a:hover, .site-nav a:focus-visible { color: var(--text-primary); background: var(--plane); outline: none; }
.site-nav a[aria-current="page"] { color: var(--text-primary); background: var(--plane); box-shadow: inset 0 -2px 0 var(--series-1); }
.site-sep { width: 1px; height: 20px; background: var(--border); margin: 0 8px; }
.site-spacer { flex: 1; }
.site-nav .toggle { float: none; margin-left: 6px; }
.site-menu-btn {
  display: none; font: inherit; color: var(--text-primary); background: var(--plane);
  border: 1px solid var(--border); border-radius: 6px; padding: 7px 10px; cursor: pointer; white-space: nowrap;
}
.site-menu {
  position: fixed; top: calc(var(--nav-h) + 6px); left: 12px; right: 12px; z-index: 71;
  max-height: calc(100vh - var(--nav-h) - 24px); overflow: auto;
  background: var(--surface-1); border: 1px solid var(--border); border-radius: 10px;
  box-shadow: 0 10px 34px rgba(0,0,0,.2); padding: 8px;
  font: 14px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif;
}
.site-menu[hidden] { display: none; }
.site-menu a { display: block; padding: 10px 12px; color: var(--text-primary); text-decoration: none; border-radius: 6px; }
.site-menu a[aria-current="page"], .site-menu a.is-current { background: var(--plane); box-shadow: inset 2px 0 0 var(--series-1); }
.site-menu-grp { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--text-muted); padding: 10px 12px 4px; }
.site-toc { display: none; }
.heading-anchor { margin-left: 8px; color: var(--text-muted); text-decoration: none; font-weight: 400; opacity: 0; }
h2:hover .heading-anchor, .heading-anchor:focus-visible { opacity: 1; }
.heading-anchor:hover { color: var(--series-1); }
.to-top {
  position: fixed; right: 20px; bottom: 20px; z-index: 65; width: 40px; height: 40px; border-radius: 20px;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  background: var(--surface-1); border: 1px solid var(--border); color: var(--text-secondary); font-size: 18px;
  box-shadow: 0 4px 14px rgba(0,0,0,.15);
}
.to-top[hidden] { display: none; }
.to-top:hover { color: var(--text-primary); }
@media (min-width: 1280px) {
  body[data-toc] { --toc-gutter: max(260px, calc((100vw - 1180px) / 2)); }
  body[data-toc] .wrap { margin-left: var(--toc-gutter); margin-right: auto; max-width: min(1180px, calc(100vw - 260px - 24px)); }
  body[data-toc] .site-toc {
    display: block; position: fixed; top: calc(var(--nav-h) + 24px); left: calc(var(--toc-gutter) - 236px); width: 212px;
    max-height: calc(100vh - var(--nav-h) - 48px); overflow: auto;
    font: 13px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .site-toc p { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--text-muted); margin: 0 0 8px 12px; }
  .site-toc a { display: block; padding: 6px 12px; color: var(--text-secondary); text-decoration: none; border-left: 2px solid var(--border); }
  .site-toc a:hover { color: var(--text-primary); }
  .site-toc a.is-current { color: var(--text-primary); border-left-color: var(--series-1); font-weight: 600; }
}
@media (max-width: 760px) {
  .site-brand, .site-pages, .site-sep, .site-ext { display: none; }
  .site-menu-btn { display: inline-block; }
}
`;

/**
 * Heading anchors, the section list, the phone menu and back-to-top.
 *
 * Runs on DOMContentLoaded because the dashboard builds its sections from data in
 * an inline script; by then they exist. Every h2 in the content gets an id, so
 * any section can be linked to. A heading whose section already has an id - the
 * patterns families, the dashboard glossary - links to that id instead, so the
 * URLs people have already shared keep working.
 *
 * The current section is the last heading above 30% of the viewport, and the
 * last one once the page is scrolled to the bottom: a short final section never
 * reaches that line, and would otherwise never highlight.
 */
export const NAV_SCRIPT = String.raw`
(function siteNav() {
  function init() {
    const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
    const heads = [...document.querySelectorAll('.wrap h2')];
    const used = new Set();
    const entries = heads.map((h) => {
      const title = h.textContent.trim();
      const sec = h.closest('section[id]');
      let id = h.id || (sec && sec.querySelector('h2') === h ? sec.id : '');
      if (!id) {
        id = slug(title);
        for (let n = 2; used.has(id) || document.getElementById(id); n++) id = slug(title) + '-' + n;
        h.id = id;
      }
      used.add(id);
      const a = document.createElement('a');
      a.className = 'heading-anchor';
      a.href = '#' + id;
      a.textContent = '#';
      a.setAttribute('aria-label', 'Link to this section: ' + title);
      h.append(a);
      return { id, title, el: h };
    });

    const links = (cls) => entries.map((e) =>
      '<a href="#' + esc(e.id) + '" data-for="' + esc(e.id) + '"' + (cls ? ' class="' + cls + '"' : '') + '>' +
      esc(e.title) + '</a>').join('');

    if (document.body.hasAttribute('data-toc') && entries.length) {
      const toc = document.createElement('nav');
      toc.className = 'site-toc';
      toc.setAttribute('aria-label', 'On this page');
      toc.innerHTML = '<p>On this page</p>' + links('');
      document.body.append(toc);
    }

    const menu = document.getElementById('siteMenu');
    const btn = document.querySelector('.site-menu-btn');
    if (menu && btn) {
      if (entries.length) {
        menu.querySelector('.site-menu-toc-head').hidden = false;
        menu.querySelector('.site-menu-toc').innerHTML = links('');
      } else {
        btn.querySelector('.site-menu-sections').hidden = true;
      }
      const setOpen = (open) => { menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };
      btn.addEventListener('click', (e) => { e.stopPropagation(); setOpen(menu.hidden); });
      menu.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
      document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target)) setOpen(false); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { setOpen(false); btn.focus(); } });
      addEventListener('resize', () => setOpen(false));
    }

    const top = document.querySelector('.to-top');
    if (top) top.addEventListener('click', () => { scrollTo({ top: 0 }); document.getElementById('main')?.focus({ preventScroll: true }); });

    let queued = false;
    function spy() {
      queued = false;
      if (top) top.hidden = scrollY < innerHeight;
      let cur = entries.length ? entries[0].id : null;
      for (const e of entries) if (e.el.getBoundingClientRect().top < innerHeight * 0.3) cur = e.id;
      if (entries.length && innerHeight + scrollY >= document.documentElement.scrollHeight - 4) cur = entries[entries.length - 1].id;
      document.querySelectorAll('[data-for]').forEach((a) => {
        const on = a.dataset.for === cur;
        a.classList.toggle('is-current', on);
        if (on) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
      });
    }
    addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(spy); } }, { passive: true });
    addEventListener('resize', spy);
    spy();

    // The ids above did not exist when the browser tried to honour the URL's hash.
    if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
`;
