import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { BENCH_ROUTES } from '../routes/home/home.component';
import { RICH_PARAMS } from '../core/ui';

/**
 * Root component for ?ui=rich. Bootstrapped instead of App, never alongside it,
 * so the default page has no shell at all.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatToolbarModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-toolbar class="rs-bar" color="primary">
      <a class="rs-brand" routerLink="/" [queryParams]="rich" data-testid="rich.home">Locator benchmark app</a>
      <nav class="rs-nav" aria-label="Routes">
        @for (r of routes; track r.path) {
          <a mat-button routerLink="/{{ r.path }}" [queryParams]="params(r.query)"
             routerLinkActive="rs-active" ariaCurrentWhenActive="page">{{ r.path }}</a>
        }
      </nav>
      <a mat-stroked-button class="rs-plain" [href]="plainHref()" data-testid="rich.plain"
         title="The same page without ?ui=rich: the DOM the benchmark measures">Benchmark DOM</a>
    </mat-toolbar>
    <main class="rs-main"><router-outlet /></main>
  `,
  // Unencapsulated so the font fix below reaches overlays too. Selectors are
  // prefixed and the sheet only exists when this shell is bootstrapped.
  encapsulation: ViewEncapsulation.None,
  styles: `
    /* The prebuilt theme names Roboto with no fallback, which renders serif on any
       machine without it. Same face where installed, a sans otherwise. */
    html {
      --rs-font: Roboto, system-ui, 'Segoe UI', sans-serif;
      --mat-sys-body-large-font: var(--rs-font); --mat-sys-body-medium-font: var(--rs-font); --mat-sys-body-small-font: var(--rs-font); --mat-sys-display-large-font: var(--rs-font); --mat-sys-display-medium-font: var(--rs-font); --mat-sys-display-small-font: var(--rs-font); --mat-sys-headline-large-font: var(--rs-font); --mat-sys-headline-medium-font: var(--rs-font); --mat-sys-headline-small-font: var(--rs-font); --mat-sys-label-large-font: var(--rs-font); --mat-sys-label-medium-font: var(--rs-font); --mat-sys-label-small-font: var(--rs-font); --mat-sys-title-large-font: var(--rs-font); --mat-sys-title-medium-font: var(--rs-font); --mat-sys-title-small-font: var(--rs-font);
    }
    app-root { display: block; min-height: 100vh; background: var(--mat-sys-surface-container-low, #f5f7fb);
      font-family: Roboto, system-ui, sans-serif; }
    .rs-bar.mat-toolbar { position: sticky; top: 0; z-index: 10; gap: 12px; overflow-x: auto;
      background: var(--mat-sys-primary, #005cbb); color: var(--mat-sys-on-primary, #fff); }
    .rs-brand { color: inherit; text-decoration: none; font-weight: 500; white-space: nowrap; }
    .rs-nav { display: flex; gap: 2px; flex: 1; }
    .rs-nav a.mat-mdc-button { color: inherit; opacity: .8; }
    .rs-nav a.mat-mdc-button.rs-active { opacity: 1; background: rgb(255 255 255 / .16); }
    .rs-plain { color: inherit !important; border-color: rgb(255 255 255 / .5) !important; white-space: nowrap; }
    .rs-main { padding: 24px; max-width: 1400px; margin: 0 auto; }
    @media (max-width: 700px) { .rs-main { padding: 12px; } }
  `,
})
export class RichShellComponent {
  private readonly router = inject(Router);
  protected readonly routes = BENCH_ROUTES;
  protected readonly rich = RICH_PARAMS;

  protected params(query: string): Record<string, string> {
    return { ...Object.fromEntries(new URLSearchParams(query)), ...RICH_PARAMS };
  }

  /** Current URL minus ?ui, as a full load so App is bootstrapped instead. */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** Current URL minus ?ui, relative to the base href, loaded in full so App is bootstrapped instead. */
  protected readonly plainHref = computed(() => {
    const tree = this.router.parseUrl(this.url());
    delete tree.queryParams['ui'];
    return './' + this.router.serializeUrl(tree).replace(/^\//, '');
  });
}
