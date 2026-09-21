import { ChangeDetectionStrategy, Component, afterRenderEffect, computed, inject } from '@angular/core';
import { BenchParams } from '../../core/bench-params.service';
import { Ready } from '../../core/ready.service';
import { ActionLog } from '../../core/action-log.service';

/**
 * Accessibility surface.
 *
 * Every other route in this project exists to make locators slow. This one exists
 * to show what the slow ones buy you.
 *
 * `?defects=1` breaks four things that automated accessibility tooling detects
 * and that a test-id-based test cannot see at all: an icon-only control with no
 * accessible name, an input with no associated label, an image with no alt text,
 * and text below the contrast threshold. Every control keeps its data-testid in
 * both modes, which is the point - a suite addressing elements by test id stays
 * green while the interface becomes unusable with a screen reader.
 *
 * The same markup with `?defects=0` is the corrected version, so a scenario can
 * assert the difference rather than assert an absolute.
 */
@Component({
  selector: 'bm-a11y',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './a11y.component.html',
  styleUrl: './a11y.component.scss',
})
export class A11yComponent {
  private readonly params = inject(BenchParams);
  private readonly ready = inject(Ready);
  protected readonly log = inject(ActionLog);

  /** Whether the deliberate defects are present. */
  protected readonly defects = computed(
    () => new URLSearchParams(location.search).get('defects') === '1',
  );

  /** Repeats the control set, so role-based lookups can be timed at a realistic size. */
  protected readonly rows = computed(() =>
    Array.from({ length: Math.max(1, this.params.rows()) }, (_, i) => i),
  );

  protected record(id: string): void {
    this.log.record(id);
  }

  private readonly token = computed(() =>
    ['a11y', this.defects() ? 'defects' : 'clean', this.rows().length].join(':'),
  );

  private readonly publishReady = afterRenderEffect(() => this.ready.set(this.token()));
}
