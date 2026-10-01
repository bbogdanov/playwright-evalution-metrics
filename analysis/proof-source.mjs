/**
 * Locates a block of committed source so a generated page can link to it.
 *
 * `find` is a literal string - usually the start of a test title. The block runs
 * from the first line containing it to the next line at the same indentation
 * that starts with `}`, which is the `});` closing a test or the `}` closing an
 * `if`. Computed from the file on disk, so a link is exactly as right as the
 * commit the page is built from.
 *
 * Throws when `find` is not in the file: a proof link that silently points at
 * nothing is worse than a build that stops and says which one moved.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { blobUrl } from './repo-link.mjs';

const cache = new Map();
const linesOf = (spec) => {
  if (!cache.has(spec)) cache.set(spec, readFileSync(resolve(spec), 'utf8').split('\n'));
  return cache.get(spec);
};

/** `{ start, end }`, 1-based and inclusive. */
export function blockRange(spec, find) {
  const lines = linesOf(spec);
  const i = lines.findIndex((l) => l.includes(find));
  if (i === -1) throw new Error(`${spec}: no line contains ${JSON.stringify(find)}`);
  const indent = lines[i].match(/^\s*/)[0];
  const close = lines.findIndex((l, j) => j > i && l.startsWith(indent + '}'));
  return { start: i + 1, end: close === -1 ? i + 1 : close + 1 };
}

const bases = new Map();

/** What a page needs to show and link one source block. */
export function sourceRef(spec, find) {
  const { start, end } = blockRange(spec, find);
  if (!bases.has(spec)) bases.set(spec, blobUrl(spec));
  const base = bases.get(spec);
  return {
    label: `${spec}:${start}`,
    href: base ? `${base}#L${start}-L${end}` : null,
  };
}
