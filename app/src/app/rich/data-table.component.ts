import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { SortDir, TableRow, queryRows } from './table-query';

export interface TableColumn {
  readonly key: string;
  readonly label: string;
}

/**
 * Sortable, filterable, paginated Material table over string rows.
 *
 * Sorting and filtering go through table-query.ts rather than MatTableDataSource:
 * the dataset's values are formatted strings ("$1,204.50", "38.2%"), which the
 * data source would sort as text, and keeping the logic in a pure function is
 * what lets it be tested without a browser.
 *
 * Test ids are prefixed with `testId`: .filter, .filter-column, .clear, .count,
 * .row, .empty, plus head.<column key> on every header.
 */
@Component({
  selector: 'bm-data-table',
  imports: [MatTableModule, MatSortModule, MatPaginatorModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dt-tools">
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="dt-filter">
        <mat-label>Filter</mat-label>
        <input matInput [value]="text()" (input)="setText($any($event.target).value)"
               [attr.data-testid]="testId() + '.filter'" placeholder="Type to filter rows" />
      </mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="dt-col">
        <mat-label>In column</mat-label>
        <mat-select [value]="column()" (selectionChange)="setColumn($event.value)"
                    [attr.data-testid]="testId() + '.filter-column'">
          <mat-option value="">All columns</mat-option>
          @for (c of columns(); track c.key) {
            <mat-option [value]="c.key">{{ c.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <button mat-button type="button" (click)="clear()" [disabled]="!text() && !column() && !sort().direction"
              [attr.data-testid]="testId() + '.clear'">Reset</button>
      <span class="dt-count" role="status" [attr.data-testid]="testId() + '.count'">{{ countText() }}</span>
    </div>

    <div class="dt-scroll">
      <table mat-table [dataSource]="pageRows()" matSort [matSortActive]="sort().active"
             [matSortDirection]="sort().direction" (matSortChange)="setSort($event)">
        @for (c of columns(); track c.key) {
          <ng-container [matColumnDef]="c.key">
            <th mat-header-cell *matHeaderCellDef [mat-sort-header]="c.key"
                [attr.data-testid]="testId() + '.head.' + c.key">{{ c.label }}</th>
            <td mat-cell *matCellDef="let row" [attr.data-col]="c.key">{{ row[c.key] }}</td>
          </ng-container>
        }
        <tr mat-header-row *matHeaderRowDef="keys(); sticky: true"></tr>
        <tr mat-row *matRowDef="let row; columns: keys()" [attr.data-testid]="testId() + '.row'"></tr>
        <tr class="mat-mdc-row" *matNoDataRow>
          <td class="dt-empty" [attr.colspan]="keys().length" [attr.data-testid]="testId() + '.empty'">
            No rows match "{{ text() }}"
          </td>
        </tr>
      </table>
    </div>

    <mat-paginator [length]="filtered().length" [pageIndex]="pageIndex()" [pageSize]="pageSize()"
                   [pageSizeOptions]="[10, 25, 50, 100, 500]" (page)="setPage($event)" showFirstLastButtons />
  `,
  styles: `
    :host { display: block; background: var(--mat-sys-surface, #fff); border-radius: 12px;
      box-shadow: 0 1px 3px rgb(0 0 0 / .12); overflow: hidden; }
    .dt-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 16px; }
    .dt-filter { flex: 1 1 240px; }
    .dt-col { flex: 0 1 200px; }
    .dt-count { margin-left: auto; color: var(--mat-sys-on-surface-variant, #555); font-size: 13px; }
    .dt-scroll { max-height: 70vh; overflow: auto; }
    table { width: 100%; }
    td[data-col] { font-variant-numeric: tabular-nums; white-space: nowrap; }
    .dt-empty { padding: 24px; text-align: center; color: var(--mat-sys-on-surface-variant, #555); }
  `,
})
export class DataTableComponent {
  readonly columns = input.required<readonly TableColumn[]>();
  readonly rows = input.required<readonly TableRow[]>();
  readonly testId = input('table');

  protected readonly text = signal('');
  protected readonly column = signal('');
  protected readonly sort = signal<{ active: string; direction: SortDir }>({ active: '', direction: '' });
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(25);

  protected readonly keys = computed(() => this.columns().map((c) => c.key));

  protected readonly filtered = computed(() =>
    queryRows(this.rows(), {
      text: this.text(), column: this.column(),
      sortKey: this.sort().active, sortDir: this.sort().direction,
    }),
  );

  protected readonly pageRows = computed(() => {
    const start = this.pageIndex() * this.pageSize();
    return this.filtered().slice(start, start + this.pageSize());
  });

  protected readonly countText = computed(() => {
    const n = this.filtered().length;
    const total = this.rows().length;
    if (!n) return `0 of ${total} rows`;
    const from = this.pageIndex() * this.pageSize() + 1;
    const to = Math.min(n, from + this.pageSize() - 1);
    return `${from}–${to} of ${n} rows` + (n < total ? ` (filtered from ${total})` : '');
  });

  protected setText(v: string): void { this.text.set(v); this.pageIndex.set(0); }
  protected setColumn(v: string): void { this.column.set(v); this.pageIndex.set(0); }
  protected setSort(s: Sort): void { this.sort.set({ active: s.direction ? s.active : '', direction: s.direction }); }
  protected setPage(e: PageEvent): void { this.pageIndex.set(e.pageIndex); this.pageSize.set(e.pageSize); }

  protected clear(): void {
    this.text.set('');
    this.column.set('');
    this.sort.set({ active: '', direction: '' });
    this.pageIndex.set(0);
  }
}
