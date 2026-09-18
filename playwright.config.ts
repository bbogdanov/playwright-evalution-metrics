import { defineConfig } from '@playwright/test';
import { CHROMIUM_PATH } from './e2e/harness/browser';
import { BASE_URL } from './e2e/harness/paths';

/**
 * Benchmark configuration.
 *
 * Almost every choice here exists to protect measurement validity rather than to
 * make tests convenient:
 *
 *  - workers: 1 everywhere except the deliberate scale project. Parallel workers
 *    share CPU, and CPU contention is indistinguishable from a slow locator.
 *  - fullyParallel: false, for the same reason.
 *  - retries: 0. A retried timing sample is a timing sample taken under different
 *    conditions, and silently averaging it in would be dishonest.
 *  - trace: off for micro benchmarks. Tracing instruments every API call, which
 *    is precisely the thing being measured. Macro scenarios keep it only on
 *    failure: an earlier revision recorded traces for every macro test on the
 *    theory that they would be parsed for timings, nothing ever parsed them, and
 *    the habit cost 128MB of artefacts per run for no reader. Mechanism data
 *    comes from a CDP Chrome trace instead, which is a different mechanism.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/harness/global-setup.ts',
  // Generous on purpose. The largest DOM tier measures 31 strategies twice, and
  // the pathological ones cost minutes per single probe - chained.locator alone
  // has been observed at 158s for one query at 120k elements. A timeout tuned to
  // one machine turns a slower runner into a failed run rather than a slow one.
  timeout: 45 * 60 * 1000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [
    ['list'],
    // Playwright's own report, written inside the published site so it ships with
    // the dashboard rather than living only on whoever ran the suite.
    ['html', { outputFolder: 'results/dashboard/playwright-report', open: 'never' }],
  ],

  use: {
    baseURL: BASE_URL,
    // The app stamps data-testid; getByTestId must agree or the identity family
    // would be measuring a locator that matches nothing.
    testIdAttribute: 'data-testid',
    headless: process.env.BM_HEADED !== '1',
    viewport: { width: 1280, height: 900 },
    // Deterministic rendering: no device scale surprises, no animation jitter
    // beyond the animation a scenario deliberately introduces.
    deviceScaleFactor: 1,
    launchOptions: {
      ...(CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {}),
      args: [
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-background-timer-throttling',
      ],
    },
  },

  projects: [
    {
      name: 'micro',
      testDir: './e2e/micro',
      use: { trace: 'off', video: 'off', screenshot: 'off' },
    },
    {
      name: 'macro',
      testDir: './e2e/macro',
      use: { trace: 'retain-on-failure', video: 'off', screenshot: 'off' },
    },
    {
      // Driven one strategy per process by tools/run-suite-scale.mjs; sharing a
      // process would hand later strategies a warmed JIT and browser cache.
      name: 'suite',
      testDir: './e2e/suite',
      use: { trace: 'off', video: 'off', screenshot: 'off' },
    },
    {
      name: 'robustness',
      testDir: './e2e/robustness',
      use: { trace: 'off', video: 'off', screenshot: 'off' },
    },
  ],

  webServer: {
    command: 'node tools/static-server.mjs',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
