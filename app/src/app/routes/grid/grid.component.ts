import {
  ChangeDetectionStrategy, Component, afterRenderEffect, computed, inject,
} from '@angular/core';
import { BenchParams } from '../../core/bench-params.service';
import { Copy } from '../../core/copy.service';
import { ActionLog } from '../../core/action-log.service';
import { Ready } from '../../core/ready.service';
import { buildRows, columnKey } from '../../core/dataset';
import { BmTargetDirective } from '../../shared/bm-target.directive';
import { BmWrapComponent } from '../../shared/bm-wrap.component';
import { BmTargetSpec } from '../../core/types';

/**
 * S1/S2 workhorse: a flat, non-virtualised data grid whose node count is driven
 * entirely by `?rows=&cols=`.
 *
 * It is a native <table> on purpose. Implicit ARIA roles (table/row/columnheader/
 * cell) come for free and are genuine rather than hand-stamped, which keeps the
 * getByRole measurements honest — role resolution has to do real work here.
 */
@Component({
  selector: 'bm-grid',
  imports: [BmTargetDirective, BmWrapComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './grid.component.html',
  styleUrl: './grid.component.scss',
})
export class GridComponent {
  private readonly params = inject(BenchParams);
  private readonly ready = inject(Ready);
  protected readonly copy = inject(Copy);
  private readonly log = inject(ActionLog);

  protected readonly rows = computed(() =>
    buildRows(this.params.seed(), this.params.rows(), this.params.cols()),
  );

  /** DOM order of columns. `reorder` reverses it while data-col stays truthful. */
  protected readonly colOrder = computed(() => {
    const idx = Array.from({ length: this.params.cols() }, (_, c) => c);
    return this.params.has('reorder') ? idx.reverse() : idx;
  });

  protected readonly columnKey = columnKey;

  protected spec(r: number, c: number): BmTargetSpec {
    return { kind: 'cell', r, c, label: columnKey(c), variant: c % 3 };
  }

  protected rowSpec(r: number): BmTargetSpec {
    return { kind: 'row', r, label: 'rowLabel', variant: r % 3 };
  }

  protected onClick(id: string): void {
    this.log.record(id);
  }

  protected readonly lastClicked = this.log.last;
  protected readonly clickCount = this.log.count;

  private readonly token = computed(() =>
    [
      'grid', this.params.rows(), this.params.cols(), this.params.seed(),
      this.params.effectiveSalt(), [...this.params.mutations()].sort().join('+'),
    ].join(':'),
  );

  private readonly publishReady = afterRenderEffect(() => this.ready.set(this.token()));
}
