import { ChangeDetectionStrategy, Component, afterRenderEffect, computed, inject } from '@angular/core';
import { BenchParams } from '../../core/bench-params.service';
import { Ready } from '../../core/ready.service';
import { ActionLog } from '../../core/action-log.service';
import { NestComponent } from './nest.component';

/**
 * Nesting-depth surface for S1/S2.
 *
 * Depth is the variable that separates locator families that care about ancestry
 * (structural CSS chains, absolute XPath, chained .locator() calls) from those
 * that do not (id, test id, role). A single flat grid cannot expose that
 * difference; this route can, at depths up to 60.
 */
@Component({
  selector: 'bm-deep',
  imports: [NestComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="bm-deep-page">
      <h1>Nesting depth {{ depth() }} / {{ fillPerLevel() }} fillers per level</h1>
      <p class="bm-status" data-testid="status.last-clicked">
        last: <span data-testid="status.last-clicked.value">{{ log.last() }}</span>
      </p>
      <div class="bm-deep-root" data-testid="deep.root">
        <bm-nest [level]="0" [maxDepth]="depth()" [fillPerLevel]="fillPerLevel()" />
      </div>
    </section>
  `,
  styles: `
    .bm-deep-page { padding: 12px; font: 13px system-ui, sans-serif; }
    .bm-status { font: 12px monospace; }
  `,
})
export class DeepComponent {
  private readonly params = inject(BenchParams);
  private readonly ready = inject(Ready);
  protected readonly log = inject(ActionLog);

  protected readonly depth = computed(() => this.params.depth());

  /**
   * Fillers per level, derived from a total.
   *
   * Driving the total rather than the per-level count is what makes the depth
   * sweep valid: depth 5 with 1,200 fillers per level and depth 50 with 120 per
   * level produce the same element count, so any difference in query cost is
   * attributable to depth rather than to page size.
   */
  protected readonly fillPerLevel = computed(() =>
    Math.max(0, Math.round(this.params.fill() / Math.max(1, this.depth()))),
  );

  private readonly token = computed(() =>
    ['deep', this.depth(), this.params.fill(), [...this.params.mutations()].sort().join('+')].join(':'),
  );

  private readonly publishReady = afterRenderEffect(() => this.ready.set(this.token()));
}
