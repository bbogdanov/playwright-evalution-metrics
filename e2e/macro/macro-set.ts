/**
 * Representative strategies for the macro scenarios.
 *
 * The full 26-entry matrix is affordable for micro benchmarking, where a
 * repetition costs milliseconds. A macro repetition costs an action or a full
 * actionability wait, so the matrix is reduced to one or two representatives per
 * family — chosen to be the ones a real test would plausibly use, not the ones
 * that make the best story.
 */
export const MACRO_SET = [
  'testid.api',       // identity, the conventional recommendation
  'id.css',           // identity, the theoretical floor
  'class.semantic.nth', // class, made unique the way people actually make it unique
  'css.chain.full',   // structural, i.e. devtools "Copy selector"
  'xpath.absolute',   // structural, the recorder default
  'role.name',        // accessibility tree, the Playwright docs recommendation
  'text.exact',       // visible copy
  'filter.hasText',   // relational filtering
  'scoped.role',      // container-scoped role, the "best practice" composite
] as const;
