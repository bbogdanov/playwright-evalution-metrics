import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ActionLog } from '../../core/action-log.service';
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
 */
@Component({
  selector: 'bm-nest',
  imports: [BmTargetDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bm-node" [class]="'bm-node--d' + level()" [attr.data-depth]="level()">
      @for (s of fillers(); track s) {
        <button type="button" class="bm-filler-btn"
                [attr.data-fill]="s"
                [attr.aria-label]="'Filler ' + level() + '.' + s"
                (click)="log.record('filler-' + level() + '-' + s)">f{{ level() }}.{{ s }}</button>
      }
      @if (level() < maxDepth()) {
        <bm-nest [level]="level() + 1" [maxDepth]="maxDepth()" [fillPerLevel]="fillPerLevel()" />
      } @else {
        <button type="button" class="bm-leaf-btn"
                [bmTarget]="leafSpec()"
                (click)="log.record('deep-leaf')">Deep leaf at depth {{ level() }}</button>
      }
    </div>
  `,
  styles: `
    .bm-node { padding-left: 2px; border-left: 1px solid #eee; }
    .bm-filler-btn { font: 11px monospace; border: 0; background: transparent; padding: 0 2px; cursor: pointer; }
    .bm-leaf-btn { font: 12px system-ui, sans-serif; }
  `,
})
export class NestComponent {
  readonly level = input.required<number>();
  readonly maxDepth = input.required<number>();
  readonly fillPerLevel = input.required<number>();

  protected readonly log = inject(ActionLog);

  protected readonly fillers = computed(() =>
    Array.from({ length: Math.max(0, this.fillPerLevel()) }, (_, i) => i),
  );

  protected readonly leafSpec = computed<BmTargetSpec>(() => ({
    kind: 'leaf',
    r: this.maxDepth(),
    label: 'open',
    variant: 0,
  }));
}
