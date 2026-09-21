/**
 * Pulls the DO/DON'T examples out of the scenario that runs them.
 *
 * The published examples have to be the code that actually executed, not a
 * retelling of it. A retelling is where a documented pattern quietly stops
 * matching the suite - the example keeps compiling in a reader's head while the
 * test it came from has moved on.
 *
 * Markers in the spec:
 *
 *   // >>> do: pattern.id
 *   ...code...
 *   // <<<
 *
 * `dont:` marks the counter-example, and `setup:` marks shared context that the
 * examples refer to - the fixture and the page object - so a reader is not left
 * guessing what `grid` is.
 */
import { readFileSync } from 'node:fs';

const OPEN = /^\s*\/\/\s*>>>\s*(do|dont|setup):\s*([\w.-]+)\s*$/;
const CLOSE = /^\s*\/\/\s*<<<\s*$/;

/** Removes the common leading indentation so a snippet reads as its own file. */
function dedent(lines) {
  const indents = lines
    .filter((l) => l.trim())
    .map((l) => l.match(/^\s*/)[0].length);
  const cut = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(cut)).join('\n').trim();
}

/** `{ 'do:pattern.id': 'code' }` for every marked block in the file. */
export function extractSnippets(file) {
  const out = {};
  const lines = readFileSync(file, 'utf8').split('\n');
  let open = null;
  let body = [];

  lines.forEach((line, i) => {
    const start = line.match(OPEN);
    if (start) {
      if (open) throw new Error(`${file}:${i + 1}: '${open}' was never closed`);
      open = `${start[1]}:${start[2]}`;
      body = [];
      return;
    }
    if (CLOSE.test(line)) {
      if (!open) throw new Error(`${file}:${i + 1}: closing marker with nothing open`);
      if (out[open]) throw new Error(`${file}:${i + 1}: '${open}' appears twice`);
      out[open] = dedent(body);
      open = null;
      return;
    }
    if (open) body.push(line);
  });

  if (open) throw new Error(`${file}: '${open}' was never closed`);
  return out;
}

/**
 * Both snippets for every pattern, or a listing of what is missing.
 *
 * Fails loudly rather than rendering a pattern with an empty example: a page
 * that silently drops half a comparison is worse than a build that stops.
 */
export function snippetsFor(file, patterns) {
  const found = extractSnippets(file);
  const missing = [];
  const pairs = {};
  for (const p of patterns) {
    const good = found[`do:${p.id}`];
    const bad = found[`dont:${p.id}`];
    if (!good || !bad) missing.push(`${p.id} (${!good ? 'do' : ''}${!good && !bad ? ' and ' : ''}${!bad ? 'dont' : ''})`);
    pairs[p.id] = { do: good ?? '', dont: bad ?? '' };
  }
  const setup = Object.fromEntries(
    Object.entries(found).filter(([k]) => k.startsWith('setup:')).map(([k, v]) => [k.slice(6), v]),
  );
  const extra = Object.keys(found).filter(
    (k) => !k.startsWith('setup:') && !patterns.some((p) => k === `do:${p.id}` || k === `dont:${p.id}`),
  );
  return { pairs, setup, missing, extra };
}
