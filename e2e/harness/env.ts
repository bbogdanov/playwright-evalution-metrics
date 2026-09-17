import { execSync } from 'node:child_process';
import { cpus, freemem, loadavg, totalmem, platform, release } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RESULTS_DIR, RUN_ID } from './paths';

/**
 * Machine and toolchain fingerprint, written once per run.
 *
 * Timings are only comparable within a fingerprint. Publishing a locator ranking
 * without recording the CPU it was produced on is how benchmarks end up arguing
 * past each other, so every result file is tied to one of these by runId.
 */
export interface RunEnv {
  readonly runId: string;
  readonly startedAt: string;
  readonly node: string;
  readonly platform: string;
  readonly release: string;
  readonly cpuModel: string;
  readonly cpuCount: number;
  readonly loadAvg1: number;
  readonly totalMemMb: number;
  readonly freeMemMb: number;
  readonly playwrightVersion: string;
  readonly browserVersion: string;
  readonly chromiumPath: string;
  readonly headless: boolean;
  readonly gitSha: string;
  readonly gitDirty: boolean;
  /**
   * True when the Chromium binary in use is not the build this Playwright
   * version ships with. Results stay valid for the pair actually exercised, but
   * the pair has to be stated rather than implied.
   */
  readonly browserRevisionMatched: boolean;
  /**
   * The strategy ids this run measured.
   *
   * Two runs are only comparable if they measured the same matrix. Recording it
   * lets the aggregator refuse to merge a run taken before a strategy was added
   * with one taken after, which would otherwise silently produce a ranking over
   * an inconsistent set.
   */
  readonly strategyIds: string[];
  readonly notes: string[];
}

function sh(cmd: string): string {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

export function captureEnv(opts: {
  browserVersion: string;
  playwrightVersion: string;
  chromiumPath: string;
  headless: boolean;
  strategyIds: string[];
  expectedRevision?: string;
  actualRevision?: string;
}): RunEnv {
  const notes: string[] = [];
  const matched = !opts.expectedRevision || opts.expectedRevision === opts.actualRevision;
  if (!matched) {
    notes.push(
      `Chromium build ${opts.actualRevision} in use; this Playwright ships ${opts.expectedRevision}. ` +
        'Results are valid for the pair exercised, not for the default pairing.',
    );
  }

  return {
    runId: RUN_ID,
    startedAt: new Date().toISOString(),
    node: process.version,
    platform: platform(),
    release: release(),
    cpuModel: cpus()[0]?.model ?? 'unknown',
    cpuCount: cpus().length,
    loadAvg1: Number(loadavg()[0].toFixed(2)),
    totalMemMb: Math.round(totalmem() / 1024 / 1024),
    freeMemMb: Math.round(freemem() / 1024 / 1024),
    playwrightVersion: opts.playwrightVersion,
    browserVersion: opts.browserVersion,
    chromiumPath: opts.chromiumPath,
    headless: opts.headless,
    gitSha: sh('git rev-parse --short HEAD'),
    gitDirty: sh('git status --porcelain').length > 0,
    browserRevisionMatched: matched,
    strategyIds: [...opts.strategyIds].sort(),
    notes,
  };
}

export function writeEnv(env: RunEnv): void {
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(join(RESULTS_DIR, `env-${env.runId}.json`), JSON.stringify(env, null, 2));
}
