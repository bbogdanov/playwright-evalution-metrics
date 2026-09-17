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
 *    is precisely the thing being measured. It is on for macro scenarios, where
 *    the trace is the data source rather than an observer effect.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/harness/global-setup.ts',
  timeout: 25 * 60 * 1000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],

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
      use: { trace: 'on', video: 'off', screenshot: 'off' },
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
