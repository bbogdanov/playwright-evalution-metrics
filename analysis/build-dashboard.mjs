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
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { renderHtml } from './dashboard-template.mjs';
import { describeStrategies } from './strategy-calls.mjs';
import { blobUrl } from './repo-link.mjs';
import { siteNav } from './page-shell.mjs';

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

// Links to the sibling pages and the run report live in the shared site bar,
// which links each one only when its file exists next to this page.
const nav = siteNav('results', dirname(OUT));
const linked = [...nav.split('</nav>')[0].matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => h !== '#main');

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, renderHtml(summary, nav));
console.log(
  `Wrote ${OUT} (${(readFileSync(OUT).length / 1024).toFixed(0)} kB, ` +
  `${summary.strategies.length} strategy definitions, reference ${summary.referenceUrl ? 'linked' : 'not linked'}, ` +
  `site bar: ${linked.join(', ')})`,
);
