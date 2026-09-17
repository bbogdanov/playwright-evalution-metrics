import { ChangeDetectionStrategy, Component, afterRenderEffect, computed, inject } from '@angular/core';
import { BenchParams } from '../../core/bench-params.service';
import { Ready } from '../../core/ready.service';
import { ActionLog } from '../../core/action-log.service';
import { Copy } from '../../core/copy.service';
import { BmTargetDirective } from '../../shared/bm-target.directive';
import { BmTargetSpec } from '../../core/types';

/**
 * Ambiguity and scoping surface (S5, and the scoping axis of S1).
 *
 * `?dup=N` renders N structurally identical cards. Every card carries the same
 * semantic class, the same variant class, the same visible text and the same
 * accessible name. Only the identity attributes — id, test id, data-qa — and the
 * card's own test id differ.
 *
 * Two things fall out of that, and both are the point:
 *
 *  1. Strict mode. A class or text or role locator written against one card
 *     silently matches N of them. This is how a locator that passed review in a
 *     10-row fixture fails in production data, and it is a correctness failure,
 *     not a slow one.
 *  2. Scoping. `getByTestId('card.500').getByRole('button')` and
 *     `getByRole('button').nth(500)` reach the same node by very different
 *     amounts of work. Scoping is the one locator optimisation that is expected
 *     to pay for itself, and this route is where that gets measured.
 */
@Component({
  selector: 'bm-ambiguous',
  imports: [BmTargetDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ambiguous.component.html',
  styleUrl: './ambiguous.component.scss',
})
export class AmbiguousComponent {
  protected readonly params = inject(BenchParams);
  private readonly ready = inject(Ready);
  protected readonly copy = inject(Copy);
  protected readonly log = inject(ActionLog);

  protected readonly cards = computed(() =>
    Array.from({ length: Math.max(1, this.params.decoys()) }, (_, i) => i),
  );

  /** Index of the card that owns the canonical, uniquely addressable target. */
  protected readonly targetCard = computed(() => {
    const explicit = this.params.targetIndex();
    const n = this.cards().length;
    return explicit >= 0 ? Math.min(explicit, n - 1) : Math.floor(n / 2);
  });

  protected spec(i: number): BmTargetSpec {
    return { kind: 'action', r: i, label: 'open', variant: 0 };
  }

  protected onClick(i: number): void {
    this.log.record(`action-${i}`);
  }

  private readonly token = computed(() =>
    ['ambiguous', this.cards().length, this.targetCard(), this.params.locale()].join(':'),
  );

  private readonly publishReady = afterRenderEffect(() => this.ready.set(this.token()));
}
