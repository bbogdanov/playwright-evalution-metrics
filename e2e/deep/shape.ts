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
export const DEEP = 50;
export const SHALLOW = 5;

/** Filler buttons on every S15 page, whatever its depth. */
export const FILLERS = 5_100;

/**
 * The `fill` parameter that puts exactly FILLERS buttons on a page `depth` levels
 * deep.
 *
 * The route spreads `fill` over depth + 1 levels (0 through depth), rounding the
 * per-level count from fill / depth. Passing the same `fill` at depth 5 and 50
 * therefore yields 6,000 and 5,100 fillers: a "same size" control 15% larger,
 * which flatters every engine whose cost scales with candidates. 5,100 divides
 * evenly by 6 and by 51, so both pages get exactly the same filler count; the
 * remaining difference is the two wrapper elements per level, ~90 of ~5,200.
 */
export function fillFor(depth: number): number {
  const perLevel = FILLERS / (depth + 1);
  if (!Number.isInteger(perLevel)) throw new Error(`${FILLERS} fillers do not divide over ${depth + 1} levels`);
  return perLevel * depth;
}

/** Kept for titles: the depth-50 page's fill parameter. */
export const FILL = fillFor(DEEP);

/** Levels of the depth-50 page at which S15 level places its target. */
export const LEVELS = [1, 10, 25, 40, 50] as const;
