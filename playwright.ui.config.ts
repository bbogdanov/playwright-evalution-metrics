import { defineConfig } from '@playwright/test';
import { CHROMIUM_PATH } from './e2e/harness/browser';
import { BASE_URL } from './e2e/harness/paths';

/**
 * Functional tests for the ?ui=rich showcase. Not a benchmark: nothing here is
 * timed, so it runs in parallel with retries off and a list reporter. It has its
 * own config because the benchmark's global setup records a run fingerprint and
 * its HTML reporter writes into the published run report.
 */
export default defineConfig({
  testDir: './e2e/ui',
  fullyParallel: true,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    testIdAttribute: 'data-testid',
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
    launchOptions: CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {},
  },
  webServer: {
    command: 'node tools/static-server.mjs',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
