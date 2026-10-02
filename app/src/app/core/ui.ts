import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';

/**
 * `?ui=rich` opts into the Material showcase: an app shell, sortable and
 * filterable tables, and a generated nesting page.
 *
 * It is opt-in so the default DOM, which every published measurement was taken
 * against, does not change by a single node. The rich pages are separate route
 * components selected by this guard rather than an @if inside the benchmark
 * components, because even an @if leaves an anchor node in the DOM it guards.
 */
export const RICH = 'rich';

export function isRichSearch(search: string): boolean {
  return new URLSearchParams(search).get('ui') === RICH;
}

/** Matches while the navigation in flight carries ?ui=rich. */
export const richOnly: CanMatchFn = () =>
  inject(Router).currentNavigation()?.extractedUrl.queryParamMap.get('ui') === RICH;

/** Query params every rich link carries so the user stays in the showcase. */
export const RICH_PARAMS = { ui: RICH } as const;
