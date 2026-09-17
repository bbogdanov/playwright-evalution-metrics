import { resolve } from 'node:path';

/**
 * One run id per `playwright test` invocation, shared across workers through the
 * environment so that every worker's records land in the same logical run.
 */
export const RUN_ID =
  process.env.BM_RUN_ID ??
  (process.env.BM_RUN_ID = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14));

export const RESULTS_DIR = resolve(process.env.BM_RESULTS_DIR ?? 'results/raw');
export const BASE_URL = process.env.BM_BASE_URL ?? 'http://127.0.0.1:4300';
