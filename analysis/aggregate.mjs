/**
 * Aggregates raw benchmark records into a single summary the dashboard renders.
 *
 * Design rules this file follows:
 *  - Never discard a record silently. Failures, zero-match locators and
 *    probe-only samples all carry information; they are marked, not dropped.
 *  - Never report a difference the noise floor cannot support, however good its
 *    p-value looks.
 *  - Report the speed weight the data justifies rather than one chosen in advance.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { bootstrapMedianCI, compare, quantile, summarise } from './stats.mjs';

const RAW_DIR = resolve(process.env.BM_RESULTS_DIR ?? 'results/raw');
const OUT = resolve('results/summary.json');

/** The strategy every other strategy is measured against: the cheapest possible query. */
const REFERENCE = 'id.css';

/**
 * A query at or above this is treated as pathological and reported individually
 * rather than only as a point on a curve. One second is the threshold at which a
 * single locator starts being visible in a suite's wall clock.
 */
const SLOW_MS = Number(process.env.BM_SLOW_MS ?? 1000);

/**
 * Composite weights.
 *
 * Robustness and strictness dominate deliberately. Both are correctness
 * properties: a locator that breaks on a copy change, or that silently matches
 * two elements, costs a developer an afternoon. Speed differences, unless they
 * are enormous, cost milliseconds. The speed term still bites hard for the
 * pathological strategies because it is scored on a log scale spanning the five
 * orders of magnitude actually observed.
 */
const WEIGHTS = { robustness: 0.35, strictness: 0.3, speed: 0.2, failure: 0.15 };

/**
 * How many of the four components a strategy must have before it is ranked.
 *
 * Scores are renormalised over the components that applied, so a strategy
 * measured on one axis alone would tie for first on a single perfect score.
 * Anything below this is listed as measured-but-unranked instead.
 */
const MIN_COMPOSITE_COVERAGE = 3;

function readRecords() {
  let files;
  try {
    files = readdirSync(RAW_DIR);
  } catch {
    console.error(`No results directory at ${RAW_DIR}. Run the benchmark first.`);
    process.exit(1);
  }

  const records = [];
  const envs = [];
  for (const f of files) {
    const path = join(RAW_DIR, f);
    if (f.endsWith('.ndjson')) {
      for (const line of readFileSync(path, 'utf8').split('\n')) {
        if (line.trim()) records.push(JSON.parse(line));
      }
    } else if (f.startsWith('env-') && f.endsWith('.json')) {
      envs.push(JSON.parse(readFileSync(path, 'utf8')));
    }
  }
  return { records, envs };
}

/**
 * Picks which run to analyse.
 *
 * results/raw is append-only and can legitimately hold several runs - and can
 * illegitimately hold several, because a killed Playwright parent leaves worker
 * processes that keep writing after the directory has been cleared. Merging runs
 * that measured different strategy matrices, or ran on different hardware, would
 * silently produce a ranking over an inconsistent set, and nothing about the
 * output would look wrong.
 *
 * Default: the newest run only. BM_RUN=<id> selects one explicitly; BM_RUN=all
 * merges, but only after checking that every run measured the same matrix on the
 * same machine, and refuses otherwise.
 */
function selectRun({ records, envs }) {
  const runIds = [...new Set(records.map((r) => r.runId))].sort();
  const want = process.env.BM_RUN;

  if (runIds.length === 1 && want !== 'all') {
    return { records, envs: envs.filter((e) => e.runId === runIds[0]) };
  }

  if (want === 'all') {
    const matrices = new Set(envs.map((e) => (e.strategyIds ?? []).join(',')));
    const machines = new Set(envs.map((e) => `${e.cpuModel}|${e.playwrightVersion}|${e.browserVersion}`));
    if (matrices.size > 1 || machines.size > 1) {
      console.error(
        'Refusing to merge runs: they do not share a strategy matrix or an environment.\n' +
        `  strategy matrices: ${matrices.size}, environments: ${machines.size}\n` +
        '  Analyse one run at a time with BM_RUN=<id>.',
      );
      process.exit(1);
    }
    console.log(`Merging ${runIds.length} runs: ${runIds.join(', ')}`);
    return { records, envs };
  }

  const chosen = want && runIds.includes(want) ? want : runIds[runIds.length - 1];
  if (want && !runIds.includes(want)) {
    console.error(`No run "${want}" in ${RAW_DIR}. Available: ${runIds.join(', ')}`);
    process.exit(1);
  }

  const dropped = runIds.filter((r) => r !== chosen);
  if (dropped.length) {
    console.log(
      `${runIds.length} runs present; analysing ${chosen} only.\n` +
      `  Ignored: ${dropped.join(', ')}. Use BM_RUN=<id> to pick one, or BM_RUN=all to merge.`,
    );
  }
  return {
    records: records.filter((r) => r.runId === chosen),
    envs: envs.filter((e) => e.runId === chosen),
  };
}

/** Identifies the exact page shape a measurement was taken against. */
function dimsKey(r) {
  const d = r.dims ?? {};
  const parts = [r.scenario, r.route];
  for (const k of ['tier', 'position', 'cards', 'hz', 'trackby', 'lateMode', 'encapsulation', 'mutation', 'virtual', 'failureMode', 'op']) {
    if (d[k] !== undefined) parts.push(`${k}=${d[k]}`);
  }
  return parts.join('|');
}

/**
 * The samples a metric should be summarised on.
 *
 * Timing metrics are summarised on the paired-net series, because the raw series
 * is mostly round-trip cost. Everything else is already the quantity of interest.
 */
function seriesFor(r) {
  const paired = r.baseline && r.baseline.length === r.samples.length;
  if (paired && (r.metric === 'net_query_ms' || r.metric === 'resolve_first_ms')) {
    return r.samples.map((s, i) => Math.max(0, s - r.baseline[i]));
  }
  return r.samples;
}

function main() {
  const all = readRecords();
  if (all.records.length === 0) {
    console.error(`No records found in ${RAW_DIR}.`);
    process.exit(1);
  }

  const { records, envs } = selectRun(all);

  // --- noise floors, per page shape ---------------------------------------
  //
  // Two different floors, because they answer two different questions and
  // conflating them is the easiest way to draw a wrong conclusion here.
  //
  //   sampleFloor  p95 of a single baseline-vs-baseline difference. This is how
  //                much one measurement can be off by. It is large - round-trip
  //                jitter dominates - and it is the wrong yardstick for a median.
  //   medianFloor  the magnitude of median shift that noise alone can produce,
  //                taken from the bootstrap CI of the paired-difference median.
  //                Medians of n paired differences are far more stable than one
  //                difference, so this is the floor that applies when comparing
  //                two strategies' medians, and it is what the verdicts use.
  const noiseFloors = {};
  const sampleFloors = {};
  for (const r of records) {
    if (r.metric !== 'noise_floor_ms') continue;
    const key = dimsKey(r);
    const abs = r.samples.map(Math.abs).sort((a, b) => a - b);
    sampleFloors[key] = quantile(abs, 0.95);
    const ci = bootstrapMedianCI(r.samples);
    noiseFloors[key] = Number.isFinite(ci.lo)
      ? Math.max(Math.abs(ci.lo), Math.abs(ci.hi))
      : sampleFloors[key];
  }
  const globalFloor =
    quantile(Object.values(noiseFloors).sort((a, b) => a - b), 0.5) || 0.1;
  const globalSampleFloor =
    quantile(Object.values(sampleFloors).sort((a, b) => a - b), 0.5) || 0.1;

  // --- per-cell summaries --------------------------------------------------
  const cells = [];
  for (const r of records) {
    if (r.metric === 'noise_floor_ms' || r.metric === 'round_trip_ms') continue;
    const series = seriesFor(r);
    const key = dimsKey(r);
    cells.push({
      key,
      scenario: r.scenario,
      route: r.route,
      metric: r.metric,
      strategyId: r.strategyId,
      family: r.family,
      dims: r.dims,
      matches: r.matches,
      ok: r.ok,
      error: r.error,
      domNodes: r.domNodes,
      renderMs: r.renderMs,
      n: series.length,
      probeOnly: !!r.dims?.probeOnly,
      budgetLimited: !!r.dims?.budgetLimited,
      stats: series.length ? summarise(series) : null,
      ci: series.length >= 5 ? bootstrapMedianCI(series) : null,
      rawStats: r.samples.length ? summarise(r.samples) : null,
      baselineStats: r.baseline?.length ? summarise(r.baseline) : null,
      noiseFloor: noiseFloors[key] ?? globalFloor,
    });
  }

  // --- pairwise comparisons against the reference strategy ------------------
  const comparisons = [];
  const byKeyMetric = new Map();
  for (const c of cells) {
    const k = `${c.key}::${c.metric}`;
    if (!byKeyMetric.has(k)) byKeyMetric.set(k, []);
    byKeyMetric.get(k).push(c);
  }

  for (const [k, group] of byKeyMetric) {
    const ref = group.find((c) => c.strategyId === REFERENCE && c.n > 0);
    if (!ref) continue;
    const refSeries = rebuildSeries(records, ref);
    for (const c of group) {
      if (c.strategyId === REFERENCE || c.n === 0) continue;
      const series = rebuildSeries(records, c);
      const cmp = compare(series, refSeries, c.noiseFloor);
      comparisons.push({
        key: c.key,
        metric: c.metric,
        strategyId: c.strategyId,
        family: c.family,
        vs: REFERENCE,
        ...cmp,
        // How many times the reference cost this strategy costs. The number
        // people quote; kept next to the significance verdict so it cannot be
        // quoted without it.
        ratio: ref.stats && ref.stats.median > 0 ? c.stats.median / ref.stats.median : null,
        nA: series.length,
        nB: refSeries.length,
        probeOnly: c.probeOnly,
        noiseFloor: c.noiseFloor,
      });
      void k;
    }
  }

  // --- robustness matrix (S6) ----------------------------------------------
  const robustness = {};
  for (const r of records) {
    if (r.metric !== 'robustness') continue;
    robustness[r.strategyId] ??= {
      family: r.family, outcomes: {}, survived: 0, total: 0, baselineUnique: true,
      baselineOutcome: 'survived',
    };
    const e = robustness[r.strategyId];
    e.outcomes[r.dims.mutation] = {
      outcome: r.dims.outcome,
      matches: r.matches,
      detail: r.error,
    };
    e.total++;
    if (r.dims.outcome === 'survived') e.survived++;
    if (r.dims.baselineUnique === false) e.baselineUnique = false;
    if (r.dims.baselineOutcome) e.baselineOutcome = r.dims.baselineOutcome;
  }
  for (const v of Object.values(robustness)) {
    // Robustness asks "did this change break the locator". For a locator that was
    // already ambiguous before anything changed, the question has no answer, and
    // scoring it zero would charge it twice for one flaw - here and again in the
    // ambiguity sweep. Those strategies get null, and strictness carries the
    // penalty on its own.
    v.rate = v.baselineUnique ? (v.total ? v.survived / v.total : 0) : null;
    v.observedRate = v.total ? v.survived / v.total : 0;
    // Resolving to exactly one wrong element is worse than resolving to none: it
    // passes. Tracked separately from the survival rate.
    v.silentlyWrong = Object.values(v.outcomes).filter((o) => o.outcome === 'broken-wrong').length;
  }

  // --- ambiguity sweep (S5) ------------------------------------------------
  const ambiguity = {};
  for (const r of records) {
    if (r.metric !== 'match_count' || r.scenario !== 'S5') continue;
    ambiguity[r.strategyId] ??= { family: r.family, byCards: {}, uniqueAt: 0, total: 0 };
    ambiguity[r.strategyId].byCards[r.dims.cards] = r.matches;
    ambiguity[r.strategyId].total++;
    if (r.matches === 1) ambiguity[r.strategyId].uniqueAt++;
  }
  for (const v of Object.values(ambiguity)) {
    v.rate = v.total ? v.uniqueAt / v.total : 0;
    // The size at which the locator stopped being unique. Null means it never did.
    const broke = Object.entries(v.byCards)
      .map(([cards, m]) => [Number(cards), m])
      .sort((a, b) => a[0] - b[0])
      .find(([, m]) => m !== 1);
    v.breaksAtCards = broke ? broke[0] : null;
  }

  // --- failure cost (S10) --------------------------------------------------
  const failure = {};
  for (const r of records) {
    if (r.metric !== 'failure_miss_ms' && r.metric !== 'failure_strict_ms') continue;
    failure[r.strategyId] ??= { family: r.family };
    failure[r.strategyId][r.metric === 'failure_miss_ms' ? 'miss' : 'strict'] = {
      ms: r.samples[0] ?? null,
      matches: r.matches,
      legibility: r.dims.legibility,
      errorChars: r.dims.errorChars,
      error: r.error,
      timeoutMs: r.dims.timeoutMs,
    };
  }

  // --- how much of an action's cost is query cost ---------------------------
  // The empirical answer to "does locator speed matter", computed rather than
  // assumed. Compared at the largest DOM tier measured.
  const largestTier = pickLargestTier(cells);
  const actionCells = cells.filter((c) => c.metric === 'action_click_ms' && c.stats && c.dims?.hz === 0);
  const typicalActionMs = actionCells.length
    ? quantile(actionCells.map((c) => c.stats.median).sort((a, b) => a - b), 0.5)
    : null;

  const speedShare = {};
  for (const c of cells) {
    if (c.metric !== 'net_query_ms' || c.dims?.tier !== largestTier || !c.stats) continue;
    speedShare[c.strategyId] = typicalActionMs ? c.stats.median / typicalActionMs : null;
  }

  // --- queries that take longer than a second -------------------------------
  //
  // Reported per occurrence, with where the target actually sits in the DOM, not
  // just how big the page was. Depth and page size are usually confounded - deeper
  // pages tend to be bigger - so both travel with every record and S12 varies
  // depth at a fixed element count to separate them.
  const timingMetrics = new Set(['net_query_ms', 'resolve_first_ms', 'action_click_ms', 'overlay_resolve_ms']);
  const slowQueries = cells
    .filter((c) => timingMetrics.has(c.metric) && c.stats && c.stats.median >= SLOW_MS)
    .map((c) => ({
      scenario: c.scenario,
      route: c.route,
      key: c.key,
      metric: c.metric,
      strategyId: c.strategyId,
      family: c.family,
      medianMs: c.stats.median,
      p95Ms: c.stats.p95,
      n: c.n,
      probeOnly: c.probeOnly,
      // A failed record's duration is a timeout, not a measurement of how long
      // the query takes. Reporting the two side by side without the distinction
      // would let an 8s ceiling read as an 8s lookup.
      ok: c.ok,
      error: c.error,
      timedOut: !c.ok,
      matches: c.matches,
      domNodes: c.domNodes,
      depth: c.dims?.targetDepth ?? null,
      siblings: c.dims?.targetSiblings ?? null,
      shadowHops: c.dims?.shadowHops ?? 0,
      ancestorTags: c.dims?.ancestorTags ?? '',
    }))
    .sort((a, b) => b.medianMs - a.medianMs);

  // Where slow targets live: count and cost grouped by exact depth.
  const slowByDepth = {};
  for (const q of slowQueries) {
    if (q.depth === null || q.depth < 0) continue;
    slowByDepth[q.depth] ??= { depth: q.depth, count: 0, medians: [], strategies: new Set(), routes: new Set() };
    slowByDepth[q.depth].count++;
    slowByDepth[q.depth].medians.push(q.medianMs);
    slowByDepth[q.depth].strategies.add(q.strategyId);
    slowByDepth[q.depth].routes.add(q.route);
  }
  const slowDepthProfile = Object.values(slowByDepth)
    .map((d) => ({
      depth: d.depth,
      count: d.count,
      medianMs: quantile([...d.medians].sort((a, b) => a - b), 0.5),
      maxMs: Math.max(...d.medians),
      strategies: [...d.strategies].sort(),
      routes: [...d.routes].sort(),
    }))
    .sort((a, b) => b.count - a.count || b.medianMs - a.medianMs);

  // Which strategies produce slow queries at all, and how deep their targets were.
  const slowByStrategy = {};
  for (const q of slowQueries) {
    slowByStrategy[q.strategyId] ??= { family: q.family, count: 0, worstMs: 0, depths: [] };
    const e = slowByStrategy[q.strategyId];
    e.count++;
    e.worstMs = Math.max(e.worstMs, q.medianMs);
    if (q.depth !== null && q.depth >= 0) e.depths.push(q.depth);
  }
  for (const e of Object.values(slowByStrategy)) {
    e.medianDepth = e.depths.length ? quantile([...e.depths].sort((a, b) => a - b), 0.5) : null;
  }

  // The controlled view: S12 holds element count constant and varies depth only.
  const depthSweep = {};
  for (const c of cells) {
    if (c.scenario !== 'S12' || c.metric !== 'net_query_ms' || !c.stats) continue;
    const d = c.dims?.targetDepth ?? -1;
    depthSweep[c.strategyId] ??= {};
    depthSweep[c.strategyId][d] = {
      medianMs: c.stats.median,
      domNodes: c.domNodes,
      requestedDepth: c.dims?.requestedDepth ?? null,
      n: c.n,
    };
  }

  // --- mechanism: what work a query causes, not how long it takes ------------
  const mechanism = {};
  for (const r of records) {
    if (r.metric !== 'mechanism') continue;
    mechanism[r.strategyId] = {
      family: r.family,
      matches: r.matches,
      forcedLayoutsPerQuery: r.dims.forcedLayoutsPerQuery,
      // The number that turns an inference into evidence: forced style-and-layout
      // passes divided by candidate elements. 1.00 means the engine reads layout
      // once per candidate, which is a property of the engine rather than of this
      // machine or this page size.
      layoutsPerCandidate: r.dims.layoutsPerCandidate < 0 ? null : r.dims.layoutsPerCandidate,
      gcMsPerQuery: r.dims.gcMsPerQuery,
      taskMsPerQuery: r.dims.taskMsPerQuery,
      topEvents: r.dims.topEvents,
      domNodes: r.domNodes,
    };
  }

  // --- composite ranking ---------------------------------------------------
  const composite = buildComposite({
    cells, robustness, ambiguity, failure, largestTier, globalFloor,
  });

  const summary = {
    generatedAt: new Date().toISOString(),
    envs,
    reference: REFERENCE,
    weights: WEIGHTS,
    globalNoiseFloorMs: globalFloor,
    globalSampleFloorMs: globalSampleFloor,
    noiseFloors,
    sampleFloors,
    largestTier,
    typicalActionMs,
    speedShare,
    recordCount: records.length,
    slowThresholdMs: SLOW_MS,
    slowQueries,
    slowDepthProfile,
    slowByStrategy,
    depthSweep,
    mechanism,
    cells,
    comparisons,
    robustness,
    ambiguity,
    failure,
    composite,
  };

  mkdirSync(resolve('results'), { recursive: true });
  writeFileSync(OUT, JSON.stringify(summary, null, 2));
  report(summary);
}

/** Recovers the exact series a cell was summarised from, for pairwise testing. */
function rebuildSeries(records, cell) {
  const r = records.find(
    (x) =>
      x.strategyId === cell.strategyId &&
      x.metric === cell.metric &&
      dimsKey(x) === cell.key,
  );
  return r ? seriesFor(r) : [];
}

function pickLargestTier(cells) {
  const tiers = cells
    .filter((c) => c.dims?.tier && c.metric === 'net_query_ms')
    .map((c) => ({ tier: c.dims.tier, nodes: c.domNodes }));
  if (!tiers.length) return null;
  return tiers.sort((a, b) => b.nodes - a.nodes)[0].tier;
}

function buildComposite({ cells, robustness, ambiguity, failure, largestTier, globalFloor }) {
  const strategies = new Set([
    ...Object.keys(robustness),
    ...Object.keys(ambiguity),
    ...cells.filter((c) => c.metric === 'net_query_ms').map((c) => c.strategyId),
  ]);

  // Speed is scored on a log scale: the observed range spans seven orders of
  // magnitude, and a linear score would collapse everything except the worst
  // strategy into a single indistinguishable band.
  //
  // Medians are clamped at the noise floor rather than at an arbitrary epsilon.
  // Several strategies measure at or below the floor, and letting those compete
  // on the exact value would rank them by rounding error - which is how XPath
  // ends up 'faster than #id' in a careless benchmark. Everything at or under the
  // floor scores identically, because the data cannot separate them.
  const speedMedians = {};
  const speedAtFloor = new Set();
  for (const c of cells) {
    if (c.metric === 'net_query_ms' && c.dims?.tier === largestTier && c.stats) {
      const floor = c.noiseFloor ?? globalFloor;
      if (c.stats.median <= floor) speedAtFloor.add(c.strategyId);
      speedMedians[c.strategyId] = Math.max(c.stats.median, floor);
    }
  }
  const logs = Object.values(speedMedians).map((v) => Math.log10(v));
  const loMs = Math.min(...logs);
  const hiMs = Math.max(...logs);

  const rows = [];
  for (const id of strategies) {
    const speedMs = speedMedians[id];
    const speed =
      speedMs === undefined || hiMs === loMs
        ? null
        : 1 - (Math.log10(speedMs) - loMs) / (hiMs - loMs);

    const rob = robustness[id]?.rate ?? null;
    const strict = ambiguity[id]?.rate ?? null;

    // Failure score rewards failing fast and failing legibly. A strict-mode
    // violation that aborts in 30ms with a message naming both elements is a
    // better outcome than a 30-second timeout saying "Timeout exceeded".
    const f = failure[id];
    let failScore = null;
    if (f) {
      const legible = ((f.miss?.legibility ?? 0) + (f.strict?.legibility ?? 0)) / 6;
      const timeoutMs = f.miss?.timeoutMs ?? 4000;
      const fastFail = f.strict ? 1 - Math.min(1, (f.strict.ms ?? 0) / timeoutMs) : 0.5;
      failScore = 0.5 * legible + 0.5 * fastFail;
    }

    const parts = [
      [rob, WEIGHTS.robustness],
      [strict, WEIGHTS.strictness],
      [speed, WEIGHTS.speed],
      [failScore, WEIGHTS.failure],
    ].filter(([v]) => v !== null && Number.isFinite(v));

    // Renormalise over the components that exist, so a strategy is never
    // penalised for a scenario that did not apply to it.
    const weightSum = parts.reduce((a, [, w]) => a + w, 0);
    const total = weightSum ? parts.reduce((a, [v, w]) => a + v * w, 0) / weightSum : null;

    // A strategy scored on a single axis is not comparable to one scored on four:
    // renormalising over one component lets a lone perfect score tie for first.
    // Those are reported separately rather than ranked.
    const ranked = parts.length >= MIN_COMPOSITE_COVERAGE;

    rows.push({
      strategyId: id,
      ranked,
      family:
        robustness[id]?.family ?? ambiguity[id]?.family ??
        cells.find((c) => c.strategyId === id)?.family ?? 'unknown',
      speedMs: speedMs ?? null,
      // True when the measurement sits at or below the noise floor, i.e. the
      // strategy is 'as fast as anything we can measure', not 'fastest'.
      speedAtFloor: speedAtFloor.has(id),
      speed,
      robustness: rob,
      strictness: strict,
      failure: failScore,
      coverage: parts.length,
      total,
    });
  }

  rows.sort((a, b) => {
    if (a.ranked !== b.ranked) return a.ranked ? -1 : 1;
    return (b.total ?? -1) - (a.total ?? -1);
  });
  let rank = 0;
  for (const r of rows) r.rank = r.ranked ? ++rank : null;
  return rows;
}

function report(s) {
  const env = s.envs[0];
  console.log(`\nAggregated ${s.recordCount} records from ${s.envs.length} run(s)`);
  if (env?.strategyIds) console.log(`  matrix: ${env.strategyIds.length} strategies`);
  if (env) {
    console.log(`  ${env.cpuModel} x${env.cpuCount} | pw ${env.playwrightVersion} | chromium ${env.browserVersion}`);
    if (!env.browserRevisionMatched) console.log(`  NOTE: ${env.notes[0]}`);
  }
  console.log(`  noise floor for medians: ${s.globalNoiseFloorMs.toFixed(3)} ms (single-sample p95: ${s.globalSampleFloorMs.toFixed(2)} ms)`);
  if (s.typicalActionMs) console.log(`  typical click cost on a quiet page: ${s.typicalActionMs.toFixed(1)} ms`);

  console.log(`\nComposite ranking (weights: ${JSON.stringify(s.weights)})`);
  console.log('  rank strategy             family      total  robust strict  speed  q@max');
  const fmt = (v) => (v === null || v === undefined ? '   -  ' : v.toFixed(2).padStart(6));
  for (const r of s.composite.filter((x) => x.ranked)) {
    console.log(
      `  ${String(r.rank).padStart(4)} ${r.strategyId.padEnd(20)} ${r.family.padEnd(11)}` +
      `${fmt(r.total)} ${fmt(r.robustness)} ${fmt(r.strictness)} ${fmt(r.speed)}` +
      `  ${r.speedMs === null ? '-' : r.speedMs.toFixed(3) + 'ms'}${r.speedAtFloor ? ' (at floor)' : ''}`,
    );
  }
  const unranked = s.composite.filter((x) => !x.ranked);
  if (unranked.length) {
    console.log(`\n  Measured but not ranked (fewer than ${MIN_COMPOSITE_COVERAGE} of 4 components):`);
    for (const r of unranked) {
      console.log(
        `       ${r.strategyId.padEnd(20)} ${r.family.padEnd(11)}` +
        `${fmt(r.total)} ${fmt(r.robustness)} ${fmt(r.strictness)} ${fmt(r.speed)}`,
      );
    }
  }
  if (s.slowQueries.length) {
    console.log(`\nQueries at or above ${s.slowThresholdMs} ms: ${s.slowQueries.length}`);
    console.log('  median     depth  nodes    matches  strategy             where');
    for (const q of s.slowQueries.slice(0, 15)) {
      console.log(
        `  ${(q.medianMs / 1000).toFixed(2).padStart(7)}s ${String(q.depth ?? '-').padStart(6)}` +
        ` ${String(q.domNodes).padStart(7)} ${String(q.matches ?? '-').padStart(8)}  ${q.strategyId.padEnd(20)}` +
        ` ${q.route}${q.timedOut ? '  (timeout, not a query cost)' : ''}`,
      );
    }
    if (s.slowDepthProfile.length) {
      console.log('\n  Slow queries by target depth:');
      for (const d of s.slowDepthProfile) {
        console.log(
          `    depth ${String(d.depth).padStart(3)}: ${String(d.count).padStart(3)} case(s),` +
          ` median ${(d.medianMs / 1000).toFixed(2)}s, worst ${(d.maxMs / 1000).toFixed(2)}s` +
          `  [${d.strategies.join(', ')}]`,
        );
      }
    }
  } else {
    console.log(`\nNo query reached ${s.slowThresholdMs} ms.`);
  }

  const layoutHeavy = Object.entries(s.mechanism ?? {})
    .filter(([, m]) => m.forcedLayoutsPerQuery > 0)
    .sort((a, b) => b[1].forcedLayoutsPerQuery - a[1].forcedLayoutsPerQuery);
  if (layoutHeavy.length) {
    console.log('\nForced style-and-layout passes per query (traced, small tier):');
    for (const [id, m] of layoutHeavy) {
      console.log(
        `  ${id.padEnd(20)} ${m.forcedLayoutsPerQuery.toFixed(0).padStart(6)} layouts` +
        ` over ${String(m.matches).padStart(5)} candidates` +
        ` = ${m.layoutsPerCandidate === null ? '-' : m.layoutsPerCandidate.toFixed(2)} per candidate`,
      );
    }
  }

  console.log(`\nWrote ${OUT}`);
}

main();
