import type { Page } from '@playwright/test';
import type { Strategy } from '../locators/strategies';
import type { TargetDescriptor } from '../locators/describe';

/**
 * What a locator did after a mutation, shared by S6 (flat grid) and S15 (depth 50).
 *
 * Identity is verified through data-qa, which is derived only from the target's
 * logical coordinates and is therefore invariant under every mutation. Counting
 * matches alone would score a locator as surviving when it had silently latched
 * onto a different element — which is worse than breaking, because it passes.
 */
export type Outcome =
  /** Resolves to exactly the intended element. */
  | 'survived'
  /** Resolves to nothing: loud, immediate, cheap to diagnose. */
  | 'broken-none'
  /** Resolves to several elements: strict mode turns this into a failure. */
  | 'broken-ambiguous'
  /** Resolves to exactly one element, and it is the wrong one. Silent and worst. */
  | 'broken-wrong'
  /** The locator could not even be constructed against the mutated page. */
  | 'error';

export async function outcomeFor(
  page: Page,
  strategy: Strategy,
  target: TargetDescriptor,
): Promise<{ outcome: Outcome; matches: number; detail: string }> {
  try {
    const locator = strategy.build(page, target);
    const matches = await locator.count();
    if (matches === 0) return { outcome: 'broken-none', matches, detail: '' };
    if (matches > 1) return { outcome: 'broken-ambiguous', matches, detail: '' };
    const qa = await locator.first().getAttribute('data-qa');
    return qa === target.qaId
      ? { outcome: 'survived', matches, detail: '' }
      : { outcome: 'broken-wrong', matches, detail: `resolved data-qa=${qa}` };
  } catch (e) {
    return { outcome: 'error', matches: -1, detail: (e as Error).message.split('\n')[0] };
  }
}
