/**
 * Renders the literal call each strategy makes, without launching a browser.
 *
 * A recording proxy stands in for the Page, so what comes back is produced by
 * each strategy's own `build()` function with real arguments rather than being
 * transcribed by hand. If a strategy changes, this changes with it.
 *
 * Shared by the markdown reference and the dashboard so the two cannot disagree
 * about what a strategy actually does.
 */
import { STRATEGIES } from '../e2e/locators/strategies.ts';

const isRecorder = (v) =>
  v !== null && (typeof v === 'object' || typeof v === 'function') && v.__path;

function format(value) {
  if (isRecorder(value)) return value.__path;
  if (typeof value === 'string') return JSON.stringify(value);
  if (value && typeof value === 'object') {
    return '{ ' + Object.entries(value).map(([k, v]) => `${k}: ${format(v)}`).join(', ') + ' }';
  }
  return String(value);
}

const recorder = (path) =>
  new Proxy(function () {}, {
    get(_target, prop) {
      if (prop === '__path') return path;
      if (typeof prop !== 'string' || prop === 'then') return undefined;
      return (...args) => recorder(`${path}.${prop}(${args.map(format).join(', ')})`);
    },
  });

/**
 * A representative target: a grid cell at row 750, column 2, exactly as the
 * benchmark app renders it. Concrete values rather than placeholders, because
 * `getByRole(role, { name })` hides the thing a reader needs to see.
 */
export const EXAMPLE_TARGET = {
  found: true, tag: 'button', role: 'button',
  domId: 'cell-r750-c2', testIdAttr: 'data-testid', testId: 'cell.750.2',
  qaId: 'ebc69256', accessibleName: 'Status for row 750', text: 'status-750-2-ft8o',
  kind: 'cell', row: '750', col: '2',
  semanticClass: 'bm-cell', variantClass: 'bm-cell--v2', hashedClass: '_a854d9',
  cssChain: 'tr.bm-grid__row > td.bm-grid__cellwrap > button.bm-grid__cell.bm-cell.bm-cell--v2._a854d9',
  cssChainScoped: 'td.bm-grid__cellwrap > button.bm-grid__cell',
  xpathAbs: '/html/body/app-root/bm-grid/section/table/tbody/tr[751]/td[3]/button',
  xpathRel: '//button[@aria-label="Status for row 750"]',
  nthOfClass: 4502, nthOfRole: 4502, classMatchCount: 9000,
  scopeTestId: 'row.750', inShadowRoot: false,
  depth: 9, shadowHops: 0, siblingCount: 1,
  ancestorTags: 'app-root>bm-grid>section>table>tbody>tr>td>button',
};

/** [{ id, family, note, call }] for every strategy in the matrix. */
export function describeStrategies(target = EXAMPLE_TARGET) {
  return STRATEGIES.map((s) => ({
    id: s.id,
    family: s.family,
    note: s.note,
    call: s.build(recorder('page'), target).__path,
  }));
}
