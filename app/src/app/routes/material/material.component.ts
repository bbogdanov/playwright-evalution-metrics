import { ChangeDetectionStrategy, Component, afterRenderEffect, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { BenchParams } from '../../core/bench-params.service';
import { Ready } from '../../core/ready.service';
import { ActionLog } from '../../core/action-log.service';
import { Copy } from '../../core/copy.service';
import { buildRows, columnKey } from '../../core/dataset';
import { TargetDialogComponent } from './target-dialog.component';

/**
 * Overlay and portal surface (S8).
 *
 * Every component here renders part of itself outside its own subtree:
 * mat-select's panel, mat-menu's panel and mat-dialog's body are all projected
 * into the CDK overlay container appended to <body>.
 *
 * That breaks the single piece of locator advice everyone agrees on — "scope your
 * locator to a container" — because the container is not an ancestor of the thing
 * being scoped to. Measuring how each strategy copes here is more useful than any
 * amount of query-time microbenchmarking, because this failure mode costs a full
 * timeout rather than a millisecond.
 *
 * Material components also produce genuinely deep DOM with genuine ARIA roles,
 * which keeps the getByRole numbers from being an artefact of hand-stamped markup.
 */
@Component({
  selector: 'bm-material',
  imports: [
    MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatMenuModule, MatSelectModule, MatTableModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './material.component.html',
  styleUrl: './material.component.scss',
})
export class MaterialComponent {
  protected readonly params = inject(BenchParams);
  private readonly ready = inject(Ready);
  private readonly dialog = inject(MatDialog);
  protected readonly copy = inject(Copy);
  protected readonly log = inject(ActionLog);

  protected readonly cards = computed(() =>
    Array.from({ length: Math.max(1, this.params.decoys() || 20) }, (_, i) => i),
  );

  protected readonly optionCount = computed(() => Math.max(2, this.params.cols() * 4));

  protected readonly options = computed(() =>
    Array.from({ length: this.optionCount() }, (_, i) => ({ i, key: columnKey(i) })),
  );

  protected readonly tableRows = computed(() =>
    buildRows(this.params.seed(), Math.min(this.params.rows(), 2_000), 4),
  );

  protected readonly displayedColumns = ['r', 'c0', 'c1', 'c2'];

  protected columnKeyFor(c: number): string {
    return columnKey(c);
  }

  protected openDialog(): void {
    this.dialog.open(TargetDialogComponent, { data: {}, width: '420px' });
  }

  protected record(id: string): void {
    this.log.record(id);
  }

  private readonly token = computed(() =>
    ['material', this.cards().length, this.optionCount(), this.tableRows().length].join(':'),
  );

  private readonly publishReady = afterRenderEffect(() => this.ready.set(this.token()));
}
