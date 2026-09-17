import { test as base, type Locator, type Page, type TestInfo } from '@playwright/test';
import { emit, makeRecord, type BenchRecord } from './record';
import {
  countDomNodes, measureInPageFloor, measureMechanism, measureNoiseFloor, measurePaired,
  type MeasureOptions,
} from './measure';
import { describeTarget, type TargetDescriptor } from '../locators/describe';
import type { Root, Strategy } from '../locators/strategies';

export interface PageState {
  readonly url: string;
  readonly route: string;
  /** Element count including open shadow roots. */
  readonly domNodes: number;
  /** Time the app itself took to render, as reported by the app. */
  readonly renderMs: number | null;
}

export type Dims = Record<string, string | number | boolean>;

/**
 * Per-test benchmark API.
 *
 * Holds the current page state so that every emitted record automatically carries
 * the DOM size and route it was taken against. A measurement that cannot be tied
 * back to the exact page shape is not evidence of anything.
 */
export class Bench {
  private state: PageState | null = null;

  constructor(
    readonly page: Page,
    private readonly info: TestInfo,
    readonly scenario: string,
  ) {}

  get pageState(): PageState {
    if (!this.state) throw new Error('Bench.goto() must run before any measurement');
    return this.state;
  }

  /**
   * Navigates and blocks until the app reports its render has flushed.
   *
   * `waitUntil: 'commit'` then waiting on the app's own readiness token, rather
   * than 'load' or 'networkidle': on a 40,000-node page the network is idle long
   * before the DOM exists, and measuring against a partial DOM is worse than not
   * measuring at all.
   */
  async goto(route: string, params: Record<string, string | number | boolean> = {}): Promise<PageState> {
    const qs = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)]),
    ).toString();
    const url = `/${route}${qs ? `?${qs}` : ''}`;

    await this.page.goto(url, { waitUntil: 'commit' });
    await this.page.waitForSelector('html[data-bm-ready]', { timeout: 120_000 });

    const renderRaw = await this.page.getAttribute('html', 'data-bm-render-ms');
    this.state = {
      url,
      route,
      domNodes: await countDomNodes(this.page),
      renderMs: renderRaw === null ? null : Number(renderRaw),
    };
    return this.state;
  }

  /** Re-reads DOM size after a page mutation that changed it. */
  async refreshDomSize(): Promise<void> {
    if (this.state) {
      this.state = { ...this.state, domNodes: await countDomNodes(this.page) };
    }
  }

  /**
   * Records the measurement floor for the current page, before any strategy runs.
   *
   * This has to be captured per page state rather than once per run: the floor
   * depends on how much work the browser is doing in the background, and a page
   * with 40,000 nodes is not as quiet as one with 200.
   */
  async measureNoiseFloor(dims: Dims, reps = 200): Promise<number[]> {
    const { deltas, samples } = await measureNoiseFloor(this.page, reps);
    this.emitRaw({
      strategyId: 'baseline.self', family: 'identity', metric: 'noise_floor_ms',
      dims, samples: deltas, matches: 1,
    });
    this.emitRaw({
      strategyId: 'baseline.self', family: 'identity', metric: 'round_trip_ms',
      dims, samples, matches: 1,
    });
    return deltas;
  }

  describe(domId: string): Promise<TargetDescriptor> {
    return describeTarget(this.page, domId);
  }

  /**
   * Measures one strategy against one target and writes the raw samples.
   *
   * Match count is recorded alongside the timing because a fast locator that
   * resolves to 400 elements has not done the job, and a ranking that ignores
   * that is measuring the wrong thing.
   */
  async measureStrategy(args: {
    strategy: Strategy;
    target: TargetDescriptor;
    dims: Dims;
    root?: Root;
    options?: MeasureOptions;
    metric?: string;
  }): Promise<{ matches: number; net: number[] } | null> {
    const { strategy, target } = args;
    const root: Root = args.root ?? this.page;
    const metric = args.metric ?? 'net_query_ms';

    // Where the target sits travels with every record, so a slow query can be
    // correlated with its target's depth and not just with the page's size.
    const dims: Dims = {
      ...args.dims,
      targetDepth: target.depth,
      targetSiblings: target.siblingCount,
      shadowHops: target.shadowHops,
      ancestorTags: target.ancestorTags,
    };

    let locator: Locator;
    try {
      locator = strategy.build(root, target);
    } catch (e) {
      this.emitFailure(strategy, metric, dims, (e as Error).message);
      return null;
    }

    let matches: number;
    try {
      matches = await locator.count();
    } catch (e) {
      this.emitFailure(strategy, metric, dims, (e as Error).message);
      return null;
    }

    // A locator matching nothing has no meaningful query cost to report, and
    // averaging its "fast" failure in with real resolutions would flatter it.
    if (matches === 0) {
      this.emit({
        strategy, metric, dims, matches, samples: [], baseline: null,
        ok: false, error: 'no match',
      });
      return { matches, net: [] };
    }

    const paired = await measurePaired(this.page, locator, args.options);
    this.emit({
      strategy, metric,
      // budgetLimited and probeMs travel with the record so the analysis can see
      // which cells were sampled lightly, and why.
      dims: {
        ...dims,
        budgetLimited: paired.budgetLimited,
        probeOnly: paired.probeOnly,
        probeMs: paired.probeMs,
      },
      matches,
      samples: paired.samples, baseline: paired.baseline,
      ok: true, error: null,
      reps: paired.samples.length,
      warmup: args.options?.warmup ?? 8,
    });
    return { matches, net: paired.net };
  }

  /**
   * Records what work a query causes the browser to do, rather than how long it
   * takes.
   *
   * Deliberately run on a small tier: the evidence is the per-candidate event
   * count, which is a property of the engine and does not depend on machine speed
   * or page size. Tracing also perturbs timing, so nothing here feeds the timing
   * analysis.
   */
  async measureMechanism(
    strategy: Strategy,
    target: TargetDescriptor,
    dims: Dims,
    queries = 10,
  ): Promise<void> {
    let locator: Locator;
    try {
      locator = strategy.build(this.page, target);
    } catch {
      return;
    }
    const profile = await measureMechanism(this.page, locator, queries);
    if (!profile) return;

    this.emitRaw({
      strategyId: strategy.id,
      family: strategy.family,
      metric: 'mechanism',
      samples: [profile.forcedLayoutsPerQuery],
      matches: profile.matches,
      target,
      dims: {
        ...dims,
        queries: profile.queries,
        forcedLayoutsPerQuery: profile.forcedLayoutsPerQuery,
        layoutsPerCandidate: profile.layoutsPerCandidate ?? -1,
        gcMsPerQuery: profile.gcMsPerQuery,
        taskMsPerQuery: profile.taskMsPerQuery,
        topEvents: profile.topEvents
          .map((e) => `${e.name}:${e.countPerQuery.toFixed(1)}x/${e.msPerQuery.toFixed(2)}ms`)
          .join(' | '),
      },
    });
  }

  /** Native-DOM floor for a strategy, where one exists. */
  async measureFloor(strategy: Strategy, target: TargetDescriptor, dims: Dims): Promise<void> {
    const floor = strategy.floor?.(target);
    if (!floor) return;
    const { perOpMs, matches } = await measureInPageFloor(this.page, floor.kind, floor.selector);
    this.emit({
      strategy, metric: 'in_page_floor_ms',
      dims: { ...dims, targetDepth: target.depth },
      matches,
      samples: [perOpMs], baseline: null, ok: true, error: null, reps: 1, warmup: 0,
    });
  }

  /**
   * Emits an arbitrary measurement that does not come from the strategy matrix.
   *
   * Pass `target` whenever one is in play. Without it the record has no depth,
   * and a slow action shows up in the slow-query report with its location blank -
   * which is exactly the question the report exists to answer.
   */
  emitRaw(partial: {
    strategyId: string;
    family: string;
    metric: string;
    dims: Dims;
    samples: number[];
    matches?: number | null;
    ok?: boolean;
    error?: string | null;
    reps?: number;
    target?: TargetDescriptor;
  }): void {
    const s = this.pageState;
    const dims: Dims = partial.target
      ? {
          ...partial.dims,
          targetDepth: partial.target.depth,
          targetSiblings: partial.target.siblingCount,
          shadowHops: partial.target.shadowHops,
          ancestorTags: partial.target.ancestorTags,
        }
      : partial.dims;
    emit(
      makeRecord({
        scenario: this.scenario,
        title: this.info.title,
        route: s.route,
        url: s.url,
        domNodes: s.domNodes,
        renderMs: s.renderMs,
        strategyId: partial.strategyId,
        family: partial.family,
        metric: partial.metric,
        reps: partial.reps ?? partial.samples.length,
        warmup: 0,
        matches: partial.matches ?? null,
        samples: partial.samples,
        baseline: null,
        ok: partial.ok ?? true,
        error: partial.error ?? null,
        dims,
      }) as BenchRecord,
    );
  }

  private emit(args: {
    strategy: Strategy;
    metric: string;
    dims: Dims;
    matches: number | null;
    samples: number[];
    baseline: number[] | null;
    ok: boolean;
    error: string | null;
    reps?: number;
    warmup?: number;
  }): void {
    const s = this.pageState;
    emit(
      makeRecord({
        scenario: this.scenario,
        title: this.info.title,
        route: s.route,
        url: s.url,
        domNodes: s.domNodes,
        renderMs: s.renderMs,
        strategyId: args.strategy.id,
        family: args.strategy.family,
        metric: args.metric,
        reps: args.reps ?? args.samples.length,
        warmup: args.warmup ?? 0,
        matches: args.matches,
        samples: args.samples,
        baseline: args.baseline,
        ok: args.ok,
        error: args.error,
        dims: args.dims,
      }) as BenchRecord,
    );
  }

  private emitFailure(strategy: Strategy, metric: string, dims: Dims, message: string): void {
    this.emit({
      strategy, metric, dims, matches: null, samples: [], baseline: null,
      ok: false, error: message.split('\n')[0],
    });
  }
}

export const test = base.extend<{ bench: Bench; scenario: string }>({
  scenario: ['S0', { option: true }],
  bench: async ({ page, scenario }, use, testInfo) => {
    await use(new Bench(page, testInfo, scenario));
  },
});

export { expect } from '@playwright/test';
