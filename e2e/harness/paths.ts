import { resolve } from 'node:path';

/**
 * One run id per `playwright test` invocation, shared across workers through the
 * environment so that every worker's records land in the same logical run.
 */
export const RUN_ID =
  process.env.BM_RUN_ID ??
  (process.env.BM_RUN_ID = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14));

export const RESULTS_DIR = resolve(process.env.BM_RESULTS_DIR ?? 'results/raw');

/**
 * S15 (depth 50 at ~5,000 elements) keeps a raw stream of its own.
 *
 * `npm run analyze` rebuilds summary.json from the newest run in results/raw, so a
 * ten-minute S15 run landing there would quietly replace the summary of the full
 * benchmark with one that measured none of it. Its records go beside it instead,
 * and feed their own summary and page. BM_RESULTS_DIR still overrides both.
 */
export const DEEP_RESULTS_DIR = resolve(process.env.BM_RESULTS_DIR ?? 'results/deep-raw');

const OWN_STREAM = new Set(['S15']);

export function resultsDirFor(scenario: string): string {
  return OWN_STREAM.has(scenario) ? DEEP_RESULTS_DIR : RESULTS_DIR;
}

export const BASE_URL = process.env.BM_BASE_URL ?? 'http://127.0.0.1:4300';
