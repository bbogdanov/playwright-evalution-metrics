/**
 * Renders results/summary.json into a single self-contained HTML dashboard.
 *
 * No CDN, no build step, no network: the page has to open from disk on a machine
 * that has never seen this project, otherwise the results are not portable.
 *
 * Presentation data that is not a measurement — the literal call each strategy
 * makes, and where the full reference lives — is merged in here rather than
 * baked into summary.json, so the page can gain it without re-running a
 * 45-minute benchmark.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { renderHtml } from './dashboard-template.mjs';
import { describeStrategies } from './strategy-calls.mjs';
import { blobUrl } from './repo-link.mjs';

const IN = resolve('results/summary.json');
const OUT = resolve(process.env.BM_DASHBOARD ?? 'results/dashboard/index.html');

let summary;
try {
  summary = JSON.parse(readFileSync(IN, 'utf8'));
} catch {
  console.error(`No summary at ${IN}. Run: npm run analyze`);
  process.exit(1);
}

summary.strategies = describeStrategies();
summary.referenceUrl = blobUrl('docs/LOCATOR-REFERENCE.md');

// The matrix page, when it has been generated. Relative, like the run report:
// both are published side by side with this file.
summary.accessibilityPage = existsSync(resolve(dirname(OUT), 'accessibility.html'))
  ? 'accessibility.html'
  : null;

// Playwright's own run report, when the suite has produced one. Relative, so the
// link works both from disk and from the published site.
summary.playwrightReport = existsSync(resolve(dirname(OUT), 'playwright-report/index.html'))
  ? 'playwright-report/index.html'
  : null;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, renderHtml(summary));
console.log(
  `Wrote ${OUT} (${(readFileSync(OUT).length / 1024).toFixed(0)} kB, ` +
  `${summary.strategies.length} strategy definitions, reference ${summary.referenceUrl ? 'linked' : 'not linked'}, ` +
  `run report ${summary.playwrightReport ? 'linked' : 'absent'}, ` +
  `matrix page ${summary.accessibilityPage ? 'linked' : 'absent'})`,
);
