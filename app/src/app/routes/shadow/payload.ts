import {
  ChangeDetectionStrategy, Component, Directive, ViewEncapsulation, computed, inject, input,
} from '@angular/core';
import { ActionLog } from '../../core/action-log.service';
import { BmTargetDirective } from '../../shared/bm-target.directive';
import { BmTargetSpec } from '../../core/types';

/**
 * One template, three encapsulation modes.
 *
 * Holding the markup byte-identical across the three components is what makes the
 * comparison valid: any timing difference is attributable to encapsulation alone,
 * not to the payload. The three modes differ in ways that matter to locators:
 *
 *   Emulated - Angular's default. Adds _ngcontent-* attributes to every element,
 *              inflating attribute count on every node the engine inspects.
 *   ShadowDom - real shadow roots. Playwright's CSS and text engines pierce open
 *              shadow roots; XPath does not, and native document.querySelector
 *              does not either. This is the one encapsulation choice that can make
 *              a whole locator family simply stop working.
 *   None     - no scoping attributes at all; the lightest DOM of the three.
 */
const PAYLOAD_TEMPLATE = `
  <div class="bm-box" data-testid="box.root">
    @for (r of rowIdx(); track r) {
      <div class="bm-box__row" [attr.data-row]="r">
        @for (c of colIdx(); track c) {
          <button type="button" class="bm-box__cell" [bmTarget]="spec(r, c)"
                  (click)="onClick(r, c)">e{{ r }}.{{ c }}</button>
        }
      </div>
    }
  </div>
`;

const PAYLOAD_STYLES = `
  .bm-box__row { display: flex; gap: 2px; }
  .bm-box__cell { font: 11px monospace; border: 1px solid #ddd; background: #fff; cursor: pointer; }
`;

@Directive()
abstract class PayloadBase {
  readonly rows = input.required<number>();
  readonly cols = input.required<number>();

  protected readonly log = inject(ActionLog);

  protected readonly rowIdx = computed(() => Array.from({ length: this.rows() }, (_, i) => i));
  protected readonly colIdx = computed(() => Array.from({ length: this.cols() }, (_, i) => i));

  protected spec(r: number, c: number): BmTargetSpec {
    return { kind: 'boxcell', r, c, label: 'open', variant: c % 3 };
  }

  protected onClick(r: number, c: number): void {
    this.log.record(`boxcell-${r}-${c}`);
  }
}

@Component({
  selector: 'bm-box-emulated',
  imports: [BmTargetDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.Emulated,
  template: PAYLOAD_TEMPLATE,
  styles: PAYLOAD_STYLES,
})
export class BoxEmulatedComponent extends PayloadBase {}

@Component({
  selector: 'bm-box-shadow',
  imports: [BmTargetDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom,
  template: PAYLOAD_TEMPLATE,
  styles: PAYLOAD_STYLES,
})
export class BoxShadowComponent extends PayloadBase {}

@Component({
  selector: 'bm-box-none',
  imports: [BmTargetDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: PAYLOAD_TEMPLATE,
  styles: PAYLOAD_STYLES,
})
export class BoxNoneComponent extends PayloadBase {}
