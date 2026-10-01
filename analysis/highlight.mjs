/**
 * Build-time syntax highlighting for the TypeScript snippets on generated pages.
 *
 * A tokenizer rather than a library: the snippets are short, come from one spec
 * file, and only need comments, strings, keywords, numbers, types and calls told
 * apart. Shipping a highlighter to the browser for that would mean a CDN
 * dependency on a page that is otherwise self-contained.
 *
 * Output is escaped HTML with `<span class="tok-*">` around each token; text
 * that is not a recognised token is escaped and left bare. The concatenated
 * text content is always exactly the input, so copying a snippet copies code.
 */

const KEYWORDS = new Set([
  'abstract', 'as', 'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'constructor',
  'continue', 'declare', 'default', 'delete', 'do', 'else', 'enum', 'export', 'extends', 'false',
  'finally', 'for', 'from', 'function', 'get', 'if', 'implements', 'import', 'in', 'instanceof',
  'interface', 'keyof', 'let', 'new', 'null', 'of', 'private', 'protected', 'public', 'readonly',
  'return', 'satisfies', 'set', 'static', 'super', 'switch', 'this', 'throw', 'true', 'try', 'type',
  'typeof', 'undefined', 'var', 'void', 'while', 'yield',
]);

/** Built-in types, coloured like declared ones. */
const PRIMITIVES = new Set(['any', 'bigint', 'boolean', 'never', 'number', 'object', 'string', 'symbol', 'unknown']);

const esc = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const span = (cls, text) => `<span class="tok-${cls}">${esc(text)}</span>`;

/** Index just past the `}` closing the `${` that starts at `from`, or the end of input. */
function interpolationEnd(src, from) {
  let depth = 1;
  let i = from;
  while (i < src.length && depth) {
    const c = src[i];
    if (c === '`') {
      i = templateEnd(src, i + 1);
      continue;
    }
    if (c === '"' || c === "'") {
      i = quotedEnd(src, i + 1, c);
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') depth--;
    i++;
  }
  return i;
}

function quotedEnd(src, from, quote) {
  let i = from;
  while (i < src.length && src[i] !== quote && src[i] !== '\n') i += src[i] === '\\' ? 2 : 1;
  return Math.min(i + 1, src.length);
}

function templateEnd(src, from) {
  let i = from;
  while (i < src.length && src[i] !== '`') {
    if (src[i] === '\\') i += 2;
    else if (src[i] === '$' && src[i + 1] === '{') i = interpolationEnd(src, i + 2);
    else i++;
  }
  return Math.min(i + 1, src.length);
}

/** A template literal: the text is a string, each `${...}` is code again. */
function template(src) {
  let out = '';
  let text = '';
  let i = 0;
  while (i < src.length) {
    if (src[i] === '\\') {
      text += src.slice(i, i + 2);
      i += 2;
    } else if (src[i] === '$' && src[i + 1] === '{') {
      const end = interpolationEnd(src, i + 2);
      out += span('s', text + '${') + highlightTs(src.slice(i + 2, end - 1)) + span('s', '}');
      text = '';
      i = end;
    } else {
      text += src[i++];
    }
  }
  return out + (text ? span('s', text) : '');
}

export function highlightTs(src) {
  let out = '';
  let i = 0;
  // The last two code characters seen, comments and strings excluded: decides
  // whether an identifier follows a `.` and is therefore a member, not a keyword.
  let tail = '';
  while (i < src.length) {
    const c = src[i];
    const rest = src.slice(i);
    let m;

    if (rest.startsWith('//')) {
      const end = src.indexOf('\n', i);
      const j = end === -1 ? src.length : end;
      out += span('c', src.slice(i, j));
      i = j;
    } else if (rest.startsWith('/*')) {
      const end = src.indexOf('*/', i + 2);
      const j = end === -1 ? src.length : end + 2;
      out += span('c', src.slice(i, j));
      i = j;
    } else if (c === '"' || c === "'") {
      const j = quotedEnd(src, i + 1, c);
      out += span('s', src.slice(i, j));
      i = j;
      tail = 's';
    } else if (c === '`') {
      const j = templateEnd(src, i + 1);
      out += template(src.slice(i, j));
      i = j;
      tail = 's';
    } else if ((m = rest.match(/^(?:0[xX][\da-fA-F_]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?n?)/))) {
      out += span('n', m[0]);
      i += m[0].length;
      tail = '0';
    } else if ((m = rest.match(/^[A-Za-z_$][\w$]*/))) {
      const word = m[0];
      const next = src.slice(i + word.length);
      // A property access is never a keyword: `options.default`, `locator.first`.
      const isMember = tail.endsWith('.') && !tail.endsWith('..');
      if (!isMember && KEYWORDS.has(word)) out += span('k', word);
      else if (/^\s*(?:<[^()\n;]*>)?\s*\(/.test(next) && /[a-z_$]/.test(word[0])) out += span('f', word);
      else if ((/^[A-Z]/.test(word) && /[a-z]/.test(word)) || (!isMember && PRIMITIVES.has(word))) out += span('t', word);
      else out += esc(word);
      i += word.length;
      tail = 'a';
    } else {
      out += esc(c);
      i++;
      if (!/\s/.test(c)) tail = (tail + c).slice(-2);
    }
  }
  return out;
}

/** Token colours, one block per theme, written against the page's own surfaces. */
export const HIGHLIGHT_TOKENS = {
  light: { c: '#636c76', k: '#8250df', s: '#116329', n: '#0550ae', f: '#953800', t: '#0550ae' },
  dark: { c: '#8b949e', k: '#d2a8ff', s: '#7ee787', n: '#79c0ff', f: '#ffa657', t: '#79c0ff' },
};

export const tokenVars = (theme) =>
  Object.entries(HIGHLIGHT_TOKENS[theme]).map(([k, v]) => `\n  --tok-${k}: ${v};`).join('');

export const HIGHLIGHT_STYLES = `
.tok-c { color: var(--tok-c); font-style: italic; }
.tok-k { color: var(--tok-k); }
.tok-s { color: var(--tok-s); }
.tok-n { color: var(--tok-n); }
.tok-f { color: var(--tok-f); }
.tok-t { color: var(--tok-t); }
`;
