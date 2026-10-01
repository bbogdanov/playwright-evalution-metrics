import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ActionLog } from '../../core/action-log.service';
import { BenchParams } from '../../core/bench-params.service';
import { Copy } from '../../core/copy.service';
import { BmTargetDirective } from '../../shared/bm-target.directive';
import { BmTargetSpec } from '../../core/types';

/**
 * One level of the nesting ladder. Recursion is via the component's own selector,
 * so each level contributes a real Angular host element to the DOM — the same
 * shape a component-heavy Angular app actually produces.
 *
 * Filler elements are real <button>s with distinct accessible names, not inert
 * spans. That matters: role and text engines have to compute a name or walk a
 * text node for every candidate whether or not it matches, so inert fillers would
 * make those families look artificially cheap. The fillers carry a different
 * semantic class from the target, which keeps class-based locators unambiguous so
 * that depth stays the only variable under test.
 *
 * With `levelTargets` on, every level also carries a test-id container and one
 * addressable marker button, so a scenario can pick a target at any depth of the
 * same page and scope to the container that holds it.
 *
 * The leaf honours the `wrap` and `reorder` mutations itself rather than through
 * bm-wrap: bm-wrap is a host element and would add a level to the unmutated
 * page, which would change the shape S12 measured.
 */
@Component({
  selector: 'bm-nest',
  imports: [BmTargetDirective, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bm-node" [class]="'bm-node--d' + level()" [attr.data-depth]="level()"
         [attr.data-testid]="levelTargets() ? 'deep.level.' + level() : null">
      @if (isLeafLevel() && reordered()) {
        <ng-container [ngTemplateOutlet]="leafSlot" />
      }
      @for (s of fillers(); track s) {
        <button type="button" class="bm-filler-btn"
                [attr.data-fill]="s"
                [attr.aria-label]="'Filler ' + level() + '.' + s"
                (click)="log.record('filler-' + level() + '-' + s)">f{{ level() }}.{{ s }}</button>
      }
      @if (levelTargets()) {
        <button type="button" class="bm-level-btn"
                [bmTarget]="levelSpec()"
                (click)="log.record('level-' + level())">{{ copy.t('level') }} {{ level() }}</button>
      }
      @if (level() < maxDepth()) {
        <bm-nest [level]="level() + 1" [maxDepth]="maxDepth()" [fillPerLevel]="fillPerLevel()" />
      } @else if (!reordered()) {
        <ng-container [ngTemplateOutlet]="leafSlot" />
      }
    </div>

    <ng-template #leafSlot>
      @if (wrapped()) {
        <div class="bm-layout-shell"><div class="bm-layout-inner">
          <ng-container [ngTemplateOutlet]="leafBtn" />
        </div></div>
      } @else {
        <ng-container [ngTemplateOutlet]="leafBtn" />
      }
    </ng-template>

    <ng-template #leafBtn>
      <button type="button" class="bm-leaf-btn"
              [bmTarget]="leafSpec()"
              (click)="log.record('deep-leaf')">{{ copy.t('leaf') }} {{ level() }}</button>
    </ng-template>
  `,
  styles: `
    .bm-node { padding-left: 2px; border-left: 1px solid #eee; }
    .bm-filler-btn { font: 11px monospace; border: 0; background: transparent; padding: 0 2px; cursor: pointer; }
    .bm-leaf-btn, .bm-level-btn { font: 12px system-ui, sans-serif; }
    .bm-layout-shell, .bm-layout-inner { display: contents; }
  `,
})
export class NestComponent {
  readonly level = input.required<number>();
  readonly maxDepth = input.required<number>();
  readonly fillPerLevel = input.required<number>();

  protected readonly log = inject(ActionLog);
  protected readonly copy = inject(Copy);
  private readonly params = inject(BenchParams);

  protected readonly levelTargets = this.params.levelTargets;
  protected readonly wrapped = () => this.params.has('wrap');
  protected readonly reordered = () => this.params.has('reorder');
  protected readonly isLeafLevel = computed(() => this.level() >= this.maxDepth());

  protected readonly fillers = computed(() =>
    Array.from({ length: Math.max(0, this.fillPerLevel()) }, (_, i) => i),
  );

  protected readonly leafSpec = computed<BmTargetSpec>(() => ({
    kind: 'leaf',
    r: this.maxDepth(),
    label: 'open',
    variant: 0,
  }));

  protected readonly levelSpec = computed<BmTargetSpec>(() => ({
    kind: 'lvl',
    r: this.level(),
    label: 'edit',
    variant: this.level() % 3,
  }));
}
