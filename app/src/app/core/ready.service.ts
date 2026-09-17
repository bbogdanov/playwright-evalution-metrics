import { Injectable, inject } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs';

/**
 * Render-completion signalling.
 *
 * Waiting on `networkidle` or `domcontentloaded` is useless here: a 40,000-node
 * grid finishes loading long before it finishes rendering, and timing a locator
 * against a half-built DOM produces numbers that mean nothing. Every route
 * publishes an explicit readiness token on <html> once its render has flushed,
 * and the Playwright fixture blocks on that token before taking a measurement.
 */
@Injectable({ providedIn: 'root' })
export class Ready {
  static readonly ATTR = 'data-bm-ready';
  static readonly RENDER_MS_ATTR = 'data-bm-render-ms';

  private startedAt = performance.now();

  constructor() {
    inject(Router).events
      .pipe(filter((e): e is NavigationStart => e instanceof NavigationStart))
      .subscribe(() => this.clear());
  }

  clear(): void {
    this.startedAt = performance.now();
    document.documentElement.removeAttribute(Ready.ATTR);
    document.documentElement.removeAttribute(Ready.RENDER_MS_ATTR);
  }

  /** Called from an afterRenderEffect so the DOM is guaranteed to be flushed. */
  set(token: string): void {
    const el = document.documentElement;
    if (el.getAttribute(Ready.ATTR) === token) return;
    el.setAttribute(Ready.RENDER_MS_ATTR, (performance.now() - this.startedAt).toFixed(1));
    el.setAttribute(Ready.ATTR, token);
  }

  /** Re-arms the token so a subsequent render can be awaited again. */
  invalidate(): void {
    this.startedAt = performance.now();
    document.documentElement.removeAttribute(Ready.ATTR);
  }
}
