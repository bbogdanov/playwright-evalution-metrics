import { ChangeDetectionStrategy, Component, afterRenderEffect, computed, inject } from '@angular/core';
import { BenchParams } from '../core/bench-params.service';
import { Copy } from '../core/copy.service';
import { Ready } from '../core/ready.service';
import { buildRows, columnKey } from '../core/dataset';
import { DataTableComponent, TableColumn } from './data-table.component';
import { TableRow } from './table-query';

/** ?ui=rich variant of /grid: the same seeded dataset in a sortable, filterable Material table. */
@Component({
  selector: 'bm-rich-grid',
  imports: [DataTableComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="rg-head">
      <h1>Data grid</h1>
      <p>{{ rows().length }} rows × {{ params.cols() }} columns, seed <code>{{ params.seed() }}</code>.
        Click a header to sort; numbers, currency, percentages and dates sort by value.</p>
    </header>
    <bm-data-table testId="grid" [columns]="columns()" [rows]="rows()" />
  `,
  styles: `
    .rg-head h1 { margin: 0 0 4px; font: 400 28px/1.3 Roboto, system-ui, sans-serif; }
    .rg-head p { margin: 0 0 16px; color: var(--mat-sys-on-surface-variant, #555); }
  `,
})
export class RichGridComponent {
  protected readonly params = inject(BenchParams);
  private readonly copy = inject(Copy);
  private readonly ready = inject(Ready);

  protected readonly columns = computed<TableColumn[]>(() => [
    { key: 'r', label: '#' },
    // Not 'Status': dataset column 2 already carries that label.
    { key: 'status', label: 'State' },
    ...Array.from({ length: this.params.cols() }, (_, c) => ({ key: `c${c}`, label: this.copy.t(columnKey(c)) })),
  ]);

  protected readonly rows = computed<TableRow[]>(() =>
    buildRows(this.params.seed(), this.params.rows(), this.params.cols()).map((row) => ({
      r: String(row.r),
      status: this.copy.t(row.statusKey),
      ...Object.fromEntries(row.values.map((v, c) => [`c${c}`, v])),
    })),
  );

  private readonly publishReady = afterRenderEffect(() =>
    this.ready.set(`rich-grid:${this.params.rows()}:${this.params.cols()}:${this.params.seed()}`));
}
