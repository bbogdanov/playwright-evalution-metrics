/**
 * Renders the composition patterns: results/dashboard/patterns.html
 *
 * Three sources, none of them retyped here:
 *
 *   analysis/composition-patterns.mjs   what each pattern means
 *   e2e/patterns/s14-composition.spec.ts  the code, extracted between markers
 *   results/composition.json            what happened when that code ran
 *
 * A pattern whose proof is missing still renders, labelled as unproven on this
 * run. A pattern whose code is missing does not render at all - the build stops,
 * because half a comparison is worse than none.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { STATUS } from './palette.mjs';
import { tokenBlock, SHELL_STYLES, SHELL_SCRIPT } from './page-shell.mjs';
import { FAMILIES, PATTERNS } from './composition-patterns.mjs';
import { snippetsFor } from './snippets.mjs';
import { blobUrl } from './repo-link.mjs';

const SPEC = 'e2e/patterns/s14-composition.spec.ts';
const OUT = resolve(process.env.BM_PATTERNS_PAGE ?? 'results/dashboard/patterns.html');
const PROOFS = resolve(process.env.BM_COMPOSITION ?? 'results/composition.json');

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const fmtMs = (v) =>
  !Number.isFinite(v) ? '-'
  : v >= 1000 ? (v / 1000).toFixed(2) + ' s'
  : v >= 1 ? v.toFixed(1) + ' ms'
  : v.toFixed(3) + ' ms';

const { pairs, setup, missing, extra } = snippetsFor(resolve(SPEC), PATTERNS);
if (missing.length) {
  console.error(`Missing example code in ${SPEC} for: ${missing.join(', ')}`);
  process.exit(1);
}
if (extra.length) console.warn(`Note: ${SPEC} marks snippets no pattern claims: ${extra.join(', ')}`);

const proofFile = existsSync(PROOFS) ? JSON.parse(readFileSync(PROOFS, 'utf8')) : null;
const proofs = proofFile?.proofs ?? {};

/** The chip on a pattern's heading: what the proof establishes, in one phrase. */
function chipLabel(proof) {
  if (!proof) return 'not proved on this run';
  if (proof.kind === 'cost') {
    const ratio = proof.doMs > 0 ? proof.dontMs / proof.doMs : null;
    return ratio && ratio >= 1.05
      ? `${fmtMs(proof.dontMs)} → ${fmtMs(proof.doMs)}, ${ratio.toFixed(1)}× faster`
      : `${fmtMs(proof.dontMs)} → ${fmtMs(proof.doMs)}`;
  }
  return 'proved: the wrong form gets the wrong answer';
}

const PROOF_TEXT = {};
for (const p of PATTERNS) {
  const proof = proofs[p.id];
  if (!proof) continue;
  PROOF_TEXT[p.id] = {
    title: p.title,
    kind: proof.kind,
    url: proof.url,
    note: p.proofNote,
    lines:
      proof.kind === 'cost'
        ? [
            ['The recommended form', fmtMs(proof.doMs)],
            ['What it replaces', fmtMs(proof.dontMs)],
            ['Difference', proof.doMs > 0 ? `${(proof.dontMs / proof.doMs).toFixed(1)}× ` : '-'],
            ['Page size', proof.domNodes ? `${proof.domNodes.toLocaleString('en-US')} elements` : '-'],
          ]
        : [['What the wrong form did', proof.dont], ['What the right form did', proof.did]],
    facts: Object.entries(proof.facts ?? {}).map(([k, v]) => [k, String(v)]),
  };
}

function patternCard(p) {
  const proof = proofs[p.id];
  const snips = pairs[p.id];
  const chipClass = !proof ? 'chip-none' : proof.kind === 'cost' ? 'chip-cost' : 'chip-correct';
  return `      <article class="pattern" id="${esc(p.id)}">
        <div class="pattern-head">
          <h3>${esc(p.title)}</h3>
          <button class="chip ${chipClass}" type="button" data-proof="${esc(p.id)}" aria-expanded="false"
                  ${proof ? '' : 'disabled'}>${esc(chipLabel(proof))}</button>
        </div>
        <p class="summary">${esc(p.summary)}</p>
        <div class="pair">
          <div class="side dont">
            <header><span class="mark" aria-hidden="true">✕</span>Don't</header>
            <pre><code>${esc(snips.dont)}</code></pre>
          </div>
          <div class="side do">
            <header><span class="mark" aria-hidden="true">✓</span>Do</header>
            <pre><code>${esc(snips.do)}</code></pre>
          </div>
        </div>
        <p class="why">${esc(p.why)}</p>
      </article>`;
}

const familySections = FAMILIES.map((f) => {
  const mine = PATTERNS.filter((p) => p.family === f.id);
  return `  <section class="family" id="family-${esc(f.id)}">
    <h2>${esc(f.title)}</h2>
    <p class="lede">${esc(f.lede)}</p>
${mine.map(patternCard).join('\n')}
  </section>`;
}).join('\n');

const proved = PATTERNS.filter((p) => proofs[p.id]).length;
const costProofs = PATTERNS.filter((p) => proofs[p.id]?.kind === 'cost').length;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Locator composition patterns</title>
<style>
:root {${tokenBlock('light')}
  --status-good: ${STATUS.good};
  --status-critical: ${STATUS.critical};
  --do-bg: rgba(12,163,12,0.07);
  --dont-bg: rgba(208,59,59,0.07);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {${tokenBlock('dark')}
    --do-bg: rgba(12,163,12,0.12);
    --dont-bg: rgba(208,59,59,0.12);
  }
}
:root[data-theme="dark"] {${tokenBlock('dark')}
  --do-bg: rgba(12,163,12,0.12);
  --dont-bg: rgba(208,59,59,0.12);
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
h2 { font-size: 17px; margin: 40px 0 6px; letter-spacing: -0.005em; }
.lede { color: var(--text-secondary); margin: 0 0 18px; max-width: 78ch; }
.jump { margin: 18px 0 26px; font-size: 13px; color: var(--text-muted); }
.jump a { color: var(--series-1); text-decoration: none; }
.jump a:hover { text-decoration: underline; }

.pattern {
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px 18px;
  margin: 0 0 14px;
}
.pattern-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.pattern h3 { font-size: 15px; margin: 0; flex: 1 1 auto; }
.summary { color: var(--text-secondary); margin: 6px 0 12px; max-width: 78ch; }
.why { color: var(--text-secondary); margin: 12px 0 0; max-width: 82ch; font-size: 13px; }

.chip {
  font: 500 11.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 5px 10px;
  cursor: pointer;
  background: var(--plane);
  color: var(--text-secondary);
  white-space: nowrap;
}
.chip:hover:not([disabled]), .chip:focus-visible { border-color: var(--series-1); color: var(--text-primary); outline: none; }
.chip[aria-expanded="true"] { border-color: var(--series-1); color: var(--text-primary); }
.chip[disabled] { cursor: default; opacity: .6; }
.chip-cost { color: var(--series-1); }
.chip-correct { color: var(--status-good); }
.chip::after { content: " ?"; color: var(--text-muted); }
.chip[disabled]::after { content: ""; }

.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.side { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.side header {
  font: 600 11.5px/1 system-ui, sans-serif;
  letter-spacing: .04em;
  text-transform: uppercase;
  padding: 8px 10px;
  display: flex; align-items: center; gap: 7px;
  border-bottom: 1px solid var(--border);
}
.side .mark { font-size: 12px; }
.side.dont header { background: var(--dont-bg); color: var(--status-critical); }
.side.do header { background: var(--do-bg); color: var(--status-good); }
.side pre {
  margin: 0;
  padding: 10px 12px;
  font: 11.5px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
  background: var(--surface-1);
  /* Wrapped, not scrolled: a horizontal scrollbar inside one half of a
     side-by-side comparison hides the difference the comparison exists for. */
  white-space: pre-wrap;
  overflow-wrap: break-word;
}
.side pre code { color: var(--text-primary); }

.setup-code { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: start; }
.setup-code pre {
  margin: 0;
  padding: 12px 14px;
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: 8px;
  font: 11.5px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: pre-wrap;
  overflow-wrap: break-word;
}
.fingerprint {
  font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--text-muted);
  border-left: 2px solid var(--axis);
  padding-left: 10px;
  margin: 34px 0 0;
}
#pop .pop-rows { margin: 6px 0 0; }
#pop .pop-row { display: flex; gap: 10px; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid var(--grid); }
#pop .pop-row:last-child { border-bottom: 0; }
#pop .pop-row .k { color: var(--text-secondary); }
#pop .pop-row .v { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; text-align: right; }
#pop .pop-note { color: var(--text-muted); font-size: 12px; margin-top: 8px; }
${SHELL_STYLES}
@media (max-width: 760px) {
  .pair, .setup-code { grid-template-columns: 1fr; }
  .wrap { padding: 20px 16px 72px; }
}
</style>
</head>
<body>
<div class="wrap">
  <button class="toggle" id="themeToggle" type="button">Theme</button>
  <header>
    <h1>Locator composition patterns</h1>
    <p class="sub">
      What happens when locators meet fixtures, page objects, chaining and assertions. Every pair is the code
      from one scenario in this repository, and every chip opens what that code did when it ran.
    </p>
    <p class="sub" id="headerLinks"></p>
  </header>

  <p class="jump">
    ${FAMILIES.map((f) => `<a href="#family-${esc(f.id)}">${esc(f.title)}</a>`).join(' &nbsp;·&nbsp; ')}
  </p>

  <section class="setup">
    <h2>What the examples are written against</h2>
    <p class="lede">
      Every pair below comes from one scenario file, so the examples share its fixture, its page object and a
      handful of constants. This is that shared context, extracted from the same file: <code>grid</code> is the
      fixture, and the page object hands out locators rather than elements - which is itself the first pattern.
    </p>
    <div class="setup-code">
      <pre><code>${esc(setup.constants ?? '')}</code></pre>
      <pre><code>${esc(setup['page-object'] ?? '')}</code></pre>
    </div>
  </section>

${familySections}

  <p class="fingerprint" id="fingerprint"></p>
</div>
<div id="pop" role="dialog" aria-modal="false" aria-label="What the measurement showed"></div>
<script id="proofs" type="application/json">${JSON.stringify(PROOF_TEXT).replace(/</g, '\\u003c')}</script>
<script>
const PROOFS = JSON.parse(document.getElementById('proofs').textContent);
const META = ${JSON.stringify({
  runId: proofFile?.runId ?? null,
  browserVersion: proofFile?.browserVersion ?? null,
  generatedAt: proofFile?.generatedAt ?? null,
  proved,
  total: PATTERNS.length,
  costProofs,
  specUrl: blobUrl(SPEC),
  dashboard: 'index.html',
  accessibility: existsSync(resolve(dirname(OUT), 'accessibility.html')) ? 'accessibility.html' : null,
}).replace(/</g, '\\u003c')};
${SHELL_SCRIPT}

function proofHtml(id) {
  const p = PROOFS[id];
  if (!p) return '';
  const rows = p.lines.map(([k, v]) =>
    '<div class="pop-row"><span class="k">' + esc(k) + '</span><span class="v">' + esc(v) + '</span></div>').join('');
  const facts = p.facts.length
    ? '<div class="pop-rows">' + p.facts.map(([k, v]) =>
        '<div class="pop-row"><span class="k">' + esc(k) + '</span><span class="v">' + esc(v) + '</span></div>').join('') + '</div>'
    : '';
  return '<div class="pop-term">' + esc(p.title) + '</div>' +
    '<div class="pop-short">' + (p.kind === 'cost'
      ? 'Paired measurement, baseline subtracted, median of the repetitions.'
      : 'Both forms run against the same page, in the same test.') + '</div>' +
    '<div class="pop-rows">' + rows + '</div>' +
    facts +
    '<div class="pop-note">' + esc(p.note || '') + '<br>' + esc(p.url) + '</div>';
}

document.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-proof]');
  if (!chip || chip.disabled) return;
  e.stopPropagation();
  openPop(chip, proofHtml(chip.dataset.proof));
});

(function headerLinks() {
  const parts = ['<a class="ref-link" href="' + esc(META.dashboard) + '">&larr; Measured results dashboard</a>'];
  if (META.accessibility) {
    parts.push('<a class="ref-link" href="' + esc(META.accessibility) + '">Accessibility and test levels &rarr;</a>');
  }
  if (META.specUrl) {
    parts.push('<a class="ref-link" href="' + esc(META.specUrl) + '" target="_blank" rel="noopener">' +
               'The scenario that produced all of this &rarr;</a>');
  }
  document.getElementById('headerLinks').innerHTML = parts.join(' &nbsp;·&nbsp; ');
})();

(function fingerprint() {
  const bits = [META.proved + ' of ' + META.total + ' patterns proved on this run'];
  if (META.costProofs) bits.push(META.costProofs + ' of them by measurement, the rest by outcome');
  if (META.browserVersion) bits.push('Chromium ' + META.browserVersion);
  if (META.runId) bits.push('run ' + META.runId);
  bits.push('reproduce with: npm run bench:patterns');
  document.getElementById('fingerprint').textContent = bits.join('  ·  ');
})();
</script>
</body>
</html>`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);
console.log(
  `Wrote ${OUT} (${(html.length / 1024).toFixed(0)} kB, ${PATTERNS.length} patterns, ` +
  `${proved} proved${proofFile ? ` from run ${proofFile.runId}` : ', no proof file'})`,
);
