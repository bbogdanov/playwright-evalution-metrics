import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { RESULTS_DIR, RUN_ID } from './paths';

/**
 * One measurement. Raw per-repetition samples are kept rather than summary
 * statistics, so the analysis layer can be changed, or disagreed with, without
 * re-running the benchmark.
 */
export interface BenchRecord {
  readonly runId: string;
  readonly ts: string;
  /** Scenario id from the study design: S1..S11. */
  readonly scenario: string;
  readonly title: string;
  readonly route: string;
  readonly url: string;
  /** Element count including elements inside open shadow roots. */
  readonly domNodes: number;
  readonly renderMs: number | null;
  readonly strategyId: string;
  readonly family: string;
  /** What the samples measure: net_query_ms, resolve_ms, action_ms, ... */
  readonly metric: string;
  readonly reps: number;
  readonly warmup: number;
  /** How many elements the locator resolved to. 0 and >1 are both findings. */
  readonly matches: number | null;
  readonly samples: number[];
  /**
   * Paired per-repetition cost of a trivial locator measured immediately before
   * each sample. Subtracting it removes transport and fixed-overhead cost, which
   * on small DOMs is larger than the thing being measured.
   */
  readonly baseline: number[] | null;
  readonly ok: boolean;
  readonly error: string | null;
  /** Scenario-specific dimensions: dom size, depth, hz, mutation, and so on. */
  readonly dims: Record<string, string | number | boolean>;
}

let stream: string | null = null;

function target(): string {
  if (stream) return stream;
  mkdirSync(RESULTS_DIR, { recursive: true });
  const worker = process.env.TEST_WORKER_INDEX ?? '0';
  stream = join(RESULTS_DIR, `${RUN_ID}-w${worker}.ndjson`);
  return stream;
}

/** Append-only, one JSON object per line, one file per worker: no interleaving. */
export function emit(record: BenchRecord): void {
  appendFileSync(target(), JSON.stringify(record) + '\n');
}

export function makeRecord(
  partial: Omit<BenchRecord, 'runId' | 'ts'> & Partial<Pick<BenchRecord, 'runId' | 'ts'>>,
): BenchRecord {
  return { runId: RUN_ID, ts: new Date().toISOString(), ...partial } as BenchRecord;
}
