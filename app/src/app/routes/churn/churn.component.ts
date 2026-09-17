import {
  ChangeDetectionStrategy, Component, DestroyRef, afterRenderEffect, computed, inject, signal,
} from '@angular/core';
import { BenchParams } from '../../core/bench-params.service';
import { Ready } from '../../core/ready.service';
import { ActionLog } from '../../core/action-log.service';
import { Copy } from '../../core/copy.service';
import { BmTargetDirective } from '../../shared/bm-target.directive';
import { BmTargetSpec } from '../../core/types';

interface ChurnItem {
  readonly id: number;
  /** Changes every tick. Tracking by this forces Angular to tear the row down. */
  readonly token: string;
  readonly value: string;
}

/**
 * Continuous re-render surface (S3) — the scenario that matters most.
 *
 * Playwright locators are lazy: they re-resolve on every actionability poll. A
 * page that never stops mutating therefore multiplies the per-query cost by the
 * number of retries, which is where selector choice stops being a rounding error.
 *
 * `?trackby=0` switches @for to an unstable track expression so every row is
 * destroyed and recreated each tick. That reproduces the classic "element is not
 * attached to the DOM" retry storm, which is an Angular authoring bug that shows
 * up as Playwright flake and gets blamed on Playwright.
 */
@Component({
  selector: 'bm-churn',
  imports: [BmTargetDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './churn.component.html',
  styles: `
    .bm-churn-page { padding: 12px; font: 13px system-ui, sans-serif; }
    .bm-status { font: 12px monospace; }
    .bm-churn__row { display: flex; gap: 8px; align-items: baseline; border-bottom: 1px solid #f0f0f0; }
    .bm-churn__cell { font: 12px monospace; border: 0; background: transparent; cursor: pointer; }
  `,
})
export class ChurnComponent {
  protected readonly params = inject(BenchParams);
  private readonly ready = inject(Ready);
  protected readonly copy = inject(Copy);
  protected readonly log = inject(ActionLog);

  protected readonly tick = signal(0);
  protected readonly trackBy = computed(() => this.params.trackBy());

  protected readonly items = computed<ChurnItem[]>(() => {
    const t = this.tick();
    return Array.from({ length: this.params.rows() }, (_, id) => ({
      id,
      token: `${id}-${t}`,
      value: `v${id}.${t}`,
    }));
  });

  constructor() {
    const hz = this.params.hz();
    if (hz > 0) {
      const handle = setInterval(() => this.tick.update((n) => n + 1), Math.round(1000 / hz));
      inject(DestroyRef).onDestroy(() => clearInterval(handle));
    }
  }

  protected spec(id: number): BmTargetSpec {
    return { kind: 'churn', r: id, label: 'edit', variant: id % 3 };
  }

  protected onClick(id: number): void {
    this.log.record(`churn-${id}`);
  }

  private readonly token = computed(() =>
    ['churn', this.params.rows(), this.params.hz(), this.trackBy() ? 'track' : 'notrack'].join(':'),
  );

  // Published once. The DOM never settles on this route by design, so readiness
  // means "first paint complete", not "quiescent".
  private readonly publishReady = afterRenderEffect(() => this.ready.set(this.token()));
}
