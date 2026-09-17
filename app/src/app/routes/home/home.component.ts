import { ChangeDetectionStrategy, Component, afterRenderEffect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Ready } from '../../core/ready.service';

interface RouteInfo {
  readonly path: string;
  readonly query: string;
  readonly stresses: string;
}

/** Human-facing index. Not itself a benchmark surface. */
@Component({
  selector: 'bm-home',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="bm-home">
      <h1>Playwright locator benchmark app</h1>
      <p>
        Each route below is a controlled DOM-stress surface. Shape is driven entirely by
        query parameters, so scenarios never need a rebuild to change the page under test.
      </p>
      <table class="bm-home__routes">
        <thead><tr><th>Route</th><th>Default query</th><th>Stresses</th></tr></thead>
        <tbody>
          @for (r of routes; track r.path) {
            <tr>
              <td><a [routerLink]="'/' + r.path" [queryParams]="parse(r.query)">/{{ r.path }}</a></td>
              <td><code>{{ r.query }}</code></td>
              <td>{{ r.stresses }}</td>
            </tr>
          }
        </tbody>
      </table>
      <h2>Global mutation flags</h2>
      <p><code>?mutate=locale,classHash,wrap,reorder,reword,attrRename,classRename</code> (comma separated)</p>
    </main>
  `,
  styles: `
    .bm-home { font: 14px/1.5 system-ui, sans-serif; padding: 24px; max-width: 900px; }
    .bm-home__routes { border-collapse: collapse; width: 100%; }
    .bm-home__routes th, .bm-home__routes td { text-align: left; border-bottom: 1px solid #ddd; padding: 6px 8px; vertical-align: top; }
    code { background: #f4f4f4; padding: 1px 4px; }
  `,
})
export class HomeComponent {
  private readonly ready = inject(Ready);

  protected readonly routes: RouteInfo[] = [
    { path: 'grid', query: 'rows=200&cols=8', stresses: 'Flat DOM scale, native table roles (S1, S2)' },
    { path: 'deep', query: 'depth=30&fill=6000', stresses: 'Depth at fixed element count (S12)' },
    { path: 'churn', query: 'rows=300&hz=30&trackby=1', stresses: 'Re-resolution under continuous re-render (S3)' },
    { path: 'late', query: 'delay=800&lateMode=append&rows=400', stresses: 'Actionability gates and polling cost (S4)' },
    { path: 'ambiguous', query: 'dup=400', stresses: 'Strict-mode collisions and scoping (S5)' },
    { path: 'forms', query: 'fields=300', stresses: 'Label/placeholder association cost (S1)' },
    { path: 'shadow', query: 'enc=shadow&rows=60&cols=8', stresses: 'Shadow DOM piercing, encapsulation cost (S7)' },
    { path: 'virtual', query: 'rows=20000&virtual=1', stresses: 'Target not in DOM, scroll-and-retry (S9)' },
    { path: 'material', query: 'dup=30&cols=6&rows=200', stresses: 'CDK overlays and portals, real ARIA roles (S8)' },
  ];

  protected parse(query: string): Record<string, string> {
    return Object.fromEntries(new URLSearchParams(query).entries());
  }

  private readonly publishReady = afterRenderEffect(() => this.ready.set('home'));
}
