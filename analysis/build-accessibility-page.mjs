/**
 * Renders the test-level matrix as a standalone page: results/dashboard/accessibility.html
 *
 * The matrix is the one part of this project that is argument rather than
 * measurement, so it gets its own page instead of a section on the results
 * dashboard. The two are linked, and share their chrome via page-shell.mjs, but
 * a reader should never be unsure which they are looking at.
 *
 * Every Yes/No cell opens the reasoning behind that verdict together with the
 * code it recommends. A matrix of bare verdicts is unfalsifiable; a matrix where
 * every cell shows its working can be argued with, which is the point.
 *
 * Self-contained, like the dashboard: no CDN, no build step, no network.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { STATUS } from './palette.mjs';
import { tokenBlock, SHELL_STYLES, SHELL_SCRIPT } from './page-shell.mjs';
import { LEVELS, ROWS, MEASURED } from './a11y-matrix.mjs';
import { blobUrl } from './repo-link.mjs';

const OUT = resolve(process.env.BM_A11Y_PAGE ?? 'results/dashboard/accessibility.html');

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Cell text, keyed `row|level`, handed to the client as JSON rather than written
 * into data- attributes: the reasoning runs to a paragraph and a code sample,
 * and escaping that twice through HTML attributes is how quotes get mangled.
 */
const CELLS = {};
for (const row of ROWS) {
  for (const level of LEVELS) {
    const cell = row.cells[level.id];
    if (!cell) continue;
    CELLS[`${row.id}|${level.id}`] = {
      title: `${row.label} — ${level.title}`,
      verdict: cell.verdict,
      why: cell.why,
      example: cell.example,
    };
  }
}

const VERDICT = {
  yes: { label: 'Yes', glyph: '✓' },
  no: { label: 'No', glyph: '✕' },
};

function headRow() {
  return (
    '<tr><th scope="col" class="rowhead">Locator</th>' +
    LEVELS.map(
      (l) =>
        `<th scope="col"><span class="lvl">${esc(l.title)}</span>` +
        `<span class="scale">${esc(l.scale)}</span></th>`,
    ).join('') +
    '</tr>'
  );
}

function bodyRow(row) {
  const cells = LEVELS.map((level) => {
    const cell = row.cells[level.id];
    if (!cell) return '<td class="cell"><span class="absent">—</span></td>';
    const v = VERDICT[cell.verdict];
    return (
      `<td class="cell"><button class="verdict v-${esc(cell.verdict)}" type="button"` +
      ` data-cell="${esc(`${row.id}|${level.id}`)}" aria-expanded="false"` +
      ` aria-label="${esc(`${v.label}: ${row.label} at ${level.title} level. Show reasoning.`)}">` +
      `<span class="glyph" aria-hidden="true">${v.glyph}</span>${v.label}</button></td>`
    );
  }).join('');

  return (
    '<tr><th scope="row" class="rowhead">' +
    `<code>${esc(row.label)}</code>` +
    `<span class="summary">${esc(row.summary)}</span></th>${cells}</tr>`
  );
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Accessibility and test levels</title>
<style>
:root {${tokenBlock('light')}
  --status-good: ${STATUS.good};
  --status-critical: ${STATUS.critical};
  --yes-bg: rgba(12,163,12,0.10);
  --no-bg: rgba(208,59,59,0.10);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {${tokenBlock('dark')}
    --yes-bg: rgba(12,163,12,0.16);
    --no-bg: rgba(208,59,59,0.16);
  }
}
:root[data-theme="dark"] {${tokenBlock('dark')}
  --yes-bg: rgba(12,163,12,0.16);
  --no-bg: rgba(208,59,59,0.16);
}

* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--plane);
  color: var(--text-primary);
  font: 14px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif;
}
.wrap { max-width: 1180px; margin: 0 auto; padding: 32px 16px 96px; }
header h1 { font-size: 26px; margin: 0 0 4px; letter-spacing: -0.01em; }
.sub { color: var(--text-secondary); margin: 0 0 6px; max-width: 78ch; }
h2 { font-size: 17px; margin: 36px 0 6px; letter-spacing: -0.005em; }
.lede { color: var(--text-secondary); margin: 0 0 14px; max-width: 78ch; }

.claim {
  border-left: 2px solid var(--series-4);
  padding: 8px 0 8px 12px;
  margin: 18px 0 26px;
  color: var(--text-secondary);
  max-width: 78ch;
}
.claim strong { color: var(--text-primary); }

.levels { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 0 0 8px; }
.level {
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: 9px;
  padding: 12px 14px;
}
.level h3 { margin: 0 0 2px; font-size: 14px; }
.level .scale {
  display: block;
  font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--text-muted);
  margin-bottom: 6px;
}
.level p { margin: 0 0 6px; font-size: 12.5px; color: var(--text-secondary); }
.level .note { font-size: 12px; color: var(--text-muted); margin: 0; }

.matrix-scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; min-width: 680px; }
th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid var(--grid); vertical-align: top; }
thead th { border-bottom: 1px solid var(--axis); white-space: nowrap; }
thead th .lvl { display: block; font-size: 13px; }
thead th .scale {
  display: block; font-weight: 400;
  font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--text-muted);
}
.rowhead { width: 30%; min-width: 220px; font-weight: 600; }
.rowhead code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px;
  display: block;
}
.rowhead .summary { display: block; font-weight: 400; font-size: 12px; color: var(--text-muted); margin-top: 3px; }
td.cell { width: 17.5%; }
.absent { color: var(--text-muted); }

.verdict {
  font: 600 12.5px/1 system-ui, sans-serif;
  display: inline-flex; align-items: center; gap: 6px;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 6px 12px 6px 10px;
  cursor: pointer;
  color: var(--text-primary);
  background: var(--surface-1);
}
.verdict .glyph { font-size: 12px; line-height: 1; }
.verdict.v-yes { background: var(--yes-bg); }
.verdict.v-yes .glyph { color: var(--status-good); }
.verdict.v-no { background: var(--no-bg); }
.verdict.v-no .glyph { color: var(--status-critical); }
.verdict:hover, .verdict:focus-visible { border-color: var(--series-1); outline: none; }
.verdict[aria-expanded="true"] { border-color: var(--series-1); box-shadow: 0 0 0 2px var(--yes-bg); }
.verdict::after { content: "?"; color: var(--text-muted); font-weight: 400; font-size: 11px; }

.hint { color: var(--text-muted); font-size: 12.5px; margin: 10px 0 0; }
.measured {
  font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--text-muted);
  border-left: 2px solid var(--axis);
  padding-left: 10px;
  margin: 26px 0 0;
}
#pop .pop-verdict { font-weight: 600; margin-bottom: 4px; }
#pop .pop-verdict.v-yes { color: ${STATUS.good}; }
#pop .pop-verdict.v-no { color: ${STATUS.critical}; }
${SHELL_STYLES}
@media (max-width: 900px) { .levels { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 640px) {
  .wrap { padding: 20px 16px 72px; }
  .levels { grid-template-columns: 1fr; }
  th, td { padding: 6px 7px; }
}
</style>
</head>
<body>
<div class="wrap">
  <button class="toggle" id="themeToggle" type="button">Theme</button>
  <header>
    <h1>Accessibility and test levels</h1>
    <p class="sub">
      Which of the expensive locators to reach for, at which test level, and what each verdict rests on.
      Click any cell for the reasoning and an example.
    </p>
    <p class="sub" id="headerLinks"></p>
  </header>

  <div class="claim">
    The rest of this project measures locators as a cost. This page is the counterweight:
    <strong>the expensive families are expensive because they do real work</strong>, and that work is the same
    work a screen reader does. <code>getByRole('button', { name: 'Delete' })</code> has no native DOM
    equivalent, so Playwright resolves the accessibility tree itself — which is exactly why it fails when the
    accessible name is gone. Measured here: a test-id locator is unchanged by a missing button name, a broken
    label association and a missing <code>alt</code> attribute. The role and label locators catch all three.
  </div>

  <h2>The levels</h2>
  <p class="lede">
    Cost is a function of how much DOM the query has to walk, so the same locator can be free at one level and
    expensive at another. That is the entire basis of the matrix.
  </p>
  <div class="levels">
${LEVELS.map(
  (l) => `    <div class="level">
      <h3>${esc(l.title)}</h3>
      <span class="scale">${esc(l.scale)}</span>
      <p>${esc(l.blurb)}</p>
      <p class="note">${esc(l.note)}</p>
    </div>`,
).join('\n')}
  </div>

  <h2>The matrix</h2>
  <p class="lede">
    <strong>Yes</strong> means reach for it by default at that level. <strong>No</strong> means prefer something
    else — not that it never works. Verdicts are judgement; the numbers quoted inside them are measured by this
    harness, so you can reject the advice and keep the evidence.
  </p>
  <div class="matrix-scroll">
    <table>
      <thead>${headRow()}</thead>
      <tbody>
${ROWS.map((r) => '        ' + bodyRow(r)).join('\n')}
      </tbody>
    </table>
  </div>
  <p class="hint">Every cell is a button. Escape or a click outside closes the explanation; it follows its cell while you scroll.</p>

  <h2>What this does not claim</h2>
  <p class="lede">
    Automated checking covers a well-understood subset of accessibility problems. Neither an axe scan nor a
    role-based locator tells you whether your focus order is sane, your error messages are useful, or your page
    makes sense read aloud. A clean scan is weaker evidence than people assume: the icon button in this project
    originally used a 🗑 emoji, and axe reported no violation because the emoji itself counts as the accessible
    name — the button passed the scan while announcing itself as "wastebasket". It only became detectable once
    the glyph was marked <code>aria-hidden</code>.
  </p>

  <p class="measured">
    Reference figures: click on a quiet page ${MEASURED.clickMs} ms &nbsp;·&nbsp; measurement floor
    ${MEASURED.floorMs} ms &nbsp;·&nbsp; getByRole + name
${LEVELS.map((l) => `    ${esc(l.title.toLowerCase())} ${esc(MEASURED.roleByTier[l.id] ?? '-')}`).join(' /\n')}
  </p>
</div>
<div id="pop" role="dialog" aria-modal="false" aria-label="Why this verdict"></div>
<script id="cells" type="application/json">${JSON.stringify(CELLS).replace(/</g, '\\u003c')}</script>
<script>
const CELLS = JSON.parse(document.getElementById('cells').textContent);
const LINKS = ${JSON.stringify({ dashboard: 'index.html', doc: blobUrl('docs/ACCESSIBILITY-AND-TEST-LEVELS.md') }).replace(/</g, '\\u003c')};
${SHELL_SCRIPT}

function cellHtml(key) {
  const c = CELLS[key];
  if (!c) return '';
  const label = c.verdict === 'yes' ? 'Yes' : 'No';
  return '<div class="pop-term">' + esc(c.title) + '</div>' +
    '<div class="pop-verdict v-' + esc(c.verdict) + '">' + label + '</div>' +
    '<div class="pop-short">' + esc(c.why) + '</div>' +
    (c.example ? '<pre>' + esc(c.example) + '</pre>' : '');
}

document.addEventListener('click', (e) => {
  const cell = e.target.closest('[data-cell]');
  if (!cell) return;
  e.stopPropagation();
  openPop(cell, cellHtml(cell.dataset.cell));
});

(function headerLinks() {
  const parts = ['<a class="ref-link" href="' + esc(LINKS.dashboard) + '">&larr; Measured results dashboard</a>'];
  if (LINKS.doc) {
    parts.push('<a class="ref-link" href="' + esc(LINKS.doc) + '" target="_blank" rel="noopener">' +
               'The long-form argument, with the measurements behind it &rarr;</a>');
  }
  document.getElementById('headerLinks').innerHTML = parts.join(' &nbsp;·&nbsp; ');
})();
</script>
</body>
</html>`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);
console.log(
  `Wrote ${OUT} (${(html.length / 1024).toFixed(0)} kB, ` +
  `${ROWS.length} locators x ${LEVELS.length} levels = ${Object.keys(CELLS).length} cells)`,
);
