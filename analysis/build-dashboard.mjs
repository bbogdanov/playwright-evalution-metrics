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
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { renderHtml } from './dashboard-template.mjs';
import { describeStrategies } from './strategy-calls.mjs';

const IN = resolve('results/summary.json');
const OUT = resolve(process.env.BM_DASHBOARD ?? 'results/dashboard/index.html');

/**
 * URL of the committed locator reference.
 *
 * Derived from the git remote so a fork points at its own copy. The branch comes
 * from the upstream tracking ref rather than the local branch name — a local
 * branch that was never pushed would produce a dead link.
 */
function referenceUrl() {
  const git = (cmd) => {
    try {
      return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      return '';
    }
  };
  const remote = git('git config --get remote.origin.url');
  const slug = remote.match(/github\.com[:/](.+?)(?:\.git)?$/)?.[1];
  if (!slug) return null;
  const upstream = git('git rev-parse --abbrev-ref --symbolic-full-name @{u}');
  const branch = upstream.replace(/^[^/]+\//, '') || 'main';
  return `https://github.com/${slug}/blob/${branch}/docs/LOCATOR-REFERENCE.md`;
}

let summary;
try {
  summary = JSON.parse(readFileSync(IN, 'utf8'));
} catch {
  console.error(`No summary at ${IN}. Run: npm run analyze`);
  process.exit(1);
}

summary.strategies = describeStrategies();
summary.referenceUrl = referenceUrl();

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, renderHtml(summary));
console.log(
  `Wrote ${OUT} (${(readFileSync(OUT).length / 1024).toFixed(0)} kB, ` +
  `${summary.strategies.length} strategy definitions, reference ${summary.referenceUrl ? 'linked' : 'not linked'})`,
);
