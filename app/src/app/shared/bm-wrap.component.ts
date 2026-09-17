import { ChangeDetectionStrategy, Component, TemplateRef, contentChild, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { BenchParams } from '../core/bench-params.service';

/**
 * Inserts two extra wrapper elements when the `wrap` mutation is active.
 *
 * This is the single cheapest way to simulate the most common real-world cause of
 * locator breakage: someone adds a layout div. Attribute and role locators are
 * unaffected; structural CSS chains and absolute XPath are not.
 *
 * Content is passed as an <ng-template> rather than projected, because Angular
 * only fills the first matching <ng-content> and we need the same content in two
 * structurally different branches.
 */
@Component({
  selector: 'bm-wrap',
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (wrapped()) {
      <div class="bm-layout-shell">
        <div class="bm-layout-inner">
          <ng-container [ngTemplateOutlet]="tpl()!" />
        </div>
      </div>
    } @else {
      <ng-container [ngTemplateOutlet]="tpl()!" />
    }
  `,
  styles: `:host, .bm-layout-shell, .bm-layout-inner { display: contents; }`,
})
export class BmWrapComponent {
  readonly tpl = contentChild(TemplateRef<unknown>);
  private readonly params = inject(BenchParams);
  readonly wrapped = () => this.params.has('wrap');
}
