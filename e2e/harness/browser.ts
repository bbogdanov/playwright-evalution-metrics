import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Resolves the Chromium binary to run against.
 *
 * This environment ships a pre-installed Chromium whose build number does not
 * match the one this Playwright version expects, and browser downloads are
 * disabled. Pointing at the installed binary is correct here, but it makes the
 * browser build an explicit part of the run fingerprint rather than an implicit
 * one — see RunEnv.browserRevisionMatched.
 */
function discover(): string {
  if (process.env.BM_CHROMIUM) return process.env.BM_CHROMIUM;

  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base || !existsSync(base)) return '';

  const dirs = readdirSync(base)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));

  for (const d of dirs) {
    const candidate = join(base, d, 'chrome-linux', 'chrome');
    if (existsSync(candidate)) return candidate;
  }
  return '';
}

export const CHROMIUM_PATH = discover();
