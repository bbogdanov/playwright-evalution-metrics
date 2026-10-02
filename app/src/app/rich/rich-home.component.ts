import { ChangeDetectionStrategy, Component, afterRenderEffect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { Ready } from '../core/ready.service';
import { RICH_PARAMS } from '../core/ui';
import { BENCH_ROUTES } from '../routes/home/home.component';

/** ?ui=rich index: one card per route, each linking the showcase and the measured DOM. */
@Component({
  selector: 'bm-rich-home',
  imports: [RouterLink, MatCardModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="rh-title">Playwright locator benchmark app</h1>
    <p class="rh-lead">
      Every route is a DOM-stress surface shaped by query parameters. This is the Material showcase
      (<code>?ui=rich</code>); <em>grid</em> and <em>deep</em> have dedicated rich pages, the others are
      shown as measured. <strong>Benchmark DOM</strong> opens the exact page the published numbers come from.
    </p>
    <div class="rh-cards">
      @for (r of routes; track r.path) {
        <mat-card appearance="outlined" [attr.data-testid]="'rich.route.' + r.path">
          <mat-card-header>
            <mat-card-title>/{{ r.path }}</mat-card-title>
            <mat-card-subtitle>{{ r.stresses }}</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content><code>?{{ r.query }}</code></mat-card-content>
          <mat-card-actions>
            <a mat-flat-button [routerLink]="'/' + r.path" [queryParams]="params(r.query)">Open</a>
            <a mat-button [href]="'./' + r.path + '?' + r.query">Benchmark DOM</a>
          </mat-card-actions>
        </mat-card>
      }
    </div>
  `,
  styles: `
    .rh-title { font: 400 32px/1.25 Roboto, system-ui, sans-serif; margin: 8px 0; }
    .rh-lead { max-width: 820px; color: var(--mat-sys-on-surface-variant, #555); line-height: 1.6; }
    .rh-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; margin-top: 24px; }
    mat-card { background: var(--mat-sys-surface, #fff); }
    mat-card-content { padding-top: 12px !important; word-break: break-all; }
  `,
})
export class RichHomeComponent {
  protected readonly routes = BENCH_ROUTES;
  protected params(query: string): Record<string, string> {
    return { ...Object.fromEntries(new URLSearchParams(query)), ...RICH_PARAMS };
  }
  private readonly ready = inject(Ready);
  private readonly publishReady = afterRenderEffect(() => this.ready.set('rich-home'));
}
