import { PALETTE, STATUS, OUTCOME_STATUS } from './palette.mjs';

/** CSS custom properties per mode, emitted for both the OS setting and the theme toggle. */
function tokenBlock(mode) {
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

export function renderHtml(summary) {
  const data = JSON.stringify(summary).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Locator Benchmark</title>
<style>
:root {${tokenBlock('light')}
  --status-good: ${STATUS.good};
  --status-warning: ${STATUS.warning};
  --status-serious: ${STATUS.serious};
  --status-critical: ${STATUS.critical};
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {${tokenBlock('dark')}}
}
:root[data-theme="dark"] {${tokenBlock('dark')}}

* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--plane);
  color: var(--text-primary);
  font: 14px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif;
}
.wrap { max-width: 1180px; margin: 0 auto; padding: 32px 16px 96px; }
header h1 { font-size: 26px; margin: 0 0 4px; letter-spacing: -0.01em; }
.sub { color: var(--text-secondary); margin: 0 0 6px; }
.fingerprint {
  font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--text-muted);
  border-left: 2px solid var(--axis);
  padding-left: 10px;
  margin: 16px 0 28px;
}
.caveat {
  border-left: 2px solid var(--status-warning);
  padding-left: 10px;
  color: var(--text-secondary);
  font-size: 13px;
  margin: 12px 0 28px;
}
section { background: var(--surface-1); border: 1px solid var(--border); border-radius: 10px; padding: 20px 20px 24px; margin-bottom: 20px; }
section > h2 { font-size: 17px; margin: 0 0 2px; }
section > .lede { color: var(--text-secondary); margin: 0 0 18px; font-size: 13px; max-width: 74ch; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin-bottom: 20px; }
.tile { background: var(--surface-1); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
.tile .k { font-size: 12px; color: var(--text-secondary); margin-bottom: 6px; }
.tile .v { font-size: 26px; letter-spacing: -0.02em; }
.tile .n { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
svg { display: block; width: 100%; height: auto; overflow: visible; }
.tick { font-size: 11px; fill: var(--text-muted); font-variant-numeric: tabular-nums; }
.lbl { font-size: 11px; fill: var(--text-secondary); }
.lbl-strong { font-size: 11px; fill: var(--text-primary); }
.gridline { stroke: var(--grid); stroke-width: 1; }
.axisline { stroke: var(--axis); stroke-width: 1; }
.legend { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 14px 0 0; font-size: 12px; color: var(--text-secondary); }
.legend span.sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; }
table { border-collapse: collapse; width: 100%; font-size: 12.5px; font-variant-numeric: tabular-nums; }
th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid var(--grid); white-space: nowrap; }
th { color: var(--text-secondary); font-weight: 600; position: sticky; top: 0; background: var(--surface-1); }
td.num, th.num { text-align: right; }
.scroll { max-height: 460px; overflow: auto; border: 1px solid var(--border); border-radius: 8px; }
details { margin-top: 16px; }
summary { cursor: pointer; color: var(--text-secondary); font-size: 13px; }
.chip { display: inline-block; padding: 1px 7px; border-radius: 999px; font-size: 11px; border: 1px solid var(--border); color: var(--text-secondary); }
.chip.ok { color: var(--status-good); border-color: var(--status-good); }
.chip.no { color: var(--status-critical); border-color: var(--status-critical); }
.chip.meh { color: var(--text-muted); }
#tip {
  position: fixed; pointer-events: none; opacity: 0; transition: opacity .09s;
  background: var(--surface-1); color: var(--text-primary);
  border: 1px solid var(--border); border-radius: 7px; padding: 7px 10px;
  font: 12px/1.5 system-ui, sans-serif; box-shadow: 0 6px 22px rgba(0,0,0,.16);
  z-index: 50; max-width: 320px;
}
#tip b { font-weight: 600; }
#tip .m { color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.toggle { float: right; font-size: 12px; color: var(--text-secondary); background: none; border: 1px solid var(--border); border-radius: 6px; padding: 4px 10px; cursor: pointer; }
@media (max-width: 640px) { .wrap { padding: 20px 16px 72px; } th, td { padding: 4px 6px; } }
</style>
</head>
<body>
<div class="wrap">
  <button class="toggle" id="themeToggle" type="button">Theme</button>
  <header>
    <h1>Playwright locator strategies</h1>
    <p class="sub">Measured against a controlled Angular application. Every strategy resolves the same physical element.</p>
  </header>
  <div id="fingerprint" class="fingerprint"></div>
  <div id="caveats"></div>
  <div class="tiles" id="tiles"></div>
  <div id="sections"></div>
</div>
<div id="tip" role="status" aria-live="polite"></div>
<script id="data" type="application/json">${data}</script>
<script>
${CLIENT_JS}
</script>
</body>
</html>`;
}

const CLIENT_JS = String.raw`
const S = JSON.parse(document.getElementById('data').textContent);
const OUTCOME = ${JSON.stringify(OUTCOME_STATUS)};
const tip = document.getElementById('tip');

// NaN does not survive JSON, so anything unmeasurable arrives here as null.
// Number.isFinite rejects both; the global isFinite would coerce null to 0.
const fmtMs = (v) =>
  !Number.isFinite(v) ? '-'
  : v >= 1000 ? (v / 1000).toFixed(2) + ' s'
  : v >= 1 ? v.toFixed(2) + ' ms'
  : v.toFixed(3) + ' ms';
const pct = (v) => (Number.isFinite(v) ? Math.round(v * 100) + '%' : '-');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function showTip(html, ev) {
  tip.innerHTML = html;
  tip.style.opacity = '1';
  const pad = 14;
  const r = tip.getBoundingClientRect();
  let x = ev.clientX + pad, y = ev.clientY + pad;
  if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - pad;
  if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - pad;
  tip.style.left = x + 'px';
  tip.style.top = y + 'px';
}
const hideTip = () => { tip.style.opacity = '0'; };

function hoverable(el, html) {
  el.addEventListener('mousemove', (e) => showTip(html, e));
  el.addEventListener('mouseleave', hideTip);
  el.setAttribute('tabindex', '0');
  el.addEventListener('focus', (e) => {
    const b = el.getBoundingClientRect();
    showTip(html, { clientX: b.left + b.width / 2, clientY: b.top });
  });
  el.addEventListener('blur', hideTip);
}

const svgEl = (name, attrs = {}) => {
  const e = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};

function section(title, lede) {
  const s = document.createElement('section');
  s.innerHTML = '<h2>' + esc(title) + '</h2><p class="lede">' + lede + '</p>';
  document.getElementById('sections').appendChild(s);
  return s;
}

function tableView(sec, headers, rows, caption) {
  const d = document.createElement('details');
  d.innerHTML = '<summary>' + esc(caption || 'Show the numbers as a table') + '</summary>';
  const wrap = document.createElement('div');
  wrap.className = 'scroll';
  wrap.style.marginTop = '10px';
  const t = document.createElement('table');
  t.innerHTML =
    '<thead><tr>' + headers.map((h, i) => '<th' + (i ? ' class="num"' : '') + '>' + esc(h) + '</th>').join('') + '</tr></thead>' +
    '<tbody>' + rows.map((r) => '<tr>' + r.map((c, i) => '<td' + (i ? ' class="num"' : '') + '>' + (c ?? '') + '</td>').join('') + '</tr>').join('') + '</tbody>';
  wrap.appendChild(t);
  d.appendChild(wrap);
  sec.appendChild(d);
}

// --- header ----------------------------------------------------------------
(function fingerprint() {
  const e = S.envs[0];
  const el = document.getElementById('fingerprint');
  if (!e) { el.textContent = 'No environment record.'; return; }
  el.textContent =
    e.cpuModel + ' x' + e.cpuCount + '  |  node ' + e.node + '  |  playwright ' + e.playwrightVersion +
    '  |  chromium ' + e.browserVersion + '  |  headless ' + e.headless +
    '  |  load1 ' + e.loadAvg1 + '  |  git ' + e.gitSha + (e.gitDirty ? '-dirty' : '') +
    '  |  generated ' + S.generatedAt;

  const notes = [];
  if (!e.browserRevisionMatched) notes.push(e.notes[0]);
  notes.push(
    'Timings are comparable only within this fingerprint. Differences smaller than the measurement floor of ' +
    fmtMs(S.globalNoiseFloorMs) + ' are reported as indistinguishable regardless of p-value.'
  );
  document.getElementById('caveats').innerHTML =
    notes.map((n) => '<div class="caveat">' + esc(n) + '</div>').join('');
})();

// --- stat tiles ------------------------------------------------------------
(function tiles() {
  const tierCells = S.cells.filter((c) => c.metric === 'net_query_ms' && c.dims && c.dims.tier === S.largestTier && c.stats);
  // Clamp at the measurement floor before taking a ratio. Several strategies
  // measure below it, and dividing by an unclamped sub-floor median manufactures
  // nine significant figures out of noise. The honest form is a lower bound.
  const floor = S.globalNoiseFloorMs || 0.001;
  const meds = tierCells.map((c) => c.stats.median).sort((a, b) => a - b);
  const clamped = meds.map((m) => Math.max(m, floor));
  const fastest = tierCells.find((c) => c.stats.median === meds[0]);
  const slowest = tierCells.find((c) => c.stats.median === meds[meds.length - 1]);
  const nodes = tierCells.length ? tierCells[0].domNodes : null;
  const spread = clamped.length ? clamped[clamped.length - 1] / clamped[0] : null;
  const atFloor = meds.length ? meds[0] < floor : false;

  const tiles = [
    { k: 'Measurement floor', v: fmtMs(S.globalNoiseFloorMs), n: 'Baseline locator against itself, p95' },
    { k: 'Largest DOM measured', v: nodes ? nodes.toLocaleString() + ' nodes' : '-', n: 'Tier "' + S.largestTier + '"' },
    {
      k: 'Fastest to slowest',
      v: spread === null ? '-'
        : (atFloor ? '≥ ' : '') + Math.round(spread).toLocaleString() + '×',
      n: (fastest && slowest ? fastest.strategyId + ' → ' + slowest.strategyId : '') +
         (atFloor ? ', floor-limited' : ''),
    },
    { k: 'Typical click, quiet page', v: fmtMs(S.typicalActionMs), n: 'What a query cost is competing against' },
  ];
  document.getElementById('tiles').innerHTML = tiles
    .map((t) => '<div class="tile"><div class="k">' + esc(t.k) + '</div><div class="v">' + esc(t.v) + '</div><div class="n">' + esc(t.n) + '</div></div>')
    .join('');
})();

// --- composite ranking -----------------------------------------------------
(function composite() {
  const rows = S.composite.filter((r) => r.total !== null && r.ranked !== false);
  const unranked = S.composite.filter((r) => r.ranked === false);
  if (!rows.length) return;
  const sec = section(
    'Composite ranking',
    'Weighted by ' + Object.entries(S.weights).map(([k, v]) => esc(k) + ' ' + v).join(', ') +
    '. Robustness and strictness dominate because both are correctness properties: a locator that breaks on a copy change, or that silently matches two elements, costs an afternoon. Speed differences, unless enormous, cost milliseconds. ' +
    'Scores are renormalised over the components that applied, so strategies measured on fewer than three of the four are listed below the chart rather than ranked — a lone perfect score on one axis is not a first place.'
  );

  const rowH = 22, padL = 168, padR = 56, padT = 8, padB = 28;
  const w = 900, h = padT + rows.length * rowH + padB;
  const svg = svgEl('svg', { viewBox: '0 0 ' + w + ' ' + h, role: 'img', 'aria-label': 'Composite score by strategy' });
  const plotW = w - padL - padR;

  for (let g = 0; g <= 5; g++) {
    const x = padL + (plotW * g) / 5;
    svg.appendChild(svgEl('line', { x1: x, x2: x, y1: padT, y2: h - padB, class: 'gridline' }));
    const t = svgEl('text', { x, y: h - padB + 14, class: 'tick', 'text-anchor': 'middle' });
    t.textContent = (g / 5).toFixed(1);
    svg.appendChild(t);
  }

  rows.forEach((r, i) => {
    const y = padT + i * rowH;
    const bw = Math.max(2, plotW * r.total);
    const name = svgEl('text', { x: padL - 10, y: y + 14, class: 'lbl-strong', 'text-anchor': 'end' });
    name.textContent = r.strategyId;
    svg.appendChild(name);

    // 4px rounded data-end anchored to the baseline; 2px gap between rows.
    const bar = svgEl('rect', {
      x: padL, y: y + 4, width: bw, height: rowH - 8, rx: 4,
      fill: 'var(--series-1)',
    });
    hoverable(bar,
      '<b>' + esc(r.strategyId) + '</b><br><span class="m">family ' + esc(r.family) + '</span><br>' +
      '<span class="m">composite ' + r.total.toFixed(3) + '</span><br>' +
      '<span class="m">robustness ' + pct(r.robustness) + ' · strictness ' + pct(r.strictness) + '</span><br>' +
      '<span class="m">speed score ' + (r.speed === null ? '-' : r.speed.toFixed(2)) + ' (' + fmtMs(r.speedMs) + ' at ' + S.largestTier + ')</span>'
    );
    svg.appendChild(bar);

    const val = svgEl('text', { x: padL + bw + 7, y: y + 15, class: 'lbl' });
    val.textContent = r.total.toFixed(2);
    svg.appendChild(val);
  });

  sec.appendChild(svg);
  if (unranked.length) {
    const note = document.createElement('p');
    note.className = 'lede';
    note.style.marginTop = '14px';
    note.innerHTML = '<b>Measured but not ranked</b> (fewer than three components applied): ' +
      unranked.map((r) => '<code>' + esc(r.strategyId) + '</code> (' + r.coverage + '/4)').join(', ') + '.';
    sec.appendChild(note);
  }

  tableView(sec,
    ['Strategy', 'Family', 'Composite', 'Robust', 'Strict', 'Speed', 'Fail', 'Median q'],
    S.composite.map((r) => [
      esc(r.strategyId) + (r.ranked === false ? ' <span class="chip meh">unranked</span>' : ''),
      esc(r.family), r.total === null ? '-' : r.total.toFixed(3),
      r.robustness === null ? 'n/a' : pct(r.robustness), pct(r.strictness),
      r.speed === null ? '-' : r.speed.toFixed(2),
      r.failure === null ? '-' : r.failure.toFixed(2),
      fmtMs(r.speedMs),
    ])
  );
})();

// --- speed vs robustness ---------------------------------------------------
(function quadrant() {
  const rows = S.composite.filter((r) => r.speedMs !== null && r.robustness !== null);
  const omitted = S.composite.filter((r) => r.speedMs !== null && r.robustness === null);
  if (rows.length < 2) return;
  const sec = section(
    'Speed against robustness',
    'The trade-off, if there is one. Horizontal axis is median query cost at the largest DOM measured, on a log scale because the observed range spans several orders of magnitude. Vertical axis is the share of mutations the locator survived. Points are labelled directly; colour carries nothing here.' +
    (omitted.length
      ? ' Not plotted, because they were ambiguous before any mutation and have no robustness figure: ' +
        omitted.map((r) => '<code>' + esc(r.strategyId) + '</code>').join(', ') + '.'
      : '')
  );

  const padL = 62, padR = 24, padT = 16, padB = 44;
  const w = 900, h = 420;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const xs = rows.map((r) => Math.log10(Math.max(r.speedMs, 0.001)));
  const xMin = Math.floor(Math.min(...xs)), xMax = Math.ceil(Math.max(...xs));
  const X = (v) => padL + ((Math.log10(Math.max(v, 0.001)) - xMin) / (xMax - xMin || 1)) * plotW;
  const Y = (v) => padT + plotH - v * plotH;

  const svg = svgEl('svg', { viewBox: '0 0 ' + w + ' ' + h, role: 'img', 'aria-label': 'Query cost against robustness' });

  for (let e = xMin; e <= xMax; e++) {
    const x = X(Math.pow(10, e));
    svg.appendChild(svgEl('line', { x1: x, x2: x, y1: padT, y2: padT + plotH, class: 'gridline' }));
    const t = svgEl('text', { x, y: h - padB + 15, class: 'tick', 'text-anchor': 'middle' });
    t.textContent = Math.pow(10, e) >= 1 ? Math.pow(10, e) + ' ms' : Math.pow(10, e).toFixed(Math.min(3, -e)) + ' ms';
    svg.appendChild(t);
  }
  for (let g = 0; g <= 4; g++) {
    const y = Y(g / 4);
    svg.appendChild(svgEl('line', { x1: padL, x2: padL + plotW, y1: y, y2: y, class: 'gridline' }));
    const t = svgEl('text', { x: padL - 9, y: y + 4, class: 'tick', 'text-anchor': 'end' });
    t.textContent = (g * 25) + '%';
    svg.appendChild(t);
  }
  svg.appendChild(svgEl('line', { x1: padL, x2: padL + plotW, y1: padT + plotH, y2: padT + plotH, class: 'axisline' }));

  const ax = svgEl('text', { x: padL + plotW / 2, y: h - 6, class: 'lbl', 'text-anchor': 'middle' });
  ax.textContent = 'Median query cost at ' + S.largestTier + ' (log scale) — lower is better';
  svg.appendChild(ax);
  const ay = svgEl('text', { x: 14, y: padT + plotH / 2, class: 'lbl', 'text-anchor': 'middle', transform: 'rotate(-90 14 ' + (padT + plotH / 2) + ')' });
  ay.textContent = 'Mutations survived';
  svg.appendChild(ay);

  rows.forEach((r) => {
    const cx = X(r.speedMs), cy = Y(r.robustness);
    // 2px surface ring so overlapping marks stay separable.
    const dot = svgEl('circle', {
      cx, cy, r: 5.5, fill: 'var(--series-1)',
      stroke: 'var(--surface-1)', 'stroke-width': 2,
    });
    hoverable(dot,
      '<b>' + esc(r.strategyId) + '</b><br><span class="m">' + esc(r.family) + '</span><br>' +
      '<span class="m">query ' + fmtMs(r.speedMs) + '</span><br>' +
      '<span class="m">survived ' + pct(r.robustness) + ' of mutations</span><br>' +
      '<span class="m">unique in ' + pct(r.strictness) + ' of ambiguity cells</span>'
    );
    svg.appendChild(dot);
    const lab = svgEl('text', { x: cx + 9, y: cy + 4, class: 'lbl' });
    lab.textContent = r.strategyId;
    svg.appendChild(lab);
  });

  sec.appendChild(svg);
})();

// --- cost against DOM size -------------------------------------------------
(function scaling() {
  const byTier = {};
  for (const c of S.cells) {
    if (c.metric !== 'net_query_ms' || !c.dims || !c.dims.tier || !c.stats) continue;
    byTier[c.strategyId] ??= {};
    byTier[c.strategyId][c.dims.tier] = { median: c.stats.median, nodes: c.domNodes, probeOnly: c.probeOnly, n: c.n };
  }
  const tiers = [...new Set(S.cells.filter((c) => c.dims && c.dims.tier && c.metric === 'net_query_ms').map((c) => c.dims.tier))];
  const nodesFor = {};
  for (const t of tiers) {
    const c = S.cells.find((x) => x.dims && x.dims.tier === t && x.metric === 'net_query_ms');
    nodesFor[t] = c ? c.domNodes : 0;
  }
  tiers.sort((a, b) => nodesFor[a] - nodesFor[b]);
  if (tiers.length < 2) return;

  // Six series maximum, assigned in fixed order and never cycled: the cheapest,
  // the dearest, and the representatives in between.
  const ranked = Object.entries(byTier)
    .filter(([, v]) => tiers.every((t) => v[t]))
    .sort((a, b) => a[1][tiers[tiers.length - 1]].median - b[1][tiers[tiers.length - 1]].median);
  const picks = ranked.length <= 6 ? ranked : [
    ranked[0], ranked[1],
    ranked[Math.floor(ranked.length * 0.4)],
    ranked[Math.floor(ranked.length * 0.7)],
    ranked[ranked.length - 2], ranked[ranked.length - 1],
  ];

  const sec = section(
    'How cost scales with DOM size',
    'Median net query cost per strategy across DOM tiers, log scale on both axes. ' +
    (ranked.length > 6 ? 'Six representative strategies are drawn; the full set is in the table below. ' : '') +
    'The horizontal band at the bottom is the measurement floor: anything inside it is not a measurement.'
  );

  const padL = 74, padR = 120, padT = 14, padB = 46;
  const w = 900, h = 420, plotW = w - padL - padR, plotH = h - padT - padB;
  const allY = picks.flatMap(([, v]) => tiers.map((t) => v[t].median)).filter((v) => v > 0);
  const yMin = Math.floor(Math.log10(Math.min(S.globalNoiseFloorMs, ...allY)));
  const yMax = Math.ceil(Math.log10(Math.max(...allY)));
  const xNodes = tiers.map((t) => Math.log10(Math.max(nodesFor[t], 1)));
  const xMin = Math.min(...xNodes), xMax = Math.max(...xNodes);
  const X = (nodes) => padL + ((Math.log10(Math.max(nodes, 1)) - xMin) / (xMax - xMin || 1)) * plotW;
  const Y = (v) => padT + plotH - ((Math.log10(Math.max(v, Math.pow(10, yMin))) - yMin) / (yMax - yMin || 1)) * plotH;

  const svg = svgEl('svg', { viewBox: '0 0 ' + w + ' ' + h, role: 'img', 'aria-label': 'Query cost against DOM size' });

  for (let e = yMin; e <= yMax; e++) {
    const y = Y(Math.pow(10, e));
    svg.appendChild(svgEl('line', { x1: padL, x2: padL + plotW, y1: y, y2: y, class: 'gridline' }));
    const t = svgEl('text', { x: padL - 9, y: y + 4, class: 'tick', 'text-anchor': 'end' });
    t.textContent = fmtMs(Math.pow(10, e));
    svg.appendChild(t);
  }
  for (const t of tiers) {
    const x = X(nodesFor[t]);
    svg.appendChild(svgEl('line', { x1: x, x2: x, y1: padT, y2: padT + plotH, class: 'gridline' }));
    const lab = svgEl('text', { x, y: h - padB + 15, class: 'tick', 'text-anchor': 'middle' });
    lab.textContent = nodesFor[t].toLocaleString();
    svg.appendChild(lab);
  }
  const ax = svgEl('text', { x: padL + plotW / 2, y: h - 8, class: 'lbl', 'text-anchor': 'middle' });
  ax.textContent = 'DOM elements (log scale)';
  svg.appendChild(ax);

  // Measurement floor, drawn as a recessive band rather than a series.
  const floorY = Y(S.globalNoiseFloorMs);
  svg.appendChild(svgEl('rect', {
    x: padL, y: floorY, width: plotW, height: Math.max(0, padT + plotH - floorY),
    fill: 'var(--grid)', opacity: 0.55,
  }));
  const fl = svgEl('text', { x: padL + 6, y: floorY - 5, class: 'tick' });
  fl.textContent = 'measurement floor';
  svg.appendChild(fl);

  picks.forEach(([id, v], i) => {
    const colour = 'var(--series-' + ((i % 6) + 1) + ')';
    const pts = tiers.map((t) => [X(nodesFor[t]), Y(v[t].median)]);
    svg.appendChild(svgEl('polyline', {
      points: pts.map((p) => p.join(',')).join(' '),
      fill: 'none', stroke: colour, 'stroke-width': 2,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }));
    tiers.forEach((t, k) => {
      const dot = svgEl('circle', {
        cx: pts[k][0], cy: pts[k][1], r: 4.5, fill: colour,
        stroke: 'var(--surface-1)', 'stroke-width': 2,
      });
      hoverable(dot,
        '<b>' + esc(id) + '</b><br><span class="m">tier ' + esc(t) + ' · ' + v[t].nodes.toLocaleString() + ' nodes</span><br>' +
        '<span class="m">median ' + fmtMs(v[t].median) + ' (n=' + v[t].n + (v[t].probeOnly ? ', probe only' : '') + ')</span>'
      );
      svg.appendChild(dot);
    });
    // Direct label, so identity never depends on colour alone.
    const last = pts[pts.length - 1];
    const lab = svgEl('text', { x: last[0] + 9, y: last[1] + 4, class: 'lbl' });
    lab.textContent = id;
    svg.appendChild(lab);
  });

  sec.appendChild(svg);

  const legend = document.createElement('div');
  legend.className = 'legend';
  legend.innerHTML = picks.map((p, i) =>
    '<span><span class="sw" style="background:var(--series-' + ((i % 6) + 1) + ')"></span>' + esc(p[0]) + '</span>'
  ).join('');
  sec.appendChild(legend);

  tableView(sec,
    ['Strategy', ...tiers.map((t) => t + ' (' + nodesFor[t].toLocaleString() + ')')],
    Object.entries(byTier).sort((a, b) => {
      const t = tiers[tiers.length - 1];
      return (a[1][t]?.median ?? 0) - (b[1][t]?.median ?? 0);
    }).map(([id, v]) => [esc(id), ...tiers.map((t) => (v[t] ? fmtMs(v[t].median) + (v[t].probeOnly ? ' *' : '') : '-'))]),
    'Show every strategy at every tier (* = single probe sample)'
  );
})();

// --- robustness matrix -----------------------------------------------------
(function robustness() {
  const ids = Object.keys(S.robustness);
  if (!ids.length) return;
  const mutations = [...new Set(ids.flatMap((id) => Object.keys(S.robustness[id].outcomes)))];
  const rateOf = (id) => (S.robustness[id].rate === null ? -1 : S.robustness[id].rate);
  ids.sort((a, b) => rateOf(b) - rateOf(a));

  const sec = section(
    'Robustness under change',
    'Each column is a change a developer makes without thinking about tests. A cell is green only if the locator still resolves to the <em>same physical element</em>, verified through an attribute that no mutation touches. Resolving to one wrong element is scored worse than resolving to nothing, because it passes. ' +
    'Strategies that were already ambiguous <em>before</em> any mutation show <code>n/a</code>: a change cannot break what never worked, and scoring them zero here would charge them twice for a single flaw that the ambiguity sweep already measures.'
  );

  const cw = 104, ch = 26, padL = 168, padT = 44;
  const w = padL + mutations.length * cw + 60, h = padT + ids.length * ch + 10;
  const svg = svgEl('svg', { viewBox: '0 0 ' + w + ' ' + h, role: 'img', 'aria-label': 'Robustness outcome by strategy and mutation' });

  mutations.forEach((m, i) => {
    const t = svgEl('text', { x: padL + i * cw + cw / 2, y: padT - 12, class: 'lbl', 'text-anchor': 'middle' });
    t.textContent = m;
    svg.appendChild(t);
  });

  ids.forEach((id, r) => {
    const y = padT + r * ch;
    const name = svgEl('text', { x: padL - 10, y: y + 17, class: 'lbl-strong', 'text-anchor': 'end' });
    name.textContent = id;
    svg.appendChild(name);

    mutations.forEach((m, c) => {
      const o = S.robustness[id].outcomes[m];
      const meta = OUTCOME[o ? o.outcome : 'error'] || OUTCOME.error;
      const g = svgEl('g');
      // 2px gap between cells so adjacent fills never merge.
      g.appendChild(svgEl('rect', {
        x: padL + c * cw + 1, y: y + 1, width: cw - 2, height: ch - 2, rx: 3,
        fill: 'var(--status-' + meta.role + ')', opacity: 0.16,
      }));
      const glyph = svgEl('text', {
        x: padL + c * cw + 12, y: y + 17, class: 'lbl',
        fill: 'var(--status-' + meta.role + ')', 'font-size': 12,
      });
      glyph.textContent = meta.glyph;
      g.appendChild(glyph);
      // Icon plus label: a status colour never carries the meaning alone.
      const lab = svgEl('text', { x: padL + c * cw + 26, y: y + 17, class: 'lbl' });
      lab.textContent = meta.label;
      g.appendChild(lab);
      hoverable(g,
        '<b>' + esc(id) + '</b> · <span class="m">' + esc(m) + '</span><br>' +
        '<span class="m">' + esc(meta.label) + (o && o.matches >= 0 ? ' · ' + o.matches + ' match(es)' : '') + '</span>' +
        (o && o.detail ? '<br><span class="m">' + esc(o.detail) + '</span>' : '')
      );
      svg.appendChild(g);
    });

    const rate = svgEl('text', { x: padL + mutations.length * cw + 10, y: y + 17, class: 'lbl' });
    rate.textContent = S.robustness[id].rate === null ? 'n/a' : pct(S.robustness[id].rate);
    if (S.robustness[id].rate === null) {
      hoverable(rate,
        '<b>' + esc(id) + '</b><br><span class="m">Ambiguous before any mutation (' +
        esc(S.robustness[id].baselineOutcome || 'not unique') + ').</span><br>' +
        '<span class="m">Robustness is not defined here; see the ambiguity sweep.</span>'
      );
    }
    svg.appendChild(rate);
  });

  sec.appendChild(svg);
  const legend = document.createElement('div');
  legend.className = 'legend';
  legend.innerHTML = Object.values(OUTCOME)
    .filter((v, i, a) => a.findIndex((x) => x.label === v.label) === i)
    .map((v) => '<span><span class="sw" style="background:var(--status-' + v.role + ')"></span>' + v.glyph + ' ' + esc(v.label) + '</span>')
    .join('');
  sec.appendChild(legend);

  tableView(sec, ['Strategy', ...mutations, 'Survived'],
    ids.map((id) => [
      esc(id),
      ...mutations.map((m) => esc((S.robustness[id].outcomes[m] || {}).outcome || '-')),
      S.robustness[id].rate === null ? 'n/a' : pct(S.robustness[id].rate),
    ]));
})();

// --- ambiguity -------------------------------------------------------------
(function ambiguity() {
  const ids = Object.keys(S.ambiguity);
  if (!ids.length) return;
  const sizes = [...new Set(ids.flatMap((id) => Object.keys(S.ambiguity[id].byCards).map(Number)))].sort((a, b) => a - b);
  ids.sort((a, b) => (S.ambiguity[b].rate - S.ambiguity[a].rate) || ((a.breaksAtCards ?? 0) - (b.breaksAtCards ?? 0)));

  const sec = section(
    'When a locator stops being unique',
    'The same markup, repeated. Each cell is how many elements the locator matched. One is the only correct answer; anything else is a strict-mode failure waiting for production data. This is a correctness result, not a performance one.'
  );

  const rows = ids.map((id) => {
    const v = S.ambiguity[id];
    return [
      esc(id),
      ...sizes.map((n) => {
        const m = v.byCards[n];
        if (m === undefined) return '-';
        const cls = m === 1 ? 'ok' : m === 0 ? 'no' : 'no';
        return '<span class="chip ' + cls + '">' + m + '</span>';
      }),
      v.breaksAtCards === null ? '<span class="chip ok">never</span>' : '<span class="chip no">' + v.breaksAtCards + '</span>',
    ];
  });

  const wrap = document.createElement('div');
  wrap.className = 'scroll';
  const t = document.createElement('table');
  t.innerHTML =
    '<thead><tr><th>Strategy</th>' + sizes.map((n) => '<th class="num">' + n + ' copies</th>').join('') +
    '<th class="num">Breaks at</th></tr></thead><tbody>' +
    rows.map((r) => '<tr>' + r.map((c, i) => '<td' + (i ? ' class="num"' : '') + '>' + c + '</td>').join('') + '</tr>').join('') +
    '</tbody>';
  wrap.appendChild(t);
  sec.appendChild(wrap);
})();

// --- failure cost ----------------------------------------------------------
(function failure() {
  const ids = Object.keys(S.failure);
  if (!ids.length) return;
  const sec = section(
    'What a broken locator costs',
    'Left: a locator that matches nothing, which pays the full timeout every time it runs. Right: a locator that matches several, which Playwright refuses outright. The second is far cheaper in wall clock and far cheaper to diagnose — which is an argument for strictness, not against it.'
  );

  const rows = ids.map((id) => ({
    id,
    miss: S.failure[id].miss,
    strict: S.failure[id].strict,
  })).sort((a, b) => (b.miss?.ms ?? 0) - (a.miss?.ms ?? 0));

  const rowH = 24, padL = 168, padR = 90, padT = 26, padB = 26;
  const w = 900, h = padT + rows.length * rowH + padB, plotW = w - padL - padR;
  const max = Math.max(...rows.flatMap((r) => [r.miss?.ms ?? 0, r.strict?.ms ?? 0]), 1);
  const svg = svgEl('svg', { viewBox: '0 0 ' + w + ' ' + h, role: 'img', 'aria-label': 'Failure cost by strategy' });

  const head = svgEl('text', { x: padL, y: padT - 10, class: 'lbl' });
  head.textContent = 'time until the failure surfaces';
  svg.appendChild(head);

  rows.forEach((r, i) => {
    const y = padT + i * rowH;
    const name = svgEl('text', { x: padL - 10, y: y + 15, class: 'lbl-strong', 'text-anchor': 'end' });
    name.textContent = r.id;
    svg.appendChild(name);

    [['miss', 1], ['strict', 2]].forEach(([k, slot]) => {
      const d = r[k];
      if (!d) return;
      // Two series stacked within the row band, separated by a 2px surface gap.
      const bh = (rowH - 10) / 2;
      const bar = svgEl('rect', {
        x: padL, y: y + 3 + (slot - 1) * (bh + 2),
        width: Math.max(2, (plotW * d.ms) / max), height: bh, rx: 3,
        fill: 'var(--series-' + slot + ')',
      });
      hoverable(bar,
        '<b>' + esc(r.id) + '</b> · <span class="m">' + (k === 'miss' ? 'matched nothing' : 'matched ' + d.matches) + '</span><br>' +
        '<span class="m">' + fmtMs(d.ms) + ' of a ' + fmtMs(d.timeoutMs) + ' timeout</span><br>' +
        '<span class="m">error legibility ' + (d.legibility ?? '-') + '/3, ' + (d.errorChars ?? 0) + ' chars</span>' +
        (d.error ? '<br><span class="m">' + esc(String(d.error).slice(0, 160)) + '</span>' : '')
      );
      svg.appendChild(bar);
    });

    const t = svgEl('text', { x: padL + plotW + 8, y: y + 15, class: 'lbl' });
    t.textContent = fmtMs(r.miss?.ms);
    svg.appendChild(t);
  });

  sec.appendChild(svg);
  const legend = document.createElement('div');
  legend.className = 'legend';
  legend.innerHTML =
    '<span><span class="sw" style="background:var(--series-1)"></span>Matches nothing (pays the timeout)</span>' +
    '<span><span class="sw" style="background:var(--series-2)"></span>Matches several (strict-mode refusal)</span>';
  sec.appendChild(legend);

  tableView(sec, ['Strategy', 'Miss (ms)', 'Strict (ms)', 'Strict matches', 'Miss legibility', 'Strict legibility'],
    rows.map((r) => [
      esc(r.id), fmtMs(r.miss?.ms), fmtMs(r.strict?.ms),
      r.strict?.matches ?? '-', (r.miss?.legibility ?? '-') + '/3', (r.strict?.legibility ?? '-') + '/3',
    ]));
})();

// --- slow queries, and where their targets live ----------------------------
(function slowQueries() {
  if (!S.slowQueries || !S.slowQueries.length) {
    const sec = section(
      'Queries slower than ' + (S.slowThresholdMs / 1000) + ' second',
      'No query in this run reached the threshold. On a smaller DOM that is the expected outcome — the pathological strategies only become pathological at scale.'
    );
    void sec;
    return;
  }

  const sec = section(
    'Queries slower than ' + (S.slowThresholdMs / 1000) + ' second',
    'Every measurement whose median reached the threshold, with where its target actually sits. ' +
    'Depth and page size are normally confounded — deeper pages tend to be bigger — so both are recorded, and the chart below this one varies depth at a fixed element count to separate them.'
  );

  // Count by depth: the direct answer to "how many levels down are the slow ones".
  const profile = [...S.slowDepthProfile].sort((a, b) => a.depth - b.depth);
  if (profile.length) {
    const padL = 58, padR = 24, padT = 14, padB = 46;
    const w = 900, h = 260, plotW = w - padL - padR, plotH = h - padT - padB;
    const maxCount = Math.max(...profile.map((d) => d.count), 1);
    const bandW = plotW / profile.length;
    const svg = svgEl('svg', { viewBox: '0 0 ' + w + ' ' + h, role: 'img', 'aria-label': 'Slow queries by target depth' });

    for (let g = 0; g <= 4; g++) {
      const y = padT + plotH - (plotH * g) / 4;
      svg.appendChild(svgEl('line', { x1: padL, x2: padL + plotW, y1: y, y2: y, class: 'gridline' }));
      const t = svgEl('text', { x: padL - 9, y: y + 4, class: 'tick', 'text-anchor': 'end' });
      t.textContent = Math.round((maxCount * g) / 4);
      svg.appendChild(t);
    }
    svg.appendChild(svgEl('line', { x1: padL, x2: padL + plotW, y1: padT + plotH, y2: padT + plotH, class: 'axisline' }));

    profile.forEach((d, i) => {
      const bh = Math.max(2, (plotH * d.count) / maxCount);
      // 2px gap between adjacent bars so fills never merge.
      const bar = svgEl('rect', {
        x: padL + i * bandW + 1, y: padT + plotH - bh,
        width: Math.max(2, bandW - 2), height: bh, rx: 4,
        fill: 'var(--series-1)',
      });
      hoverable(bar,
        '<b>depth ' + d.depth + '</b><br>' +
        '<span class="m">' + d.count + ' slow measurement(s)</span><br>' +
        '<span class="m">median ' + fmtMs(d.medianMs) + ', worst ' + fmtMs(d.maxMs) + '</span><br>' +
        '<span class="m">' + esc(d.strategies.join(', ')) + '</span><br>' +
        '<span class="m">route: ' + esc(d.routes.join(', ')) + '</span>'
      );
      svg.appendChild(bar);

      const lab = svgEl('text', { x: padL + i * bandW + bandW / 2, y: h - padB + 16, class: 'tick', 'text-anchor': 'middle' });
      lab.textContent = d.depth;
      svg.appendChild(lab);
      // Direct label on the bar: the count never depends on reading the axis.
      const val = svgEl('text', { x: padL + i * bandW + bandW / 2, y: padT + plotH - bh - 6, class: 'lbl', 'text-anchor': 'middle' });
      val.textContent = d.count;
      svg.appendChild(val);
    });

    const ax = svgEl('text', { x: padL + plotW / 2, y: h - 8, class: 'lbl', 'text-anchor': 'middle' });
    ax.textContent = 'Levels below <body> that the target sits at';
    svg.appendChild(ax);
    const ay = svgEl('text', { x: 14, y: padT + plotH / 2, class: 'lbl', 'text-anchor': 'middle', transform: 'rotate(-90 14 ' + (padT + plotH / 2) + ')' });
    ay.textContent = 'Slow measurements';
    svg.appendChild(ay);
    sec.appendChild(svg);
  }

  const wrap = document.createElement('div');
  wrap.className = 'scroll';
  wrap.style.marginTop = '16px';
  const t = document.createElement('table');
  t.innerHTML =
    '<thead><tr><th>Strategy</th><th class="num">Median</th><th class="num">Depth</th><th class="num">Siblings</th>' +
    '<th class="num">DOM nodes</th><th class="num">Matches</th><th class="num">n</th><th>Route</th><th>Ancestor path</th></tr></thead><tbody>' +
    S.slowQueries.map((q) =>
      '<tr><td>' + esc(q.strategyId) + '</td>' +
      '<td class="num">' + fmtMs(q.medianMs) +
        (q.timedOut ? ' <span class="chip no">timeout</span>' : '') + '</td>' +
      '<td class="num">' + (q.depth ?? '-') + '</td>' +
      '<td class="num">' + (q.siblings ?? '-') + '</td>' +
      '<td class="num">' + q.domNodes.toLocaleString() + '</td>' +
      '<td class="num">' + (q.matches ?? '-') + '</td>' +
      '<td class="num">' + q.n + (q.probeOnly ? '*' : '') + '</td>' +
      '<td>' + esc(q.route) + '</td>' +
      '<td style="white-space:normal;max-width:360px;font-size:11px;color:var(--text-muted)">' + esc(q.ancestorTags || '-') + '</td></tr>'
    ).join('') + '</tbody>';
  wrap.appendChild(t);
  sec.appendChild(wrap);

  const note = document.createElement('p');
  note.className = 'lede';
  note.style.marginTop = '12px';
  note.innerHTML = '* single probe sample: the query was too expensive to repeat within the time budget. ' +
    'Rows marked <span class="chip no">timeout</span> hit their ceiling rather than completing — that duration is the timeout, not how long the lookup takes.';
  sec.appendChild(note);
})();

// --- depth at constant element count ---------------------------------------
(function depthSweep() {
  const ids = Object.keys(S.depthSweep || {});
  if (!ids.length) return;

  const depthsFor = (id) => Object.keys(S.depthSweep[id]).map(Number).sort((a, b) => a - b);
  const complete = ids.filter((id) => depthsFor(id).length >= 2);
  if (!complete.length) return;

  const sec = section(
    'Depth on its own, at a fixed element count',
    'The controlled version of the question above. Total elements are held constant while the number of levels between <body> and the target changes, so any movement here is attributable to depth rather than to page size. A flat line means depth costs that strategy nothing.'
  );

  const allDepths = [...new Set(complete.flatMap(depthsFor))].sort((a, b) => a - b);
  const ranked = complete.sort((a, b) => {
    const last = allDepths[allDepths.length - 1];
    return (S.depthSweep[b][last]?.medianMs ?? 0) - (S.depthSweep[a][last]?.medianMs ?? 0);
  });
  const picks = ranked.slice(0, 6);

  const padL = 74, padR = 130, padT = 14, padB = 48;
  const w = 900, h = 400, plotW = w - padL - padR, plotH = h - padT - padB;
  const vals = picks.flatMap((id) => depthsFor(id).map((d) => S.depthSweep[id][d].medianMs)).filter((v) => v > 0);
  const yMin = Math.floor(Math.log10(Math.min(S.globalNoiseFloorMs, ...vals)));
  const yMax = Math.ceil(Math.log10(Math.max(...vals)));
  const dMin = allDepths[0], dMax = allDepths[allDepths.length - 1];
  const X = (d) => padL + ((d - dMin) / Math.max(1, dMax - dMin)) * plotW;
  const Y = (v) => padT + plotH - ((Math.log10(Math.max(v, Math.pow(10, yMin))) - yMin) / Math.max(1, yMax - yMin)) * plotH;

  const svg = svgEl('svg', { viewBox: '0 0 ' + w + ' ' + h, role: 'img', 'aria-label': 'Query cost against target depth at constant element count' });
  for (let e = yMin; e <= yMax; e++) {
    const y = Y(Math.pow(10, e));
    svg.appendChild(svgEl('line', { x1: padL, x2: padL + plotW, y1: y, y2: y, class: 'gridline' }));
    const tk = svgEl('text', { x: padL - 9, y: y + 4, class: 'tick', 'text-anchor': 'end' });
    tk.textContent = fmtMs(Math.pow(10, e));
    svg.appendChild(tk);
  }
  for (const d of allDepths) {
    const x = X(d);
    svg.appendChild(svgEl('line', { x1: x, x2: x, y1: padT, y2: padT + plotH, class: 'gridline' }));
    const tk = svgEl('text', { x, y: h - padB + 16, class: 'tick', 'text-anchor': 'middle' });
    tk.textContent = d;
    svg.appendChild(tk);
  }
  const ax = svgEl('text', { x: padL + plotW / 2, y: h - 10, class: 'lbl', 'text-anchor': 'middle' });
  ax.textContent = 'Levels below <body>';
  svg.appendChild(ax);

  picks.forEach((id, i) => {
    const colour = 'var(--series-' + ((i % 6) + 1) + ')';
    const ds = depthsFor(id);
    const pts = ds.map((d) => [X(d), Y(S.depthSweep[id][d].medianMs)]);
    svg.appendChild(svgEl('polyline', {
      points: pts.map((p) => p.join(',')).join(' '),
      fill: 'none', stroke: colour, 'stroke-width': 2,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }));
    ds.forEach((d, k) => {
      const cell = S.depthSweep[id][d];
      const dot = svgEl('circle', { cx: pts[k][0], cy: pts[k][1], r: 4.5, fill: colour, stroke: 'var(--surface-1)', 'stroke-width': 2 });
      hoverable(dot,
        '<b>' + esc(id) + '</b><br>' +
        '<span class="m">depth ' + d + ' · ' + cell.domNodes.toLocaleString() + ' nodes</span><br>' +
        '<span class="m">median ' + fmtMs(cell.medianMs) + ' (n=' + cell.n + ')</span>'
      );
      svg.appendChild(dot);
    });
    const last = pts[pts.length - 1];
    const lab = svgEl('text', { x: last[0] + 9, y: last[1] + 4, class: 'lbl' });
    lab.textContent = id;
    svg.appendChild(lab);
  });

  sec.appendChild(svg);
  const legend = document.createElement('div');
  legend.className = 'legend';
  legend.innerHTML = picks.map((id, i) =>
    '<span><span class="sw" style="background:var(--series-' + ((i % 6) + 1) + ')"></span>' + esc(id) + '</span>'
  ).join('');
  sec.appendChild(legend);

  tableView(sec, ['Strategy', ...allDepths.map((d) => 'depth ' + d)],
    ranked.map((id) => [esc(id), ...allDepths.map((d) => (S.depthSweep[id][d] ? fmtMs(S.depthSweep[id][d].medianMs) : '-'))]),
    'Show every strategy at every depth');
})();

// --- significance ----------------------------------------------------------
(function significance() {
  const rows = S.comparisons.filter((c) => c.metric === 'net_query_ms');
  if (!rows.length) return;
  const sec = section(
    'Is the difference real?',
    'Every strategy against <code>' + esc(S.reference) + '</code>, by Mann-Whitney U with tie correction. A verdict of <em>indistinguishable</em> means either the test did not reject, or the medians differ by less than the measurement floor for that page. Both are reasons not to claim a difference.'
  );
  const sorted = [...rows].sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0));
  const wrap = document.createElement('div');
  wrap.className = 'scroll';
  const t = document.createElement('table');
  t.innerHTML =
    '<thead><tr><th>Strategy</th><th>Page shape</th><th class="num">x reference</th><th class="num">delta median</th><th class="num">p</th><th class="num">effect</th><th class="num">n</th><th class="num">verdict</th></tr></thead><tbody>' +
    sorted.map((c) =>
      '<tr><td>' + esc(c.strategyId) + '</td><td>' + esc(c.key) + '</td>' +
      '<td class="num">' + (c.ratio === null ? '-' : c.ratio.toFixed(1) + '×') + '</td>' +
      '<td class="num">' + fmtMs(c.medianDelta) + '</td>' +
      '<td class="num">' + (Number.isFinite(c.p) ? (c.p < 0.001 ? '<0.001' : c.p.toFixed(3)) : '-') + '</td>' +
      '<td class="num">' + (Number.isFinite(c.effect) ? c.effect.toFixed(2) : '-') + '</td>' +
      '<td class="num">' + c.nA + (c.probeOnly ? '*' : '') + '</td>' +
      '<td class="num"><span class="chip ' + (c.verdict === 'indistinguishable' ? 'meh' : c.verdict === 'faster' ? 'ok' : 'no') + '">' + c.verdict + '</span></td></tr>'
    ).join('') + '</tbody>';
  wrap.appendChild(t);
  sec.appendChild(wrap);
})();

// --- theme toggle ----------------------------------------------------------
(function theme() {
  const btn = document.getElementById('themeToggle');
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
