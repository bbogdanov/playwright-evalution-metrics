/**
 * Links from a generated page back to the committed source it was built from.
 *
 * Derived from the git remote so a fork points at its own copy. The branch comes
 * from the upstream tracking ref rather than the local branch name: a local
 * branch that was never pushed would produce a link that 404s.
 *
 * Returns null when there is no GitHub remote, and every caller is expected to
 * degrade to "no link" rather than emitting a broken one.
 */
import { execSync } from 'node:child_process';

const git = (cmd) => {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
};

/** `https://github.com/<slug>/blob/<branch>/<path>`, or null. */
export function blobUrl(path) {
  const remote = git('git config --get remote.origin.url');
  const slug = remote.match(/github\.com[:/](.+?)(?:\.git)?$/)?.[1];
  if (!slug) return null;
  const upstream = git('git rev-parse --abbrev-ref --symbolic-full-name @{u}');
  const branch = upstream.replace(/^[^/]+\//, '') || 'main';
  return `https://github.com/${slug}/blob/${branch}/${path}`;
}
