import { ChangeDetectionStrategy, Component, afterRenderEffect, computed, inject } from '@angular/core';
import { BenchParams } from '../../core/bench-params.service';
import { Ready } from '../../core/ready.service';
import { ActionLog } from '../../core/action-log.service';
import { Copy } from '../../core/copy.service';
import { COLUMN_KEYS } from '../../core/dataset';
import { BmTargetDirective } from '../../shared/bm-target.directive';
import { BmTargetSpec } from '../../core/types';

/**
 * Large form surface: the natural home of getByLabel and getByPlaceholder.
 *
 * Label association is the interesting cost here. `getByLabel` cannot just match
 * an attribute — it has to resolve the accessible name, which means following
 * for/id wiring, aria-labelledby chains and wrapping <label> ancestors. This
 * route provides all three association styles so the difference between them is
 * measurable rather than assumed.
 */
@Component({
  selector: 'bm-forms',
  imports: [BmTargetDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './forms.component.html',
  styleUrl: './forms.component.scss',
})
export class FormsComponent {
  protected readonly params = inject(BenchParams);
  private readonly ready = inject(Ready);
  protected readonly copy = inject(Copy);
  protected readonly log = inject(ActionLog);

  protected readonly fields = computed(() =>
    Array.from({ length: this.params.fields() }, (_, i) => i),
  );

  /** Rotates through the three ways an accessible name can be attached. */
  protected assoc(i: number): 'for' | 'wrapped' | 'labelledby' {
    return (['for', 'wrapped', 'labelledby'] as const)[i % 3];
  }

  protected key(i: number): string {
    return COLUMN_KEYS[i % COLUMN_KEYS.length];
  }

  protected labelText(i: number): string {
    return `${this.copy.t(this.key(i))} ${i}`;
  }

  /** Must match BmTargetDirective's id scheme so <label for> stays wired up. */
  protected fieldId(i: number): string {
    return `field-r${i}`;
  }

  protected spec(i: number): BmTargetSpec {
    return { kind: 'field', r: i, label: this.key(i), variant: i % 3 };
  }

  protected onInput(i: number): void {
    this.log.record(`field-${i}`);
  }

  private readonly token = computed(() =>
    ['forms', this.params.fields(), this.params.locale()].join(':'),
  );

  private readonly publishReady = afterRenderEffect(() => this.ready.set(this.token()));
}
