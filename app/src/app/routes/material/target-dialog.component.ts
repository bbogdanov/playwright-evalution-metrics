import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { ActionLog } from '../../core/action-log.service';
import { BmTargetDirective } from '../../shared/bm-target.directive';
import { BmTargetSpec } from '../../core/types';

/**
 * Dialog body. Rendered into the CDK overlay container at <body> level, which is
 * the whole point: it is a DOM sibling of the app root, not a descendant of the
 * component that opened it.
 */
@Component({
  selector: 'bm-target-dialog',
  imports: [MatButtonModule, BmTargetDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title data-testid="dialog.title">Confirm action</h2>
    <div mat-dialog-content data-testid="dialog.content">
      <p>This dialog lives in the overlay container, not in the component tree.</p>
      <button mat-flat-button type="button" [bmTarget]="spec" (click)="confirm()">Approve</button>
    </div>
  `,
})
export class TargetDialogComponent {
  private readonly ref = inject(MatDialogRef<TargetDialogComponent>);
  private readonly log = inject(ActionLog);

  protected readonly spec: BmTargetSpec = { kind: 'dialogbtn', r: 0, label: 'approve', variant: 0 };

  protected confirm(): void {
    this.log.record('dialog-approve');
    this.ref.close('approved');
  }
}
