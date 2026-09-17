import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { captureEnv, writeEnv } from './env';
import { CHROMIUM_PATH } from './browser';
import { STRATEGIES } from '../locators/strategies';

/**
 * Runs once per benchmark invocation.
 *
 * Builds the app if it is missing, then records the machine and toolchain
 * fingerprint. Capturing the browser version here rather than per test means
 * every record in the run is tied to one verified environment.
 */
export default async function globalSetup(): Promise<void> {
  const dist = resolve('app/dist/app/browser');
  if (!existsSync(dist)) {
    console.log('[setup] no production build found, building...');
    execSync('npm --prefix app run build -- --configuration production', { stdio: 'inherit' });
  }

  const browser = await chromium.launch(
    CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {},
  );
  const browserVersion = browser.version();
  await browser.close();

  const pw = JSON.parse(
    execSync('node -p "JSON.stringify(require(\'@playwright/test/package.json\'))"').toString(),
  ) as { version: string };

  const expected = expectedChromiumRevision();
  const actual = CHROMIUM_PATH.match(/chromium[-_a-z]*-(\d+)/)?.[1] ?? '';

  const env = captureEnv({
    browserVersion,
    playwrightVersion: pw.version,
    chromiumPath: CHROMIUM_PATH || '(playwright default)',
    headless: process.env.BM_HEADED !== '1',
    strategyIds: STRATEGIES.map((s) => s.id),
    expectedRevision: expected,
    actualRevision: actual || expected,
  });

  writeEnv(env);
  console.log(
    `[setup] run ${env.runId} | ${env.cpuModel} x${env.cpuCount} | pw ${env.playwrightVersion} | ${env.browserVersion}` +
      ` | ${env.strategyIds.length} strategies` +
      (env.browserRevisionMatched ? '' : `\n[setup] WARNING: ${env.notes[0]}`),
  );
}

function expectedChromiumRevision(): string {
  // browsers.json is not declared in playwright-core's exports map, so it has to
  // be read off disk rather than required.
  try {
    const path = resolve('node_modules/playwright-core/browsers.json');
    if (!existsSync(path)) return '';
    const browsers = JSON.parse(readFileSync(path, 'utf8')) as {
      browsers: Array<{ name: string; revision: string }>;
    };
    return browsers.browsers.find((b) => b.name === 'chromium')?.revision ?? '';
  } catch {
    return '';
  }
}
