import { Injectable, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { hash8 } from './rng';
import { MutationMode } from './types';

/**
 * Single source of truth for every knob the benchmark drives from the URL.
 *
 * Playwright controls DOM size, render behaviour and mutation mode purely through
 * query parameters, so a scenario never needs to rebuild or re-deploy the app to
 * change the shape of the page under test.
 */
@Injectable({ providedIn: 'root' })
export class BenchParams {
  private readonly router = inject(Router);
  private readonly params = signal<URLSearchParams>(readParams(location.search));

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => this.params.set(readParams(location.search)));
  }

  private num(key: string, fallback: number): number {
    const raw = this.params().get(key);
    const parsed = raw === null ? NaN : Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private str(key: string, fallback: string): string {
    return this.params().get(key) ?? fallback;
  }

  private flag(key: string, fallback: boolean): boolean {
    const raw = this.params().get(key);
    return raw === null ? fallback : raw !== '0' && raw !== 'false';
  }

  // --- DOM shape -----------------------------------------------------------
  readonly rows = computed(() => clamp(this.num('rows', 200), 0, 100_000));
  readonly cols = computed(() => clamp(this.num('cols', 8), 1, 64));
  readonly depth = computed(() => clamp(this.num('depth', 10), 1, 60));
  readonly breadth = computed(() => clamp(this.num('breadth', 2), 1, 8));
  /**
   * Total filler elements on the nesting route, spread evenly across levels.
   * Specified as a total so depth can be varied with element count held constant.
   */
  readonly fill = computed(() => clamp(this.num('fill', 200), 0, 60_000));
  readonly fields = computed(() => clamp(this.num('fields', 100), 1, 2000));

  // --- Render behaviour ----------------------------------------------------
  /** Mutation frequency in Hz for the churn route. 0 disables churn. */
  readonly hz = computed(() => clamp(this.num('hz', 0), 0, 120));
  /** Whether @for uses a stable track expression. Off => full DOM teardown per tick. */
  readonly trackBy = computed(() => this.flag('trackby', true));
  /** Milliseconds before late content appears. */
  readonly delay = computed(() => clamp(this.num('delay', 0), 0, 60_000));
  /** Number of decoy elements that deliberately collide with the canonical target. */
  readonly decoys = computed(() => clamp(this.num('dup', 0), 0, 5_000));
  /**
   * Which repeated unit holds the canonical target. -1 means "the middle one",
   * which is the honest default: first and last are both special cases that let a
   * selector engine short-circuit.
   */
  readonly targetIndex = computed(() => Math.trunc(this.num('target', -1)));
  /**
   * Number of extra elements that deliberately reuse the canonical target's id.
   *
   * Duplicate ids are invalid HTML and happen constantly - a component rendered
   * twice, a modal that reuses a template, a list that forgets to suffix. Without
   * this knob the ambiguity sweep can never break an id locator, and "ids never
   * collide" would be a property of this fixture masquerading as a finding.
   *
   * The duplicates render BEFORE the canonical target in document order, which is
   * the case that matters: anything resolving by document order silently switches
   * to the new element rather than failing.
   */
  readonly duplicateIds = computed(() => clamp(this.num('dupIds', 0), 0, 50));
  /**
   * Which actionability gate the late-content route exercises. Each value blocks a
   * different part of Playwright's actionability loop, and they do not cost the same.
   */
  readonly lateMode = computed<'append' | 'visible' | 'enabled' | 'stable'>(() => {
    const raw = this.str('lateMode', 'append');
    return (['append', 'visible', 'enabled', 'stable'] as const).includes(raw as never)
      ? (raw as 'append')
      : 'append';
  });

  // --- Determinism ---------------------------------------------------------
  readonly seed = computed(() => this.str('seed', 'bm-v1'));
  /** Salt for fabricated build-hash class names. Re-rolling it simulates a rebuild. */
  readonly salt = computed(() => this.str('salt', 'v1'));

  // --- Mutations -----------------------------------------------------------
  readonly mutations = computed<ReadonlySet<MutationMode>>(() => {
    const raw = this.str('mutate', '').split(',').map((s) => s.trim()).filter(Boolean);
    return new Set(raw as MutationMode[]);
  });

  has(mode: MutationMode): boolean {
    return this.mutations().has(mode);
  }

  readonly locale = computed(() => (this.has('locale') ? 'de' : 'en'));

  /**
   * Effective salt. `classHash` re-rolls it, which is exactly what a production
   * build does to CSS-module or scoped class names between releases.
   */
  readonly effectiveSalt = computed(() =>
    this.has('classHash') ? hash8(this.salt() + ':rerolled') : this.salt(),
  );

  /** Attribute name carrying the test id, so `attrRename` can move the goalposts. */
  readonly testIdAttr = computed(() => (this.has('attrRename') ? 'data-test' : 'data-testid'));

  readonly ready = computed(() => `${this.rows()}x${this.cols()}@${this.seed()}`);
}

function readParams(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
