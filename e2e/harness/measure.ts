import type { Locator, Page } from '@playwright/test';

/**
 * Timing primitives.
 *
 * The central problem this file solves: a CDP round trip costs roughly as much
 * as a simple selector query, so naively timing `locator.count()` mostly measures
 * the transport. Every measurement here is therefore paired against a trivial
 * locator executed immediately before it, and the two are subtracted per
 * repetition. Pairing rather than measuring a baseline once also cancels drift
 * from CPU frequency scaling and background load over the life of a test.
 */

export interface Paired {
  /** Raw cost of the locator under test, per repetition, in milliseconds. */
  readonly samples: number[];
  /** Cost of the trivial locator measured immediately before each sample. */
  readonly baseline: number[];
  /** samples[i] - baseline[i], floored at zero. */
  readonly net: number[];
  /** Cost of the probe repetition that set the repetition count. */
  readonly probeMs: number;
  /** True when the time budget, not the requested count, decided `reps`. */
  readonly budgetLimited: boolean;
  /** True when the single probe repetition is the entire sample. */
  readonly probeOnly: boolean;
}

const nowMs = () => Number(process.hrtime.bigint()) / 1e6;

/** The cheapest possible locator: one match, native-simple selector, no filtering. */
export const BASELINE_SELECTOR = 'html';

export interface MeasureOptions {
  /** Upper bound on repetitions. The time budget may reduce it. */
  /** Upper bound on recorded samples; never above MAX_SAMPLES. */
  readonly reps?: number;
  /**
   * The caller already executed the locator once (to count its matches), which
   * did the warm-up's job. The warm-up is skipped so the total stays at MAX_RUNS.
   */
  readonly warmedUp?: boolean;
  /** Work performed per repetition. `count` resolves every match. */
  readonly op?: 'count' | 'resolveFirst';
  /**
   * Wall-clock budget for the sampled phase, in milliseconds.
   *
   * Strategy costs in this study span five orders of magnitude: a query taking
   * 0.01ms and one taking 5,000ms are both in the matrix. A fixed repetition
   * count would either starve the cheap cells of samples or spend twenty minutes
   * on a single expensive one.
   *
   * The budget resolves that rather than truncating the matrix. A probe
   * repetition estimates per-call cost, and the repetition count is chosen to fit
   * the budget, floored at MIN_REPS. The trade-off is self-correcting: the cells
   * that end up with fewest samples are the ones whose effect is so large that
   * more sampling could not change the conclusion, and the recorded `reps` lets
   * the analysis weight them accordingly.
   */
  readonly budgetMs?: number;
  /**
   * Above this probe cost, the probe itself becomes the only sample.
   *
   * A query that takes ten seconds does not need five repetitions to establish
   * that it is catastrophic; sampling it properly would cost more wall clock than
   * the rest of the matrix combined. The record is flagged `probeOnly` so the
   * analysis reports it as a single observation with no dispersion, rather than
   * quietly presenting n=1 as if it were n=30.
   */
  readonly probeOnlyAboveMs?: number;
}

/**
 * The most times any one operation runs per measurement on a static page,
 * counting the probe and warm-up as well as the recorded samples.
 *
 * The pages measured here do not change between repetitions, so repeating the
 * same query hundreds of times re-measures the same thing and buys nothing but
 * wall clock. Ten executions give a median of eight; the cost is a wider noise
 * floor, which the analysis reports rather than hides. The one exception is a
 * page whose content changes asynchronously while it is measured (S3 churn),
 * where each repetition genuinely observes a different DOM.
 */
export const MAX_RUNS = 10;

/** Probe and warm-up executions that precede the samples inside MAX_RUNS. */
const PROBE_RUNS = 1;
const WARMUP_RUNS = 1;

/** Recorded samples per paired measurement: what is left of MAX_RUNS. */
export const MAX_SAMPLES = MAX_RUNS - PROBE_RUNS - WARMUP_RUNS;

/** Below this, a median is not worth reporting at all. */
export const MIN_REPS = 5;

async function runOp(locator: Locator, op: 'count' | 'resolveFirst'): Promise<number> {
  if (op === 'count') return locator.count();
  // Resolve to a single handle and touch it, which is what an action's first
  // phase does. Returns 1 so the two ops have the same return shape.
  await locator.first().evaluate(() => 0);
  return 1;
}

/**
 * Paired, interleaved measurement of a locator against the baseline locator.
 *
 * Warm-up repetitions are discarded: the first query against a page pays for
 * Playwright injecting its selector engine bundle into the frame, and including
 * that would make whichever strategy ran first look catastrophically slow.
 */
export async function measurePaired(
  page: Page,
  locator: Locator,
  options: MeasureOptions = {},
): Promise<Paired> {
  const maxReps = Math.min(options.reps ?? MAX_SAMPLES, MAX_SAMPLES);
  const op = options.op ?? 'count';
  const budgetMs = options.budgetMs ?? 5_000;
  const baselineLocator = page.locator(BASELINE_SELECTOR);

  // Probe once to find the scale of cost involved. This first call also absorbs
  // Playwright injecting its selector engine into the frame, which would
  // otherwise land entirely on whichever strategy ran first.
  const probeBaseStart = nowMs();
  await baselineLocator.count();
  const probeBaseMs = nowMs() - probeBaseStart;
  const probeStart = nowMs();
  await runOp(locator, op);
  const probeMs = nowMs() - probeStart;

  if (probeMs > (options.probeOnlyAboveMs ?? 10_000)) {
    return {
      samples: [probeMs],
      baseline: [probeBaseMs],
      net: [Math.max(0, probeMs - probeBaseMs)],
      probeMs,
      budgetLimited: true,
      probeOnly: true,
    };
  }

  for (let i = 0; i < (options.warmedUp ? 0 : WARMUP_RUNS); i++) {
    await baselineLocator.count();
    await runOp(locator, op);
  }

  // The budget can only lower the count, never raise it above MAX_SAMPLES.
  const reps = Math.min(
    maxReps,
    Math.max(MIN_REPS, Math.floor(budgetMs / Math.max(probeMs, 0.05))),
  );

  const samples: number[] = [];
  const baseline: number[] = [];
  for (let i = 0; i < reps; i++) {
    const b0 = nowMs();
    await baselineLocator.count();
    const b1 = nowMs();
    await runOp(locator, op);
    const t1 = nowMs();
    baseline.push(b1 - b0);
    samples.push(t1 - b1);
  }

  return {
    samples,
    baseline,
    net: samples.map((s, i) => Math.max(0, s - baseline[i])),
    probeMs,
    budgetLimited: reps < maxReps,
    probeOnly: false,
  };
}

/** Chrome rounds performance.now() to 0.1ms on a page that is not cross-origin isolated. */
export const TIMER_RESOLUTION_MS = 0.1;

/**
 * A batch shorter than this many timer ticks is rounding error, not a measurement:
 * at ten ticks the reading can be off by 10%.
 */
const MIN_FLOOR_TICKS = 10;

/**
 * In-page cost of the closest native equivalent, with no Playwright involved.
 *
 * This establishes the floor. The gap between it and the paired measurement is
 * what Playwright's engine actually costs, which is a more useful number than
 * either figure alone — and for getByRole there is no native equivalent at all,
 * which is itself the explanation for that strategy's numbers.
 *
 * The MAX_RUNS repetitions run inside a single evaluate and are timed as one
 * batch. Chrome rounds performance.now() to 0.1ms, so a lookup that costs a few
 * microseconds finishes ten runs inside one tick. Such a batch returns perOpMs
 * null rather than a number that is mostly rounding: the honest answer is that
 * the native cost is below what this page's clock can resolve.
 */
export async function measureInPageFloor(
  page: Page,
  kind: 'id' | 'attr' | 'class' | 'css-chain' | 'xpath' | 'text-scan',
  selector: string,
  reps = MAX_RUNS,
): Promise<{ perOpMs: number | null; totalMs: number; matches: number }> {
  return page.evaluate(
    ({ kind, selector, reps }) => {
      const run = (): number => {
        switch (kind) {
          case 'id':
            return document.getElementById(selector) ? 1 : 0;
          case 'attr':
          case 'class':
          case 'css-chain':
            return document.querySelectorAll(selector).length;
          case 'xpath': {
            const r = document.evaluate(
              selector, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null,
            );
            return r.snapshotLength;
          }
          case 'text-scan': {
            // Approximates what a text engine must do: walk text nodes and
            // normalise whitespace. No native API does this.
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            let hits = 0;
            let node: Node | null;
            while ((node = walker.nextNode())) {
              if ((node.nodeValue ?? '').replace(/\s+/g, ' ').trim() === selector) hits++;
            }
            return hits;
          }
        }
      };

      // The first run doubles as the warm-up and the match count.
      const matches = run();
      const t0 = performance.now();
      for (let i = 1; i < reps; i++) run();
      const totalMs = performance.now() - t0;
      return { totalMs, matches, runs: reps - 1 };
    },
    { kind, selector, reps },
  ).then(({ totalMs, matches, runs }) => ({
    totalMs,
    matches,
    perOpMs: totalMs >= MIN_FLOOR_TICKS * TIMER_RESOLUTION_MS ? totalMs / runs : null,
  }));
}

/**
 * Element count including elements inside open shadow roots.
 *
 * `document.querySelectorAll('*').length` stops at shadow boundaries, which would
 * report the shadow-encapsulation route as ~20 nodes and make its timings look
 * inexplicably good.
 */
export async function countDomNodes(page: Page): Promise<number> {
  return page.evaluate(() => {
    let total = 0;
    const visit = (root: Document | ShadowRoot): void => {
      const all = root.querySelectorAll('*');
      total += all.length;
      for (const el of all) if (el.shadowRoot) visit(el.shadowRoot);
    };
    visit(document);
    return total;
  });
}

/** Wall-clock timing for a single awaited operation, used by the macro scenarios. */
export async function timeOnce<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const t0 = nowMs();
  const value = await fn();
  return { ms: nowMs() - t0, value };
}

/** Wall-clock timing that records the failure instead of propagating it. */
export async function timeOnceSettled(
  fn: () => Promise<unknown>,
): Promise<{ ms: number; ok: boolean; error: string | null }> {
  const t0 = nowMs();
  try {
    await fn();
    return { ms: nowMs() - t0, ok: true, error: null };
  } catch (e) {
    return { ms: nowMs() - t0, ok: false, error: (e as Error).message.split('\n')[0] };
  }
}

/**
 * Measures the floor below which no timing difference can be believed.
 *
 * Runs the trivial locator against itself in the same paired pattern used for
 * real measurements. Whatever spread comes back is pure overhead variance: round
 * trip jitter, GC, scheduler noise. Any median difference between two strategies
 * smaller than this is noise wearing a number's clothing, and the analysis marks
 * it as such no matter how good its p-value looks.
 */
export async function measureNoiseFloor(
  page: Page,
): Promise<{ deltas: number[]; samples: number[] }> {
  const a = page.locator(BASELINE_SELECTOR);
  // One warm-up, then pairs: 1 + 2 x 4 = 9 executions, inside MAX_RUNS.
  const reps = Math.floor((MAX_RUNS - WARMUP_RUNS) / 2);
  for (let i = 0; i < WARMUP_RUNS; i++) await a.count();

  const first: number[] = [];
  const second: number[] = [];
  for (let i = 0; i < reps; i++) {
    const t0 = nowMs();
    await a.count();
    const t1 = nowMs();
    await a.count();
    const t2 = nowMs();
    first.push(t1 - t0);
    second.push(t2 - t1);
  }
  return {
    deltas: second.map((s, i) => s - first[i]),
    samples: [...first, ...second],
  };
}

/**
 * What work a query actually causes the browser to do.
 *
 * The first three layers answer "how long". This one answers "why", which is the
 * difference between a benchmark that ranks things and one that explains them.
 *
 * It records a Chrome trace across N queries and counts the timeline events they
 * produce. Counts are the evidence, not durations: if a `:visible` query emits one
 * forced style-and-layout per candidate element, that is a fact about the engine
 * rather than a story told about a timing curve, and it holds regardless of how
 * fast the machine is.
 *
 * Two things this deliberately does not do. It is not a timing source - tracing
 * perturbs the thing it observes, so it runs on a small tier and a quiet page and
 * its durations are reported as context only. And it is not a replacement for the
 * paired measurement: CDP's Performance.getMetrics was tried first and rejected,
 * because ScriptDuration, LayoutDuration and RecalcStyleDuration never move for
 * work Playwright drives, and the only counter that does move - TaskDuration -
 * includes protocol handling and resolves worse than the paired method it was
 * meant to improve on.
 *
 * Chromium only. Returns null anywhere else rather than pretending.
 */
export interface MechanismProfile {
  readonly queries: number;
  readonly matches: number;
  /** Synchronous style-and-layout passes forced by the query, per query. */
  readonly forcedLayoutsPerQuery: number;
  /** Forced layouts divided by candidates: the per-candidate cost, made explicit. */
  readonly layoutsPerCandidate: number | null;
  readonly gcMsPerQuery: number;
  readonly taskMsPerQuery: number;
  /** The heaviest timeline events by total duration, for anything unanticipated. */
  readonly topEvents: Array<{ name: string; countPerQuery: number; msPerQuery: number }>;
}

const FORCED_LAYOUT_EVENTS = ['Document::UpdateStyleAndLayout', 'Blink.ForcedStyleAndLayout.UpdateTime'];
const GC_EVENTS = ['MinorGC', 'MajorGC', 'V8.GC_SCAVENGER'];

interface TraceEvent {
  readonly name: string;
  readonly ph: string;
  readonly dur?: number;
}

/**
 * Playwright types CDPSession.on for its own 'close' and 'event' channels only,
 * so protocol-specific events need a structural view of the session. Narrow
 * rather than `any`, so the shape stays checked.
 */
interface TracingSession {
  on(event: string, listener: (payload: { value: TraceEvent[] }) => void): unknown;
  off(event: string, listener: (payload: { value: TraceEvent[] }) => void): unknown;
  once(event: string, listener: () => void): unknown;
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
  detach(): Promise<void>;
}

export async function measureMechanism(
  page: Page,
  locator: Locator,
  queries = MAX_RUNS - 2,
): Promise<MechanismProfile | null> {
  let cdp: TracingSession;
  try {
    cdp = (await page.context().newCDPSession(page)) as unknown as TracingSession;
  } catch {
    return null; // not Chromium
  }

  try {
    // The count doubles as the first warm-up; one more, then `queries` traced:
    // 1 + 1 + 8 = MAX_RUNS executions.
    const matches = await locator.count();
    await locator.count();

    const events: TraceEvent[] = [];
    const collect = (e: { value: TraceEvent[] }) => events.push(...e.value);
    cdp.on('Tracing.dataCollected', collect);

    await cdp.send('Tracing.start', {
      traceConfig: {
        includedCategories: ['disabled-by-default-devtools.timeline', 'blink', 'devtools.timeline'],
      },
    });
    for (let i = 0; i < queries; i++) await locator.count();
    const complete = new Promise<void>((resolve) => cdp.once('Tracing.tracingComplete', resolve));
    await cdp.send('Tracing.end');
    await complete;
    cdp.off('Tracing.dataCollected', collect);

    const byName = new Map<string, { count: number; us: number }>();
    for (const e of events) {
      if (e.ph !== 'X' || typeof e.dur !== 'number') continue;
      const entry = byName.get(e.name) ?? { count: 0, us: 0 };
      entry.count++;
      entry.us += e.dur;
      byName.set(e.name, entry);
    }

    const sum = (names: string[], field: 'count' | 'us') =>
      names.reduce((a, n) => a + (byName.get(n)?.[field] ?? 0), 0);

    // Both forced-layout event names describe the same passes, so take the larger
    // rather than adding them and double counting.
    const forcedLayouts = Math.max(
      byName.get(FORCED_LAYOUT_EVENTS[0])?.count ?? 0,
      byName.get(FORCED_LAYOUT_EVENTS[1])?.count ?? 0,
    );

    return {
      queries,
      matches,
      forcedLayoutsPerQuery: forcedLayouts / queries,
      layoutsPerCandidate: matches > 0 ? forcedLayouts / queries / matches : null,
      gcMsPerQuery: sum(GC_EVENTS, 'us') / 1000 / queries,
      taskMsPerQuery: (byName.get('RunTask')?.us ?? 0) / 1000 / queries,
      topEvents: [...byName.entries()]
        .sort((a, b) => b[1].us - a[1].us)
        .slice(0, 6)
        .map(([name, v]) => ({
          name,
          countPerQuery: v.count / queries,
          msPerQuery: v.us / 1000 / queries,
        })),
    };
  } catch {
    return null;
  } finally {
    await cdp.detach().catch(() => {});
  }
}
