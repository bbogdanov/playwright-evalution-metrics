import type { Locator, Page } from '@playwright/test';
import type { TargetDescriptor } from './describe';

export type Root = Page | Locator;

export type Family =
  | 'identity'      // id, test id, generated unique attribute
  | 'attribute'     // other attribute-based addressing
  | 'class'         // CSS classes, semantic or build-hashed
  | 'structural'    // ancestry: CSS chains, XPath, positional
  | 'role'          // accessibility tree
  | 'text'          // visible copy
  | 'filter'        // relational filtering (:has, hasText)
  | 'composite';    // scoping and mixed engines

export interface Strategy {
  readonly id: string;
  readonly family: Family;
  /** What this strategy is actually asking the browser to do. */
  readonly note: string;
  /** False when the target does not expose what this strategy needs. */
  applicable(t: TargetDescriptor): boolean;
  build(root: Root, t: TargetDescriptor): Locator;
  /**
   * The closest native DOM equivalent, for floor measurement. Null means no
   * native API does this job — which for the role and text families is the
   * single most important fact about their cost.
   */
  floor?(t: TargetDescriptor): { kind: 'id' | 'attr' | 'class' | 'css-chain' | 'xpath' | 'text-scan'; selector: string } | null;
}

const esc = (s: string) => s.replace(/"/g, '\\"');

/**
 * CSS.escape for Node. The DOM provides CSS.escape, but strategy builders run in
 * the test process, not in the page, so calling it here would throw.
 * Implements the CSSOM serialisation rules for identifiers.
 */
function cssEscape(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    const ch = value[i];
    if (c === 0) { out += '\uFFFD'; continue; }
    if (
      (c >= 0x1 && c <= 0x1f) || c === 0x7f ||
      (i === 0 && c >= 0x30 && c <= 0x39) ||
      (i === 1 && c >= 0x30 && c <= 0x39 && value.charCodeAt(0) === 0x2d)
    ) {
      out += '\\' + c.toString(16) + ' ';
      continue;
    }
    if (i === 0 && c === 0x2d && value.length === 1) { out += '\\' + ch; continue; }
    if (c >= 0x80 || c === 0x2d || c === 0x5f ||
        (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) {
      out += ch;
      continue;
    }
    out += '\\' + ch;
  }
  return out;
}

/** Splits a devtools-style chain into its parent chain and its final step. */
function splitChain(chain: string): { parent: string; leaf: string } {
  const parts = chain.split(' > ');
  return { parent: parts.slice(0, -1).join(' > '), leaf: parts[parts.length - 1] ?? '' };
}

/**
 * The comparison matrix.
 *
 * Every entry addresses the *same physical element*. Where a strategy is
 * deliberately ambiguous (bare semantic class, bare role, bare text) it is kept
 * in the matrix rather than fixed, because the ambiguity is the finding: those
 * are the locators that pass review against a small fixture and collide in
 * production data.
 *
 * Several entries exist as matched pairs: a getBy* helper alongside the
 * equivalent selector string handed to page.locator(). getByTestId against
 * `data-testid=`, getByRole against `role=...[name="X"s]`, getByText against
 * `text="X"`, and .nth() against `>> nth=`. The helpers are thin wrappers over
 * the same engines, so the pairs answer a question people actually argue about:
 * whether the ergonomic API costs anything at runtime. If it does not - and the
 * pairing is the only way to show that - then the choice between them is purely
 * about readability, which is a much easier argument to settle.
 */
export const STRATEGIES: Strategy[] = [
  // --- identity ------------------------------------------------------------
  {
    id: 'testid.api',
    family: 'identity',
    note: 'getByTestId with the configured testIdAttribute',
    applicable: (t) => !!t.testId && t.testIdAttr === 'data-testid',
    build: (root, t) => root.getByTestId(t.testId),
    floor: (t) => ({ kind: 'attr', selector: `[data-testid="${esc(t.testId)}"]` }),
  },
  {
    id: 'testid.css',
    family: 'identity',
    note: 'The same attribute written as a raw CSS attribute selector',
    applicable: (t) => !!t.testId,
    build: (root, t) => root.locator(`[${t.testIdAttr}="${esc(t.testId)}"]`),
    floor: (t) => ({ kind: 'attr', selector: `[${t.testIdAttr}="${esc(t.testId)}"]` }),
  },
  {
    id: 'testid.engine',
    family: 'identity',
    note: 'page.locator with the data-testid selector engine, no helper wrapper',
    applicable: (t) => !!t.testId && t.testIdAttr === 'data-testid',
    build: (root, t) => root.locator(`data-testid=${t.testId}`),
    floor: (t) => ({ kind: 'attr', selector: `[data-testid="${esc(t.testId)}"]` }),
  },
  {
    id: 'id.engine',
    family: 'identity',
    note: 'page.locator with the id selector engine rather than a CSS # selector',
    applicable: (t) => !!t.domId,
    build: (root, t) => root.locator(`id=${t.domId}`),
    floor: (t) => ({ kind: 'id', selector: t.domId }),
  },
  {
    id: 'id.css',
    family: 'identity',
    note: 'CSS id selector; the theoretical best case for any engine',
    applicable: (t) => !!t.domId,
    build: (root, t) => root.locator(`#${cssEscape(t.domId)}`),
    floor: (t) => ({ kind: 'id', selector: t.domId }),
  },
  {
    id: 'qa.attr',
    family: 'identity',
    note: 'Opaque generated unique attribute: maximally stable, unreadable',
    applicable: (t) => !!t.qaId,
    build: (root, t) => root.locator(`[data-qa="${esc(t.qaId)}"]`),
    floor: (t) => ({ kind: 'attr', selector: `[data-qa="${esc(t.qaId)}"]` }),
  },

  // --- attribute -----------------------------------------------------------
  {
    id: 'attr.compound',
    family: 'attribute',
    note: 'Three data attributes combined; unique without a dedicated test id',
    applicable: (t) => !!t.kind && !!t.row,
    build: (root, t) =>
      root.locator(
        `[data-kind="${esc(t.kind)}"][data-row="${esc(t.row)}"]` +
          (t.col ? `[data-col="${esc(t.col)}"]` : ''),
      ),
    floor: (t) => ({
      kind: 'attr',
      selector:
        `[data-kind="${esc(t.kind)}"][data-row="${esc(t.row)}"]` +
        (t.col ? `[data-col="${esc(t.col)}"]` : ''),
    }),
  },
  {
    id: 'title.api',
    family: 'attribute',
    note: 'getByTitle: attribute match, but ambiguity depends on copy',
    applicable: (t) => !!t.accessibleName,
    build: (root, t) => root.getByTitle(t.accessibleName, { exact: true }),
    floor: (t) => ({ kind: 'attr', selector: `[title="${esc(t.accessibleName)}"]` }),
  },

  // --- class ---------------------------------------------------------------
  {
    id: 'class.semantic',
    family: 'class',
    note: 'Bare semantic class; ambiguous the moment the list has two rows',
    applicable: (t) => !!t.semanticClass,
    build: (root, t) => root.locator(`.${cssEscape(t.semanticClass)}`),
    floor: (t) => ({ kind: 'class', selector: `.${cssEscape(t.semanticClass)}` }),
  },
  {
    id: 'class.semantic.nth',
    family: 'class',
    note: 'Semantic class disambiguated by index: unique, and order-dependent',
    applicable: (t) => !!t.semanticClass && t.nthOfClass >= 0,
    build: (root, t) => root.locator(`.${cssEscape(t.semanticClass)}`).nth(t.nthOfClass),
    floor: (t) => ({ kind: 'class', selector: `.${cssEscape(t.semanticClass)}` }),
  },
  {
    id: 'class.compound',
    family: 'class',
    note: 'Semantic plus variant class; narrower, still not unique',
    applicable: (t) => !!t.semanticClass && !!t.variantClass,
    build: (root, t) =>
      root.locator(`.${cssEscape(t.semanticClass)}.${cssEscape(t.variantClass)}`),
    floor: (t) => ({
      kind: 'class',
      selector: `.${cssEscape(t.semanticClass)}.${cssEscape(t.variantClass)}`,
    }),
  },
  {
    id: 'class.hashed',
    family: 'class',
    note: 'Build-hashed class, as emitted by CSS modules or scoped styles',
    applicable: (t) => !!t.hashedClass,
    build: (root, t) => root.locator(`.${cssEscape(t.hashedClass)}`),
    floor: (t) => ({ kind: 'class', selector: `.${cssEscape(t.hashedClass)}` }),
  },

  // --- structural ----------------------------------------------------------
  {
    id: 'css.chain.full',
    family: 'structural',
    note: 'Full ancestor chain from <body>, i.e. devtools "Copy selector"',
    applicable: (t) => !!t.cssChain,
    build: (root, t) => root.locator(t.cssChain),
    floor: (t) => ({ kind: 'css-chain', selector: t.cssChain }),
  },
  {
    id: 'xpath.absolute',
    family: 'structural',
    note: 'Positional absolute XPath, the most brittle form available',
    applicable: (t) => !!t.xpathAbs && !t.inShadowRoot,
    build: (root, t) => root.locator(`xpath=${t.xpathAbs}`),
    floor: (t) => ({ kind: 'xpath', selector: t.xpathAbs }),
  },
  {
    id: 'xpath.relative',
    family: 'structural',
    note: 'Attribute-predicated XPath; no ancestry, but still no shadow piercing',
    applicable: (t) => !!t.xpathRel && !t.inShadowRoot,
    build: (root, t) => root.locator(`xpath=${t.xpathRel}`),
    floor: (t) => ({ kind: 'xpath', selector: t.xpathRel }),
  },

  // --- role ----------------------------------------------------------------
  {
    id: 'role.name',
    family: 'role',
    note: 'getByRole with an accessible name; no native equivalent exists',
    applicable: (t) => !!t.role && !!t.accessibleName,
    build: (root, t) => root.getByRole(t.role as 'button', { name: t.accessibleName, exact: true }),
    floor: () => null,
  },
  {
    id: 'role.locator',
    family: 'role',
    note: 'The same role query written for page.locator: role=button[name="X"s]',
    applicable: (t) => !!t.role && !!t.accessibleName,
    // The trailing "s" is the role engine's exact, case-sensitive match - the
    // equivalent of passing { exact: true } to the helper. [exact=true] is not
    // valid syntax here, which is itself an argument for the helper.
    build: (root, t) => root.locator(`role=${t.role}[name="${esc(t.accessibleName)}"s]`),
    floor: () => null,
  },
  {
    id: 'role.bare.nth',
    family: 'role',
    note: 'getByRole without a name, disambiguated by index',
    applicable: (t) => !!t.role && t.nthOfRole >= 0,
    build: (root, t) => root.getByRole(t.role as 'button').nth(t.nthOfRole),
    floor: () => null,
  },

  // --- text ----------------------------------------------------------------
  {
    id: 'text.exact',
    family: 'text',
    note: 'getByText, exact match on normalised visible text',
    applicable: (t) => t.text.length > 0,
    build: (root, t) => root.getByText(t.text, { exact: true }),
    floor: (t) => ({ kind: 'text-scan', selector: t.text }),
  },
  {
    id: 'text.locator',
    family: 'text',
    note: 'The same text query written for page.locator: text="X" (quoted means exact)',
    applicable: (t) => t.text.length > 0,
    build: (root, t) => root.locator(`text="${esc(t.text)}"`),
    floor: (t) => ({ kind: 'text-scan', selector: t.text }),
  },
  {
    id: 'text.substring',
    family: 'text',
    note: 'getByText substring match; scans and compares every text node',
    applicable: (t) => t.text.length >= 4,
    build: (root, t) => root.getByText(t.text.slice(0, Math.max(4, t.text.length - 2))),
    floor: () => null,
  },

  // --- filter --------------------------------------------------------------
  {
    id: 'filter.hasText',
    family: 'filter',
    note: 'Class locator narrowed by hasText: a text scan per candidate',
    applicable: (t) => !!t.semanticClass && t.text.length > 0,
    build: (root, t) =>
      root.locator(`.${cssEscape(t.semanticClass)}`).filter({ hasText: t.text }),
    floor: () => null,
  },
  {
    id: 'filter.has',
    family: 'filter',
    note: 'Find the container holding X, then the leaf inside it: a subquery per candidate',
    applicable: (t) => !!t.testId && splitChain(t.cssChain).parent.length > 0,
    build: (root, t) => {
      const { parent, leaf } = splitChain(t.cssChain);
      return root
        .locator(parent)
        .filter({ has: root.locator(`[${t.testIdAttr}="${esc(t.testId)}"]`) })
        .locator(leaf);
    },
    floor: () => null,
  },
  {
    id: 'css.has',
    family: 'filter',
    note: 'CSS :has() evaluated as a subquery per candidate container',
    applicable: (t) => !!t.testId && splitChain(t.cssChain).parent.length > 0,
    build: (root, t) => {
      const { parent, leaf } = splitChain(t.cssChain);
      return root.locator(`${parent}:has([${t.testIdAttr}="${esc(t.testId)}"]) > ${leaf}`);
    },
    floor: () => null,
  },
  {
    id: 'css.hasText',
    family: 'filter',
    note: 'The :has-text() pseudo-class: a text scan per candidate',
    applicable: (t) => !!t.semanticClass && t.text.length > 0,
    build: (root, t) => root.locator(`.${cssEscape(t.semanticClass)}:has-text("${esc(t.text)}")`),
    floor: () => null,
  },
  {
    id: 'css.visible',
    family: 'filter',
    note: 'The :visible pseudo-class; forces layout for every candidate',
    applicable: (t) => !!t.semanticClass,
    build: (root, t) => root.locator(`.${cssEscape(t.semanticClass)}:visible`),
    floor: () => null,
  },

  // --- composite -----------------------------------------------------------
  {
    id: 'scoped.role',
    family: 'composite',
    note: 'Container test id, then role inside it: the standard advice',
    applicable: (t) => !!t.scopeTestId && !!t.role && !!t.accessibleName,
    build: (root, t) =>
      root.getByTestId(t.scopeTestId).getByRole(t.role as 'button', { name: t.accessibleName, exact: true }),
    floor: () => null,
  },
  {
    id: 'scoped.class',
    family: 'composite',
    note: 'Container test id, then semantic class inside it',
    applicable: (t) => !!t.scopeTestId && !!t.semanticClass,
    build: (root, t) => root.getByTestId(t.scopeTestId).locator(`.${cssEscape(t.semanticClass)}`),
    floor: () => null,
  },
  {
    id: 'chained.locator',
    family: 'composite',
    note: 'Chained .locator() calls rather than one compound selector',
    applicable: (t) => t.cssChain.split(' > ').length >= 3,
    build: (root, t) => {
      const parts = t.cssChain.split(' > ');
      return parts.reduce<Root>((acc, part) => acc.locator(part), root) as Locator;
    },
  },
  {
    id: 'nth.engine',
    family: 'structural',
    note: 'Positional selection through the nth= engine rather than the .nth() helper',
    applicable: (t) => !!t.semanticClass && t.nthOfClass >= 0,
    build: (root, t) => root.locator(`css=.${cssEscape(t.semanticClass)} >> nth=${t.nthOfClass}`),
    floor: (t) => ({ kind: 'class', selector: `.${cssEscape(t.semanticClass)}` }),
  },
  {
    id: 'mixed.engine',
    family: 'composite',
    note: 'CSS handed to a text engine via >>; two engines, one locator',
    applicable: (t) => !!t.semanticClass && t.text.length > 0,
    build: (root, t) => root.locator(`css=.${cssEscape(t.semanticClass)} >> text="${esc(t.text)}"`),
  },
];

export const BY_ID: ReadonlyMap<string, Strategy> = new Map(STRATEGIES.map((s) => [s.id, s]));

export function applicable(t: TargetDescriptor, only?: readonly string[]): Strategy[] {
  const pool = only ? STRATEGIES.filter((s) => only.includes(s.id)) : STRATEGIES;
  return pool.filter((s) => s.applicable(t));
}
