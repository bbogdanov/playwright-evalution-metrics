import { ChangeDetectionStrategy, Component, afterRenderEffect, computed, inject } from '@angular/core';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { BenchParams } from '../../core/bench-params.service';
import { Ready } from '../../core/ready.service';
import { ActionLog } from '../../core/action-log.service';
import { BmTargetDirective } from '../../shared/bm-target.directive';
import { BmTargetSpec } from '../../core/types';

/**
 * Virtual scrolling surface (S9).
 *
 * This is the case where locator choice is not the problem at all: the target row
 * is not in the DOM, so every strategy fails identically until something scrolls
 * the viewport. It is included precisely because it is the most common source of
 * "my data-testid locator is flaky" reports, and the measurement should show that
 * the fix is a scroll, not a different selector.
 *
 * The route also renders a non-virtual control list of identical content behind
 * `?virtual=0`, so the cost of finding row N with and without virtualisation can
 * be compared directly.
 */
@Component({
  selector: 'bm-virtual',
  imports: [ScrollingModule, BmTargetDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './virtual.component.html',
  styleUrl: './virtual.component.scss',
})
export class VirtualComponent {
  protected readonly params = inject(BenchParams);
  private readonly ready = inject(Ready);
  protected readonly log = inject(ActionLog);

  protected readonly virtual = computed(
    () => new URLSearchParams(location.search).get('virtual') !== '0',
  );

  protected readonly items = computed(() =>
    Array.from({ length: this.params.rows() }, (_, i) => i),
  );

  protected readonly itemSize = 24;

  protected spec(i: number): BmTargetSpec {
    return { kind: 'vrow', r: i, label: 'open', variant: i % 3 };
  }

  protected onClick(i: number): void {
    this.log.record(`vrow-${i}`);
  }

  private readonly token = computed(() =>
    ['virtual', this.virtual() ? 'on' : 'off', this.params.rows()].join(':'),
  );

  private readonly publishReady = afterRenderEffect(() => this.ready.set(this.token()));
}
