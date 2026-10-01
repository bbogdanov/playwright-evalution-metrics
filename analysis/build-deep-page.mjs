/**
 * Renders results/deep-summary.json into results/dashboard/deep.html: what the
 * locator matrix does on a page 50 levels deep carrying ~5,000 elements (S15).
 *
 * Same frame as the results page - its styles, helpers, header, popovers and
 * glossary come from dashboard-template.mjs - so the two read as one site. Only
 * the sections differ, and the robustness matrix is the results page's own,
 * pointed at this page's data.
 *
 * The summary is produced by `npm run analyze:deep` from results/deep-raw, a
 * stream the main analysis never reads: an S15-only run cannot replace the
 * summary of the full benchmark, and the full benchmark cannot leak into this.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { renderHtml, CLIENT_PRELUDE, clientBlock } from './dashboard-template.mjs';
import { describeStrategies } from './strategy-calls.mjs';
import { blobUrl } from './repo-link.mjs';
import { siteNav } from './page-shell.mjs';

const IN = resolve(process.env.BM_DEEP_SUMMARY ?? 'results/deep-summary.json');
const OUT = resolve(process.env.BM_DEEP_PAGE ?? 'results/dashboard/deep.html');

if (!existsSync(IN)) {
  console.error(`No summary at ${IN}. Run: npm run bench:deep && npm run analyze:deep`);
  process.exit(1);
}
const summary = JSON.parse(readFileSync(IN, 'utf8'));
summary.strategies = describeStrategies();
summary.referenceUrl = blobUrl('docs/LOCATOR-REFERENCE.md');
summary.specUrls = Object.fromEntries(
  ['query', 'level', 'click', 'robustness'].map((p) => [p, blobUrl(`e2e/deep/s15-${p}.spec.ts`)]),
);

const DEEP_JS = String.raw`
const CELLS = S.cells.filter((c) => c.scenario === 'S15');
const part = (p) => CELLS.filter((c) => c.dims && c.dims.part === p);
const CONTRAST = S.depthContrast || [];
const floorOf = (c) => (Number.isFinite(c.noiseFloor) ? c.noiseFloor : S.globalNoiseFloorMs);
const VERDICT = {
  slower: { label: 'slower when deep', role: 'critical' },
  faster: { label: 'faster when deep', role: 'good' },
  same: { label: 'no measurable difference', role: 'muted' },
};
function verdictOf(x) {
  if (!x || !x.significant || x.belowNoiseFloor || x.withinDrift) return 'same';
  return x.medianDelta > 0 ? 'slower' : 'faster';
}
function specLink(p) {
  const u = S.specUrls && S.specUrls[p];
  return u ? ' <a class="ref-link" href="' + esc(u) + '" target="_blank" rel="noopener">Test source ↗</a>' : '';
}
// Medians at or near zero are below anything this harness resolves; the axis
// stops at 1 µs and its first tick says so rather than printing 0.000 ms.
function logAxis(lo, hi) {
  const a = Math.floor(Math.log10(Math.max(lo, 1e-3)));
  const b = Math.ceil(Math.log10(Math.max(hi, lo * 10)));
  return [a, Math.max(b, a + 1)];
}

// --- stat tiles ------------------------------------------------------------
(function deepTiles() {
  const q = part('query').filter((c) => c.metric === 'net_query_ms' && c.stats);
  const deep = q.filter((c) => c.dims.requestedDepth === 50);
  const shallow = q.filter((c) => c.dims.requestedDepth !== 50);
  const any = deep[0];
  const worst = deep.slice().sort((a, b) => b.stats.median - a.stats.median)[0];
  const qc = CONTRAST.filter((x) => x.metric === 'net_query_ms');
  const slower = qc.filter((x) => verdictOf(x) === 'slower');
  const clicks = CONTRAST.filter((x) => x.metric === 'action_click_ms');
  const clickMed = (k) => {
    const v = clicks.map((x) => x[k].median).sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)] : null;
  };
  const tiles = [
    {
      k: 'Page under test',
      v: any ? any.domNodes.toLocaleString() + ' elements' : '-',
      n: any ? '50 levels · target at element [[depth|depth]] ' + any.dims.targetDepth : '',
    },
    {
      k: 'Shallow control',
      v: shallow[0] ? shallow[0].domNodes.toLocaleString() + ' elements' : '-',
      n: shallow[0] ? '5 levels · target at depth ' + shallow[0].dims.targetDepth : '',
    },
    {
      k: 'Slowest query at depth 50',
      v: worst ? fmtMs(worst.stats.median) : '-',
      n: worst ? worst.strategyId + (worst.probeOnly ? ' (single probe)' : '') : '',
    },
    {
      k: 'Measurably slower when deep',
      v: qc.length ? slower.length + ' of ' + qc.length : '-',
      n: 'Strategies, count(), against the [[noise-floor|floor]]',
    },
    {
      k: 'Click, depth 5 → 50',
      v: clicks.length ? clickMed('shallow').toFixed(1) + ' → ' + clickMed('deep').toFixed(1) + ' ms' : '-',
      n: 'Median of ' + clicks.length + ' strategies\' medians; ' + clicks.filter((x) => verdictOf(x) !== 'same').length + ' differ measurably',
    },
  ];
  document.getElementById('tiles').innerHTML = tiles
    .map((t) => '<div class="tile"><div class="k">' + gloss(t.k) + '</div><div class="v">' + esc(t.v) +
      '</div><div class="n">' + gloss(esc(t.n)) + '</div></div>')
    .join('');
})();

// --- query cost: depth 50 against the shallow control ------------------------
(function deepQuery() {
  const all = CONTRAST.filter((x) => x.part === 'query');
  if (!all.length) return;
  const sec = section(
    'Every strategy at depth 50, against the same page five levels deep',
    'One dot pair per strategy. Both pages carry the same number of elements; only the [[depth|nesting]] differs, so the gap between the two dots is what depth costs that locator. [[median|Median]] net query cost, [[log-scale|log scale]]. The shaded band is the [[noise-floor|measurement floor]]: anything inside it is as fast as anything this harness can measure. ' +
    'First-match figures carry a round trip the paired baseline does not cancel (about 5 ms each), so differences of a millisecond or two there are worth little. ' +
    'A gap is called a difference only when it clears the floor, the [[p-value|significance test]], <em>and</em> the drift of <code>id.css</code> between the two pages — the two are measured minutes apart, and a shift the reference locator shows too is the run moving, not depth. Otherwise it is labelled as none, however it looks.' + specLink('query')
  );

  const ctl = document.createElement('div');
  ctl.className = 'legend';
  ctl.style.margin = '0 0 10px';
  ctl.innerHTML =
    '<label><input type="radio" name="dq-metric" value="net_query_ms" checked> count() — every match</label>' +
    '<label><input type="radio" name="dq-metric" value="resolve_first_ms"> first match — what an action resolves</label>';
  sec.appendChild(ctl);
  const host = document.createElement('div');
  sec.appendChild(host);
  const legend = document.createElement('div');
  legend.className = 'legend';
  legend.innerHTML =
    '<span><span class="sw" style="background:var(--text-muted)"></span>5 levels (control)</span>' +
    '<span><span class="sw" style="background:var(--series-1)"></span>50 levels</span>' +
    '<span><span class="sw" style="background:var(--grid)"></span>below the measurement floor</span>' +
    '<span>right-hand column: depth 50 ÷ depth 5 (a difference in ms where the control is at the floor), or "≈" when no difference is measurable</span>';
  sec.appendChild(legend);

  function draw(metric) {
    host.innerHTML = '';
    const rows = all.filter((x) => x.metric === metric)
      .sort((a, b) => b.deep.median - a.deep.median);
    const floor = Math.max(...rows.map((x) => x.noiseFloor), S.globalNoiseFloorMs);
    const vals = rows.flatMap((x) => [x.deep.median, x.shallow.median]).filter((v) => v > 0);
    const [e0, e1] = logAxis(Math.min(floor, ...vals) / 2, Math.max(...vals));
    const padL = 150, padR = 92, padT = 24, rowH = 22;
    const w = 900, plotW = w - padL - padR, h = padT + rows.length * rowH + 30;
    const X = (v) => padL + ((Math.log10(Math.max(v, Math.pow(10, e0))) - e0) / (e1 - e0)) * plotW;
    const svg = svgEl('svg', { viewBox: '0 0 ' + w + ' ' + h, role: 'img', 'aria-label': 'Query cost per strategy at depth 5 and depth 50' });

    svg.appendChild(svgEl('rect', { x: padL, y: padT - 6, width: Math.max(0, X(floor) - padL), height: rows.length * rowH + 6, fill: 'var(--grid)', opacity: 0.55 }));
    for (let e = e0; e <= e1; e++) {
      const x = X(Math.pow(10, e));
      svg.appendChild(svgEl('line', { x1: x, x2: x, y1: padT - 6, y2: padT + rows.length * rowH, class: 'gridline' }));
      const tk = svgEl('text', { x, y: padT + rows.length * rowH + 16, class: 'tick', 'text-anchor': 'middle' });
      tk.textContent = (e === e0 ? '≤ ' : '') + fmtMs(Math.pow(10, e));
      svg.appendChild(tk);
    }

    rows.forEach((x, i) => {
      const y = padT + i * rowH + rowH / 2;
      const v = verdictOf(x);
      const name = svgEl('text', { x: padL - 10, y: y + 4, class: 'lbl-strong', 'text-anchor': 'end' });
      name.textContent = x.strategyId;
      svg.appendChild(name);
      const xs = X(x.shallow.median), xd = X(x.deep.median);
      svg.appendChild(svgEl('line', { x1: Math.min(xs, xd), x2: Math.max(xs, xd), y1: y, y2: y,
        stroke: v === 'same' ? 'var(--axis)' : 'var(--series-1)', 'stroke-width': 2, opacity: v === 'same' ? 0.8 : 0.45 }));
      const g = svgEl('g');
      g.appendChild(svgEl('rect', { x: padL - 140, y: y - rowH / 2, width: w - padL + 140, height: rowH, fill: 'transparent' }));
      g.appendChild(svgEl('circle', { cx: xs, cy: y, r: 4.5, fill: 'var(--text-muted)', stroke: 'var(--surface-1)', 'stroke-width': 1.5 }));
      g.appendChild(svgEl('circle', { cx: xd, cy: y, r: 5, fill: 'var(--series-1)', stroke: 'var(--surface-1)', 'stroke-width': 1.5 }));
      const ratio = x.shallow.median > 0 ? x.deep.median / x.shallow.median : null;
      const lab = svgEl('text', { x: w - padR + 12, y: y + 4, class: v === 'same' ? 'tick' : 'lbl-strong' });
      // A ratio against a median at the floor is a division by noise; the
      // difference in milliseconds is the honest figure there.
      const atFloor = x.shallow.median <= x.noiseFloor;
      lab.textContent = v === 'same' ? '≈'
        : atFloor || ratio === null ? (x.medianDelta > 0 ? '+' : '') + fmtMs(x.medianDelta)
        : (ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)) + '×';
      g.appendChild(lab);
      hoverable(g,
        '<b>' + esc(x.strategyId) + '</b> <span class="m">· ' + esc(x.family) + '</span><br>' +
        '<span class="m">depth 5: ' + fmtMs(x.shallow.median) + ' (p95 ' + fmtMs(x.shallow.p95) + ', n=' + x.shallow.n + (x.shallow.probeOnly ? ', single probe' : '') + ')</span><br>' +
        '<span class="m">depth 50: ' + fmtMs(x.deep.median) + ' (p95 ' + fmtMs(x.deep.p95) + ', n=' + x.deep.n + (x.deep.probeOnly ? ', single probe' : '') + ')</span><br>' +
        '<span class="m">' + esc(VERDICT[v].label) + (Number.isFinite(x.p) ? ' · p=' + x.p.toExponential(1) : '') + ' · floor ' + fmtMs(x.noiseFloor) +
        (Number.isFinite(x.drift) ? ' · id.css drift ' + fmtMs(x.drift) : '') + '</span>'
      );
      svg.appendChild(g);
    });
    host.appendChild(svg);
  }
  draw('net_query_ms');
  ctl.addEventListener('change', (e) => draw(e.target.value));

  const qrows = all.filter((x) => x.metric === 'net_query_ms').sort((a, b) => b.deep.median - a.deep.median);
  const first = new Map(all.filter((x) => x.metric === 'resolve_first_ms').map((x) => [x.strategyId, x]));
  tableView(sec,
    ['Strategy', 'count() depth 5', 'count() depth 50', 'Δ', 'Verdict', 'first depth 5', 'first depth 50', 'Verdict'],
    qrows.map((x) => {
      const f = first.get(x.strategyId);
      return [
        stratChip(x.strategyId),
        fmtMs(x.shallow.median) + (x.shallow.probeOnly ? ' *' : ''),
        fmtMs(x.deep.median) + (x.deep.probeOnly ? ' *' : ''),
        fmtMs(x.medianDelta),
        esc(VERDICT[verdictOf(x)].label),
        f ? fmtMs(f.shallow.median) : '-',
        f ? fmtMs(f.deep.median) : '-',
        f ? esc(VERDICT[verdictOf(f)].label) : '-',
      ];
    }),
    'Show every strategy, both operations (* = single probe sample)');
})();

// --- where the target sits on the depth-50 page -----------------------------
(function deepLevels() {
  const cells = part('level').filter((c) => c.metric === 'net_query_ms' && c.stats && c.ok);
  if (!cells.length) return;
  const levels = [...new Set(cells.map((c) => c.dims.level))].sort((a, b) => a - b);
  const by = {};
  for (const c of cells) (by[c.strategyId] ??= {})[c.dims.level] = c;
  // Only locators unique at every level are drawn: a cost for 17 matches is not
  // the cost of finding the target. The table keeps them, with their counts.
  const complete = Object.keys(by).filter((id) => levels.every((l) => by[id][l]));
  const unique = complete.filter((id) => levels.every((l) => by[id][l].matches === 1));
  const peak = (id) => Math.max(...levels.map((l) => by[id][l].stats.median));
  const ranked = complete.sort((a, b) => peak(b) - peak(a));
  const picks = unique.sort((a, b) => peak(b) - peak(a)).slice(0, 6);
  if (!picks.includes('testid.api') && by['testid.api']) picks.push('testid.api');
  const nodes = cells[0].domNodes;

  const sec = section(
    'One depth-50 page, the target moved from top to bottom',
    'The page stays fixed — ' + nodes.toLocaleString() + ' elements, 50 levels — and only the level holding the target changes. Each level carries one addressable marker button, so the target is always the same kind of element. ' +
    'A flat line means the strategy does not care where on the page its target is. Drawn: the six costliest strategies that resolve to exactly one element at every level, plus <code>testid.api</code> as the reference. The table has every strategy, with match counts — the level markers share a class, so bare class locators are ambiguous here by design.' + specLink('level')
  );

  const vals = picks.flatMap((id) => levels.map((l) => by[id][l].stats.median)).filter((v) => v > 0);
  const [e0, e1] = logAxis(Math.min(S.globalNoiseFloorMs, ...vals), Math.max(...vals));
  const padL = 74, padR = 140, padT = 14, padB = 60;
  const w = 900, h = 400, plotW = w - padL - padR, plotH = h - padT - padB;
  const X = (l) => padL + ((l - levels[0]) / Math.max(1, levels[levels.length - 1] - levels[0])) * plotW;
  const Y = (v) => padT + plotH - ((Math.log10(Math.max(v, Math.pow(10, e0))) - e0) / (e1 - e0)) * plotH;
  const svg = svgEl('svg', { viewBox: '0 0 ' + w + ' ' + h, role: 'img', 'aria-label': 'Query cost against the level of the target on a depth-50 page' });
  for (let e = e0; e <= e1; e++) {
    const y = Y(Math.pow(10, e));
    svg.appendChild(svgEl('line', { x1: padL, x2: padL + plotW, y1: y, y2: y, class: 'gridline' }));
    const tk = svgEl('text', { x: padL - 9, y: y + 4, class: 'tick', 'text-anchor': 'end' });
    tk.textContent = (e === e0 ? '≤ ' : '') + fmtMs(Math.pow(10, e));
    svg.appendChild(tk);
  }
  for (const l of levels) {
    const x = X(l);
    svg.appendChild(svgEl('line', { x1: x, x2: x, y1: padT, y2: padT + plotH, class: 'gridline' }));
    const tk = svgEl('text', { x, y: h - padB + 16, class: 'tick', 'text-anchor': 'middle' });
    tk.textContent = 'level ' + l;
    svg.appendChild(tk);
  }
  const ax = svgEl('text', { x: padL + plotW / 2, y: h - 14, class: 'lbl', 'text-anchor': 'middle' });
  ax.textContent = 'Level of the target (0 = top, 50 = bottom)';
  svg.appendChild(ax);

  const labels = [];
  picks.forEach((id, i) => {
    const colour = 'var(--series-' + ((i % 7) + 1) + ')';
    const pts = levels.map((l) => [X(l), Y(by[id][l].stats.median)]);
    svg.appendChild(svgEl('polyline', { points: pts.map((p) => p.join(',')).join(' '), fill: 'none', stroke: colour, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
    levels.forEach((l, k) => {
      const c = by[id][l];
      const dot = svgEl('circle', { cx: pts[k][0], cy: pts[k][1], r: 4.5, fill: colour, stroke: 'var(--surface-1)', 'stroke-width': 2 });
      hoverable(dot,
        '<b>' + esc(id) + '</b><br><span class="m">level ' + l + ' · element depth ' + c.dims.targetDepth + '</span><br>' +
        '<span class="m">median ' + fmtMs(c.stats.median) + ' · p95 ' + fmtMs(c.stats.p95) + ' · n=' + c.n + '</span><br>' +
        '<span class="m">' + c.matches + ' match(es)</span>');
      svg.appendChild(dot);
    });
    labels.push({ id, y: pts[pts.length - 1][1], colour });
  });
  // End labels, pushed apart so lines that finish close together stay legible.
  labels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 13);
  for (const l of labels) {
    const t = svgEl('text', { x: padL + plotW + 10, y: l.y + 4, class: 'lbl' });
    t.textContent = l.id;
    svg.appendChild(t);
  }
  sec.appendChild(svg);
  const legend = document.createElement('div');
  legend.className = 'legend';
  legend.innerHTML = picks.map((id, i) => '<span><span class="sw" style="background:var(--series-' + ((i % 7) + 1) + ')"></span>' + esc(id) + '</span>').join('');
  sec.appendChild(legend);

  tableView(sec, ['Strategy', ...levels.map((l) => 'level ' + l), 'matches'],
    ranked.map((id) => [stratChip(id), ...levels.map((l) => fmtMs(by[id][l].stats.median) + (by[id][l].probeOnly ? ' *' : '')),
      [...new Set(levels.map((l) => by[id][l].matches))].join(' / ')]),
    'Show every strategy at every level (* = single probe sample)');
})();

// --- scoping at depth ---------------------------------------------------------
(function deepScoping() {
  const cells = part('level').filter((c) => c.metric === 'net_query_ms' && c.stats && c.ok);
  const PAIRS = [['role.name', 'scoped.role'], ['class.semantic.nth', 'scoped.class']];
  const levels = [...new Set(cells.map((c) => c.dims.level))].sort((a, b) => a - b);
  const get = (id, l) => cells.find((c) => c.strategyId === id && c.dims.level === l);
  const pairs = PAIRS.filter(([a, b]) => levels.every((l) => get(a, l) && get(b, l)));
  if (!pairs.length) return;

  const sec = section(
    'Does scoping pay when the container is deep?',
    'The scoped strategies narrow to the nearest test-id container first, here the target\'s own level. On a nested page a container holds every level beneath it, so the elements left to search after scoping (the grey bars) shrink as the target moves down. ' +
    'Solid lines search the whole document; dashed lines search the container. Where the two meet, scoping bought nothing.' + specLink('level')
  );

  const vals = pairs.flatMap(([a, b]) => levels.flatMap((l) => [get(a, l).stats.median, get(b, l).stats.median])).filter((v) => v > 0);
  const [e0, e1] = logAxis(Math.min(S.globalNoiseFloorMs, ...vals), Math.max(...vals));
  const padL = 74, padR = 150, padT = 14, padB = 96, barH = 30;
  const w = 900, h = 440, plotW = w - padL - padR, plotH = h - padT - padB - barH;
  const X = (l) => padL + ((l - levels[0]) / Math.max(1, levels[levels.length - 1] - levels[0])) * plotW;
  const Y = (v) => padT + plotH - ((Math.log10(Math.max(v, Math.pow(10, e0))) - e0) / (e1 - e0)) * plotH;
  const svg = svgEl('svg', { viewBox: '0 0 ' + w + ' ' + h, role: 'img', 'aria-label': 'Scoped against document-wide query cost by target level' });
  for (let e = e0; e <= e1; e++) {
    const y = Y(Math.pow(10, e));
    svg.appendChild(svgEl('line', { x1: padL, x2: padL + plotW, y1: y, y2: y, class: 'gridline' }));
    const tk = svgEl('text', { x: padL - 9, y: y + 4, class: 'tick', 'text-anchor': 'end' });
    tk.textContent = (e === e0 ? '≤ ' : '') + fmtMs(Math.pow(10, e));
    svg.appendChild(tk);
  }
  const maxScope = Math.max(...levels.map((l) => get(pairs[0][0], l).dims.scopeSize || 0), 1);
  const barTop = padT + plotH + 30;
  for (const l of levels) {
    const x = X(l);
    svg.appendChild(svgEl('line', { x1: x, x2: x, y1: padT, y2: padT + plotH, class: 'gridline' }));
    const tk = svgEl('text', { x, y: padT + plotH + 16, class: 'tick', 'text-anchor': 'middle' });
    tk.textContent = 'level ' + l;
    svg.appendChild(tk);
    const size = get(pairs[0][0], l).dims.scopeSize || 0;
    const bw = 46, bh = (size / maxScope) * barH;
    const g = svgEl('g');
    g.appendChild(svgEl('rect', { x: x - bw / 2, y: barTop + barH - bh, width: bw, height: Math.max(1, bh), rx: 2, fill: 'var(--axis)' }));
    const t = svgEl('text', { x, y: barTop + barH + 14, class: 'tick', 'text-anchor': 'middle' });
    t.textContent = size.toLocaleString();
    g.appendChild(t);
    hoverable(g, '<b>level ' + l + '</b><br><span class="m">' + size.toLocaleString() + ' elements inside the scope container</span>');
    svg.appendChild(g);
  }
  const cap = svgEl('text', { x: padL - 30, y: barTop + barH / 2 + 4, class: 'tick', 'text-anchor': 'end' });
  cap.textContent = 'in scope';
  svg.appendChild(cap);

  const labels = [];
  pairs.forEach(([doc, scoped], i) => {
    const colour = 'var(--series-' + (i + 1) + ')';
    [[doc, ''], [scoped, '5 4']].forEach(([id, dash]) => {
      const pts = levels.map((l) => [X(l), Y(get(id, l).stats.median)]);
      svg.appendChild(svgEl('polyline', { points: pts.map((p) => p.join(',')).join(' '), fill: 'none', stroke: colour, 'stroke-width': 2, 'stroke-dasharray': dash }));
      levels.forEach((l, k) => {
        const c = get(id, l);
        const dot = svgEl('circle', { cx: pts[k][0], cy: pts[k][1], r: 4, fill: dash ? 'var(--surface-1)' : colour, stroke: colour, 'stroke-width': 2 });
        hoverable(dot, '<b>' + esc(id) + '</b><br><span class="m">level ' + l + ' · median ' + fmtMs(c.stats.median) + ' · n=' + c.n + '</span>');
        svg.appendChild(dot);
      });
      labels.push({ id, y: pts[pts.length - 1][1] });
    });
  });
  labels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 13);
  for (const l of labels) {
    const t = svgEl('text', { x: padL + plotW + 10, y: l.y + 4, class: 'lbl' });
    t.textContent = l.id;
    svg.appendChild(t);
  }
  sec.appendChild(svg);

  tableView(sec, ['Level', 'In scope', ...pairs.flatMap(([a, b]) => [a, b, b + ' ÷ ' + a])],
    levels.map((l) => [
      'level ' + l,
      (get(pairs[0][0], l).dims.scopeSize || 0).toLocaleString(),
      ...pairs.flatMap(([a, b]) => {
        const ma = get(a, l).stats.median, mb = get(b, l).stats.median;
        return [fmtMs(ma), fmtMs(mb), ma > 0 ? (mb / ma).toFixed(2) + '×' : '-'];
      }),
    ]));
})();

// --- a whole click ------------------------------------------------------------
(function deepClick() {
  const rows = CONTRAST.filter((x) => x.metric === 'action_click_ms').sort((a, b) => b.deep.median - a.deep.median);
  if (!rows.length) return;
  const failed = part('click').filter((c) => !c.ok);
  const sec = section(
    'What a whole click costs at depth 50',
    'Query cost is only the first step of an action: Playwright then scrolls the element into view, waits for it to be visible, stable and enabled, hit-tests it and dispatches the events. Every repetition here starts scrolled to the top, so it pays the scroll a real test would. Bars are [[median|medians]] of ' +
    rows[0].deep.n + ' clicks, whiskers the p95; each strategy was proved to land on the leaf through the app\'s own action log.' + specLink('click')
  );
  const vals = rows.flatMap((x) => [x.deep.p95, x.shallow.p95, x.deep.median, x.shallow.median]).filter(Number.isFinite);
  const max = Math.max(...vals) * 1.08;
  const padL = 150, padR = 96, padT = 10, rowH = 34;
  const w = 900, plotW = w - padL - padR, h = padT + rows.length * rowH + 30;
  const X = (v) => padL + (v / max) * plotW;
  const svg = svgEl('svg', { viewBox: '0 0 ' + w + ' ' + h, role: 'img', 'aria-label': 'Click cost per strategy at depth 5 and depth 50' });
  const step = max > 400 ? 100 : max > 150 ? 50 : max > 60 ? 20 : 10;
  for (let v = 0; v <= max; v += step) {
    const x = X(v);
    svg.appendChild(svgEl('line', { x1: x, x2: x, y1: padT, y2: padT + rows.length * rowH, class: 'gridline' }));
    const tk = svgEl('text', { x, y: padT + rows.length * rowH + 16, class: 'tick', 'text-anchor': 'middle' });
    tk.textContent = v + ' ms';
    svg.appendChild(tk);
  }
  rows.forEach((x, i) => {
    const y = padT + i * rowH;
    const name = svgEl('text', { x: padL - 10, y: y + rowH / 2 + 4, class: 'lbl-strong', 'text-anchor': 'end' });
    name.textContent = x.strategyId;
    svg.appendChild(name);
    const g = svgEl('g');
    [['shallow', 'var(--text-muted)', 4], ['deep', 'var(--series-1)', 17]].forEach(([k, colour, dy]) => {
      const m = x[k];
      g.appendChild(svgEl('rect', { x: padL, y: y + dy, width: Math.max(1, X(m.median) - padL), height: 11, rx: 2, fill: colour }));
      g.appendChild(svgEl('line', { x1: X(m.median), x2: X(m.p95), y1: y + dy + 5.5, y2: y + dy + 5.5, stroke: colour, 'stroke-width': 1.5 }));
      g.appendChild(svgEl('line', { x1: X(m.p95), x2: X(m.p95), y1: y + dy + 1, y2: y + dy + 10, stroke: colour, 'stroke-width': 1.5 }));
    });
    const v = verdictOf(x);
    const lab = svgEl('text', { x: w - padR + 12, y: y + rowH / 2 + 4, class: v === 'same' ? 'tick' : 'lbl-strong' });
    lab.textContent = v === 'same' ? '≈' : (x.medianDelta > 0 ? '+' : '') + fmtMs(x.medianDelta);
    g.appendChild(lab);
    hoverable(g,
      '<b>' + esc(x.strategyId) + '</b><br>' +
      '<span class="m">depth 5: ' + fmtMs(x.shallow.median) + ' (p95 ' + fmtMs(x.shallow.p95) + ')</span><br>' +
      '<span class="m">depth 50: ' + fmtMs(x.deep.median) + ' (p95 ' + fmtMs(x.deep.p95) + ')</span><br>' +
      '<span class="m">' + esc(VERDICT[v].label) + (Number.isFinite(x.p) ? ' · p=' + x.p.toExponential(1) : '') + '</span>');
    svg.appendChild(g);
  });
  sec.appendChild(svg);
  const legend = document.createElement('div');
  legend.className = 'legend';
  legend.innerHTML =
    '<span><span class="sw" style="background:var(--text-muted)"></span>5 levels (control)</span>' +
    '<span><span class="sw" style="background:var(--series-1)"></span>50 levels</span>' +
    '<span>right-hand column: median difference, or "≈" when not significant</span>';
  sec.appendChild(legend);
  if (failed.length) {
    const p = document.createElement('p');
    p.className = 'caveat';
    p.textContent = 'Not shown, because they did not complete: ' + failed.map((c) => c.strategyId + ' at depth ' + c.dims.requestedDepth + ' (' + c.error + ')').join('; ');
    sec.appendChild(p);
  }
  tableView(sec, ['Strategy', 'depth 5 median', 'depth 5 p95', 'depth 50 median', 'depth 50 p95', 'Δ median', 'Verdict'],
    rows.map((x) => [stratChip(x.strategyId), fmtMs(x.shallow.median), fmtMs(x.shallow.p95), fmtMs(x.deep.median), fmtMs(x.deep.p95), fmtMs(x.medianDelta), esc(VERDICT[verdictOf(x)].label)]));
})();
`;

/**
 * The results page's robustness matrix, introduced for this page. Its own lede
 * describes S6's grid; the paragraph below says what differs here.
 */
const ROBUSTNESS_INTRO = String.raw`
(function deepRobustnessIntro() {
  if (!Object.keys(S.robustness || {}).length) return;
  const p = document.createElement('p');
  p.className = 'caveat';
  p.innerHTML = gloss('The matrix below is the same test as the results page, on the leaf of the depth-50 page. The structural selectors here are fifty-odd steps long rather than nine. ') + specLink('robustness');
  document.getElementById('sections').appendChild(p);
})();
`;

const client = [
  CLIENT_PRELUDE,
  DEEP_JS,
  ROBUSTNESS_INTRO,
  clientBlock('robustness'),
  clientBlock('glossarySection'),
].join('\n');

const nav = siteNav('deep', dirname(OUT));
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, renderHtml(summary, nav, {
  title: 'Depth 50 Locators',
  heading: 'Locators on a page 50 levels deep',
  sub: 'Every strategy, about 5,000 elements, the target fifty component levels down — against a five-level page with the same element count.',
  client,
}));
console.log(`Wrote ${OUT} (${(readFileSync(OUT).length / 1024).toFixed(0)} kB, ${summary.cells.length} cells, ${(summary.depthContrast ?? []).length} depth contrasts)`);
