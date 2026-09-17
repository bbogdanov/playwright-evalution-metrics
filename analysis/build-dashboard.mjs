/**
 * Renders results/summary.json into a single self-contained HTML dashboard.
 *
 * No CDN, no build step, no network: the page has to open from disk on a machine
 * that has never seen this project, otherwise the results are not portable.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { renderHtml } from './dashboard-template.mjs';

const IN = resolve('results/summary.json');
const OUT = resolve(process.env.BM_DASHBOARD ?? 'results/dashboard/index.html');

let summary;
try {
  summary = JSON.parse(readFileSync(IN, 'utf8'));
} catch {
  console.error(`No summary at ${IN}. Run: npm run analyze`);
  process.exit(1);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, renderHtml(summary));
console.log(`Wrote ${OUT} (${(readFileSync(OUT).length / 1024).toFixed(0)} kB)`);
