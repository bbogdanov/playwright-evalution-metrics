/**
 * S15 - the page shape every part of the scenario runs against.
 *
 * Fifty levels between the app root and the target, about five thousand elements
 * on the page. That is a plausible worst case for a component-heavy Angular
 * screen: a dashboard of nested cards, panels, tabs and form sections, each of
 * them a host element.
 *
 * The shallow control holds the element count and changes only the depth, so a
 * depth-50 figure always has the number it should be read against next to it,
 * measured in the same run on the same machine.
 */
export const FILL = 5_000;
export const DEEP = 50;
export const SHALLOW = 5;

/** Levels of the depth-50 page at which S15 level places its target. */
export const LEVELS = [1, 10, 25, 40, 50] as const;
