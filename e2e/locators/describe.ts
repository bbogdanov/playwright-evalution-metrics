import type { Page } from '@playwright/test';

/**
 * Everything needed to address one element, read back out of the live DOM.
 *
 * Deriving the descriptor from the rendered element rather than hard-coding it in
 * the spec matters for two reasons: the spec cannot drift out of sync with the
 * app, and the structural selectors (absolute XPath, CSS ancestor chain) are
 * generated from the real ancestry instead of a guess at it — which is exactly
 * what a recorder or a developer copying "Copy selector" from devtools produces.
 */
export interface TargetDescriptor {
  readonly found: boolean;
  readonly tag: string;
  readonly role: string;
  readonly domId: string;
  readonly testIdAttr: string;
  readonly testId: string;
  readonly qaId: string;
  readonly accessibleName: string;
  readonly text: string;
  readonly kind: string;
  readonly row: string;
  readonly col: string;
  readonly semanticClass: string;
  readonly variantClass: string;
  readonly hashedClass: string;
  readonly cssChain: string;
  readonly cssChainScoped: string;
  readonly xpathAbs: string;
  readonly xpathRel: string;
  /** Index of the target among all elements sharing its semantic class. */
  readonly nthOfClass: number;
  /** Index among elements sharing its role, used for role-positional locators. */
  readonly nthOfRole: number;
  /** Total elements sharing the semantic class: >1 means class locators are ambiguous. */
  readonly classMatchCount: number;
  /** Nearest ancestor carrying a test id, i.e. the natural scoping container. */
  readonly scopeTestId: string;
  readonly inShadowRoot: boolean;
  /**
   * How many element levels below <body> the target sits, counting the target
   * itself and crossing shadow boundaries through their hosts.
   *
   * Recorded on every measurement so slow queries can be correlated with where
   * their target actually lives, rather than only with how big the page is.
   */
  readonly depth: number;
  /** Shadow boundaries crossed on the way up. */
  readonly shadowHops: number;
  /** Elements sharing the target's parent, i.e. how crowded its level is. */
  readonly siblingCount: number;
  /** Tag path from <body> down, for reporting where slow targets sit. */
  readonly ancestorTags: string;
}

const ROLE_BY_TAG: Record<string, string> = {
  BUTTON: 'button', A: 'link', TH: 'columnheader', TD: 'cell', TR: 'row',
  INPUT: 'textbox', SELECT: 'combobox', TEXTAREA: 'textbox',
};

/**
 * Locates the element by its id (the one addressing scheme that is unambiguous
 * by construction) and reports every other way it could have been reached.
 */
export async function describeTarget(page: Page, domId: string): Promise<TargetDescriptor> {
  return page.evaluate(
    ({ domId, roleByTag }) => {
      const deepFind = (root: Document | ShadowRoot): Element | null => {
        const direct = root.querySelector(`#${CSS.escape(domId)}`);
        if (direct) return direct;
        for (const el of root.querySelectorAll('*')) {
          if (el.shadowRoot) {
            const hit = deepFind(el.shadowRoot);
            if (hit) return hit;
          }
        }
        return null;
      };

      const el = deepFind(document);
      const empty = {
        found: false, tag: '', role: '', domId, testIdAttr: '', testId: '', qaId: '',
        accessibleName: '', text: '', kind: '', row: '', col: '',
        semanticClass: '', variantClass: '', hashedClass: '',
        cssChain: '', cssChainScoped: '', xpathAbs: '', xpathRel: '',
        nthOfClass: -1, nthOfRole: -1, classMatchCount: 0, scopeTestId: '', inShadowRoot: false,
        depth: -1, shadowHops: 0, siblingCount: 0, ancestorTags: '',
      };
      if (!el) return empty;

      const classes = Array.from(el.classList);
      // The directive emits exactly three shapes: semantic (bm-*/bmx-*),
      // variant (*--vN) and build-hashed (_xxxxxx).
      const variantClass = classes.find((c) => c.includes('--v')) ?? '';
      const hashedClass = classes.find((c) => /^_[0-9a-f]{6}$/.test(c)) ?? '';
      const semanticClass =
        classes.find((c) => c !== variantClass && c !== hashedClass && /^bmx?-/.test(c)) ?? '';

      const root = el.getRootNode() as Document | ShadowRoot;
      const inShadowRoot = root !== document;

      const classMatches = semanticClass
        ? Array.from(root.querySelectorAll(`.${CSS.escape(semanticClass)}`))
        : [];
      const nthOfClass = classMatches.indexOf(el);

      const tag = el.tagName;
      const role = el.getAttribute('role') ?? roleByTag[tag] ?? '';
      const roleMatches = role
        ? Array.from(root.querySelectorAll(tag.toLowerCase())).filter(
            (e) => (e.getAttribute('role') ?? roleByTag[e.tagName] ?? '') === role,
          )
        : [];

      // Ancestor chain, as a devtools-style structural selector.
      const step = (e: Element): string => {
        const cls = Array.from(e.classList)
          .filter((c) => !/^_ng|^ng-/.test(c))
          .map((c) => `.${CSS.escape(c)}`)
          .join('');
        return e.tagName.toLowerCase() + cls;
      };

      const chain: string[] = [];
      let scopeTestId = '';
      let scopeDepth = -1;
      for (let node: Element | null = el; node && node.tagName !== 'HTML'; node = node.parentElement) {
        chain.unshift(step(node));
        if (node !== el && !scopeTestId) {
          const tid = node.getAttribute('data-testid') ?? node.getAttribute('data-test');
          if (tid) {
            scopeTestId = tid;
            scopeDepth = chain.length - 1;
          }
        }
      }
      const cssChain = chain.join(' > ');
      const cssChainScoped = scopeDepth >= 0 ? chain.slice(scopeDepth + 1).join(' > ') : cssChain;

      // Absolute XPath with positional predicates, i.e. the most brittle form
      // a selector can take and the one recorders emit by default.
      const xpathParts: string[] = [];
      for (let node: Element | null = el; node && node.nodeType === 1; node = node.parentElement) {
        const name = node.tagName.toLowerCase();
        const siblings = node.parentElement
          ? Array.from(node.parentElement.children).filter((c) => c.tagName === node!.tagName)
          : [];
        const idx = siblings.length > 1 ? `[${siblings.indexOf(node) + 1}]` : '';
        xpathParts.unshift(name + idx);
        if (name === 'html') break;
      }

      // Depth, measured through shadow boundaries rather than stopping at them:
      // a target three levels inside a shadow root is not at depth 1 just because
      // parentElement went null.
      let depth = 0;
      let shadowHops = 0;
      const tagPath: string[] = [];
      for (let n: Element | null = el; n; ) {
        if (n.tagName === 'BODY' || n.tagName === 'HTML') break;
        depth++;
        tagPath.unshift(n.tagName.toLowerCase());
        const parent: Element | null = n.parentElement;
        if (parent) {
          n = parent;
        } else {
          const r = n.getRootNode() as ShadowRoot | Document;
          const host: Element | null = (r as ShadowRoot).host ?? null;
          if (host) shadowHops++;
          n = host;
        }
      }

      const accessibleName = el.getAttribute('aria-label') ?? '';
      const testIdAttr = el.hasAttribute('data-testid') ? 'data-testid' : 'data-test';

      return {
        found: true,
        tag: tag.toLowerCase(),
        role,
        domId,
        testIdAttr,
        testId: el.getAttribute(testIdAttr) ?? '',
        qaId: el.getAttribute('data-qa') ?? '',
        accessibleName,
        text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
        kind: el.getAttribute('data-kind') ?? '',
        row: el.getAttribute('data-row') ?? '',
        col: el.getAttribute('data-col') ?? '',
        semanticClass,
        variantClass,
        hashedClass,
        cssChain,
        cssChainScoped,
        xpathAbs: '/' + xpathParts.join('/'),
        xpathRel: accessibleName
          ? `//${tag.toLowerCase()}[@aria-label=${JSON.stringify(accessibleName)}]`
          : `//${tag.toLowerCase()}[@id=${JSON.stringify(domId)}]`,
        nthOfClass,
        nthOfRole: roleMatches.indexOf(el),
        classMatchCount: classMatches.length,
        scopeTestId,
        inShadowRoot,
        depth,
        shadowHops,
        siblingCount: el.parentElement ? el.parentElement.children.length : 1,
        ancestorTags: tagPath.join('>'),
      };
    },
    { domId, roleByTag: ROLE_BY_TAG },
  );
}
