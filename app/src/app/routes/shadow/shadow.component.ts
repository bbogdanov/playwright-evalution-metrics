import { ChangeDetectionStrategy, Component, afterRenderEffect, computed, inject } from '@angular/core';
import { BenchParams } from '../../core/bench-params.service';
import { Ready } from '../../core/ready.service';
import { ActionLog } from '../../core/action-log.service';
import { BoxEmulatedComponent, BoxNoneComponent, BoxShadowComponent } from './payload';

/**
 * Encapsulation surface (S7).
 *
 * Exactly one payload is rendered per page load, selected by `?enc=`, so all three
 * variants produce the same element count and the comparison is like-for-like.
 * Rendering all three at once would triple the DOM and make every measurement a
 * measurement of the other two.
 */
@Component({
  selector: 'bm-shadow',
  imports: [BoxEmulatedComponent, BoxShadowComponent, BoxNoneComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="bm-shadow-page">
      <h1>Encapsulation: {{ enc() }}</h1>
      <p class="bm-status">
        mode: <span data-testid="status.encapsulation">{{ enc() }}</span>
        / last: <span data-testid="status.last-clicked.value">{{ log.last() }}</span>
      </p>
      <div class="bm-shadow-host" data-testid="shadow.host">
        @switch (enc()) {
          @case ('shadow') { <bm-box-shadow [rows]="rows()" [cols]="cols()" /> }
          @case ('none') { <bm-box-none [rows]="rows()" [cols]="cols()" /> }
          @default { <bm-box-emulated [rows]="rows()" [cols]="cols()" /> }
        }
      </div>
    </section>
  `,
  styles: `
    .bm-shadow-page { padding: 12px; font: 13px system-ui, sans-serif; }
    .bm-status { font: 12px monospace; }
  `,
})
export class ShadowComponent {
  private readonly params = inject(BenchParams);
  private readonly ready = inject(Ready);
  protected readonly log = inject(ActionLog);

  protected readonly enc = computed(() => {
    const raw = new URLSearchParams(location.search).get('enc') ?? 'emulated';
    return (['emulated', 'shadow', 'none'] as const).includes(raw as never) ? raw : 'emulated';
  });

  protected readonly rows = computed(() => this.params.rows());
  protected readonly cols = computed(() => this.params.cols());

  private readonly token = computed(() => ['shadow', this.enc(), this.rows(), this.cols()].join(':'));
  private readonly publishReady = afterRenderEffect(() => this.ready.set(this.token()));
}
