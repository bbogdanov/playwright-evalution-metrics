import { Directive, computed, inject, input } from '@angular/core';
import { BenchParams } from '../core/bench-params.service';
import { Copy } from '../core/copy.service';
import { hash8 } from '../core/rng';
import { BmTargetSpec } from '../core/types';

/**
 * The multi-addressable element: the single most important primitive in this
 * benchmark.
 *
 * Every locator strategy under comparison must resolve to the *same physical
 * node*, otherwise a timing difference could be explained by the elements being
 * at different depths, in different subtrees, or of different tag types rather
 * than by the locator engine itself. This directive therefore stamps one element
 * with every addressing scheme at once:
 *
 *   id, data-testid (or data-test), data-qa, semantic class, variant class,
 *   build-hashed class, aria-label, title, name, and compound data-row/data-col.
 *
 * Which of those survive a given mutation is the robustness half of the study.
 */
@Directive({
  selector: '[bmTarget]',
  host: {
    '[attr.id]': 'domId()',
    '[attr.data-testid]': 'testId().testid',
    '[attr.data-test]': 'testId().test',
    '[attr.data-qa]': 'qaId()',
    '[attr.aria-label]': 'accessibleName()',
    '[attr.title]': 'accessibleName()',
    '[attr.name]': 'domId()',
    '[attr.data-row]': 'spec().r',
    '[attr.data-col]': 'spec().c ?? null',
    '[attr.data-kind]': 'spec().kind',
    '[class]': 'classes()',
  },
})
export class BmTargetDirective {
  readonly spec = input.required<BmTargetSpec>({ alias: 'bmTarget' });

  private readonly params = inject(BenchParams);
  private readonly copy = inject(Copy);

  /** `cell-r4821-c3`. Hyphenated, so it differs syntactically from the test id. */
  readonly domId = computed(() => {
    const s = this.spec();
    return s.c === undefined ? `${s.kind}-r${s.r}` : `${s.kind}-r${s.r}-c${s.c}`;
  });

  /** `cell.4821.3`. Dot-separated on purpose: distinct token shape from the id. */
  private readonly testIdValue = computed(() => {
    const s = this.spec();
    return s.c === undefined ? `${s.kind}.${s.r}` : `${s.kind}.${s.r}.${s.c}`;
  });

  /**
   * Under `attrRename` the value moves from data-testid to data-test, which is
   * what happens when a team migrates its test-id convention. Exactly one of the
   * two attributes is ever present.
   */
  readonly testId = computed(() => {
    const value = this.testIdValue();
    return this.params.has('attrRename')
      ? { testid: null, test: value }
      : { testid: value, test: null };
  });

  /**
   * Opaque, content-free, never mutated. Represents the "generated unique id"
   * school of test attributes: maximally robust, zero readability.
   */
  readonly qaId = computed(() => hash8(`qa:${this.testIdValue()}`));

  readonly accessibleName = computed(() => {
    const s = this.spec();
    return s.c === undefined ? `${this.copy.t(s.label)} ${s.r}` : this.copy.cellName(s.label, s.r);
  });

  readonly classes = computed(() => {
    const s = this.spec();
    const variant = s.variant ?? 0;
    const semantic = this.params.has('classRename') ? `bmx-${s.kind}-el` : `bm-${s.kind}`;
    const hashed = `_${hash8(`${s.kind}:${this.params.effectiveSalt()}`).slice(0, 6)}`;
    return `${semantic} ${semantic}--v${variant} ${hashed}`;
  });
}
