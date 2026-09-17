import {
  ChangeDetectionStrategy, Component, DestroyRef, afterRenderEffect, computed, inject, signal,
} from '@angular/core';
import { BenchParams } from '../../core/bench-params.service';
import { Ready } from '../../core/ready.service';
import { ActionLog } from '../../core/action-log.service';
import { BmTargetDirective } from '../../shared/bm-target.directive';
import { BmTargetSpec } from '../../core/types';

/**
 * Deferred-readiness surface (S4).
 *
 * Playwright's actionability loop has four distinct gates, and they do not cost
 * the same thing. `?lateMode=` picks which one blocks:
 *
 *   append  - the element does not exist yet; every poll pays a full failed query
 *             over the whole document.
 *   visible - the element exists but is display:none; each poll pays a query plus
 *             a visibility check that forces layout.
 *   enabled - the element exists and is visible but disabled; the query narrows
 *             immediately and only the enabled check re-runs.
 *   stable  - the element is mid-animation; each poll costs two bounding-box
 *             reads a frame apart.
 *
 * The distinction matters because "my test is slow waiting for X" has a different
 * fix in each case, and only one of them is about the locator.
 */
@Component({
  selector: 'bm-late',
  imports: [BmTargetDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './late.component.html',
  styleUrl: './late.component.scss',
})
export class LateComponent {
  protected readonly params = inject(BenchParams);
  private readonly ready = inject(Ready);
  protected readonly log = inject(ActionLog);

  /** Flips from false to true after `?delay=` milliseconds. */
  protected readonly arrived = signal(false);

  protected readonly mode = computed(() => this.params.lateMode());

  constructor() {
    const delay = this.params.delay();
    if (delay <= 0) {
      this.arrived.set(true);
    } else {
      const handle = setTimeout(() => this.arrived.set(true), delay);
      inject(DestroyRef).onDestroy(() => clearTimeout(handle));
    }
  }

  protected readonly spec: BmTargetSpec = { kind: 'late', r: 0, label: 'submit', variant: 0 };

  protected onClick(): void {
    this.log.record('late-target');
  }

  private readonly token = computed(() =>
    ['late', this.mode(), this.params.delay(), this.params.rows()].join(':'),
  );

  // Ready fires as soon as the surrounding page is painted. The target itself is
  // deliberately still absent or blocked at that point — that is the measurement.
  private readonly publishReady = afterRenderEffect(() => this.ready.set(this.token()));

  protected readonly filler = computed(() =>
    Array.from({ length: this.params.rows() }, (_, i) => i),
  );
}
