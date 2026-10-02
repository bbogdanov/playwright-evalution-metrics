/**
 * Builds the Angular application for publishing next to the dashboard, so the
 * pages under test can be opened and inspected in a browser, not just read about.
 *
 *   BM_APP_BASE=/repo-name/app/ node tools/build-pages-app.mjs [dashboard-dir]
 *
 * The build goes to its own output path, never app/dist/app: that directory is
 * what the benchmark serves, and a build with a different base href there would
 * silently break the next local run.
 *
 * GitHub Pages has no rewrite rules, so a reload or a shared link on /app/grid
 * would 404. Every top-level route therefore gets a copy of index.html in its own
 * directory; the router strips the trailing slash Pages redirects to, and the
 * absolute base href keeps the bundles resolving from any depth. The routes are
 * read from app.routes.ts so a new route cannot be forgotten here.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dashboard = resolve(process.argv[2] ?? 'results/dashboard');
const base = process.env.BM_APP_BASE ?? '/app/';
if (!base.startsWith('/') || !base.endsWith('/')) {
  console.error(`BM_APP_BASE must start and end with "/", got "${base}"`);
  process.exit(1);
}

const OUT = resolve('app/dist/pages');
execFileSync(
  'npm',
  ['--prefix', 'app', 'run', 'build', '--', '--configuration', 'production', `--base-href=${base}`, `--output-path=${OUT}`],
  { stdio: 'inherit' },
);

const browser = join(OUT, 'browser');
if (!existsSync(join(browser, 'index.html'))) {
  console.error(`No index.html in ${browser}`);
  process.exit(1);
}

const target = join(dashboard, 'app');
rmSync(target, { recursive: true, force: true });
cpSync(browser, target, { recursive: true });

const routes = [...new Set([...readFileSync('app/src/app/app.routes.ts', 'utf8').matchAll(/path:\s*'([a-z0-9-]+)'/g)].map((m) => m[1]))];
for (const r of routes) {
  mkdirSync(join(target, r), { recursive: true });
  cpSync(join(target, 'index.html'), join(target, r, 'index.html'));
}

console.log(`Copied app to ${target} (base ${base}, route entries: ${routes.join(', ')})`);
