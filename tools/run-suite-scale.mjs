/**
 * Drives S11: runs the same realistic flow once per strategy and records how long
 * the whole thing took.
 *
 * Separate process per strategy on purpose. Running them in one process would
 * share a browser, a page cache and a warmed JIT, and the later strategies would
 * inherit an advantage that has nothing to do with locators.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const STRATEGIES = (process.env.BM_SUITE_STRATEGIES ??
  'testid.api,id.css,class.semantic.nth,css.chain.full,xpath.absolute,role.name,text.exact,filter.hasText,scoped.role'
).split(',');

const RESULTS = resolve(process.env.BM_RESULTS_DIR ?? 'results/raw');
const RUN_ID = process.env.BM_RUN_ID ?? new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

mkdirSync(RESULTS, { recursive: true });
const out = resolve(RESULTS, `${RUN_ID}-suite.ndjson`);

console.log(`S11 suite scale: ${STRATEGIES.length} strategies, one process each`);

for (const strategy of STRATEGIES) {
  const started = Date.now();
  const r = spawnSync(
    'npx',
    ['playwright', 'test', '--config=playwright.config.ts', '--project=suite', '--reporter=dot'],
    {
      stdio: 'inherit',
      env: { ...process.env, BM_SUITE_STRATEGY: strategy, BM_RUN_ID: RUN_ID },
    },
  );
  const wallMs = Date.now() - started;

  appendFileSync(out, JSON.stringify({
    runId: RUN_ID,
    ts: new Date().toISOString(),
    scenario: 'S11',
    title: 'suite wall clock',
    route: 'grid',
    url: '/grid',
    domNodes: 0,
    renderMs: null,
    strategyId: strategy,
    family: 'suite',
    metric: 'suite_wall_ms',
    reps: 1,
    warmup: 0,
    matches: null,
    // Includes Playwright startup and browser launch, which is what a CI minute
    // actually consists of.
    samples: [wallMs],
    baseline: null,
    ok: r.status === 0,
    error: r.status === 0 ? null : `exit ${r.status}`,
    dims: { includesStartup: true, exitCode: r.status },
  }) + '\n');

  console.log(`  ${strategy.padEnd(22)} ${(wallMs / 1000).toFixed(1)}s ${r.status === 0 ? '' : '(FAILED)'}`);
}

console.log(`Wrote ${out}`);
