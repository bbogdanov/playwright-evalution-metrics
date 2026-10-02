import {
  ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, inject, signal, viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatSliderModule } from '@angular/material/slider';
import { BenchParams } from '../core/bench-params.service';
import { Ready } from '../core/ready.service';
import { buildTree } from './deep-tree';
import { RichNodeComponent } from './rich-node.component';

interface Knob { key: 'depth' | 'breadth' | 'items' | 'nodes'; label: string; min: number; max: number; step: number }

const KNOBS: Knob[] = [
  { key: 'depth', label: 'Depth', min: 1, max: 60, step: 1 },
  { key: 'breadth', label: 'Children per node', min: 1, max: 8, step: 1 },
  { key: 'items', label: 'Elements per node', min: 0, max: 24, step: 1 },
  { key: 'nodes', label: 'Node budget', min: 10, max: 5000, step: 10 },
];

const PRESETS = [
  { label: 'Balanced', q: { depth: 6, breadth: 3, items: 3, nodes: 400 } },
  { label: 'Spine 50', q: { depth: 50, breadth: 1, items: 2, nodes: 60 } },
  { label: 'Wide', q: { depth: 3, breadth: 8, items: 4, nodes: 600 } },
  { label: 'Heavy', q: { depth: 12, breadth: 2, items: 8, nodes: 2000 } },
];

/**
 * ?ui=rich variant of /deep: a tree generated from depth, breadth, items and a
 * node budget in the URL. The knobs rewrite the URL rather than local state, so
 * every shape is a shareable link and a test can drive it with page.goto.
 */
@Component({
  selector: 'bm-rich-deep',
  imports: [MatCardModule, MatButtonModule, MatSliderModule, RichNodeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="rd-title">Generated nesting</h1>
    <mat-card appearance="outlined" class="rd-panel">
      <div class="rd-knobs">
        @for (k of knobs; track k.key) {
          <label class="rd-knob">
            <span>{{ k.label }} <strong [attr.data-testid]="'deep.knob.' + k.key">{{ draft()[k.key] }}</strong></span>
            <mat-slider [min]="k.min" [max]="k.max" [step]="k.step" discrete>
              <input matSliderThumb [value]="draft()[k.key]" (valueChange)="setDraft(k.key, $event)"
                     [attr.aria-label]="k.label" />
            </mat-slider>
          </label>
        }
      </div>
      <div class="rd-actions">
        <button mat-flat-button type="button" (click)="apply(draft())" data-testid="deep.generate">Generate</button>
        @for (p of presets; track p.label) {
          <button mat-stroked-button type="button" (click)="apply(p.q)">{{ p.label }}</button>
        }
      </div>
      <dl class="rd-stats" data-testid="deep.stats">
        <div><dt>Nodes</dt><dd data-testid="deep.stats.nodes">{{ tree().stats.nodes }}</dd></div>
        <div><dt>Uncapped tree</dt><dd>{{ uncapped() }}</dd></div>
        <div><dt>Deepest level</dt><dd data-testid="deep.stats.level">{{ tree().stats.maxLevel }}</dd></div>
        <div><dt>Generated elements</dt><dd data-testid="deep.stats.items">{{ tree().stats.items }}</dd></div>
        <div><dt>DOM elements</dt><dd data-testid="deep.stats.dom">{{ domCount() }}</dd></div>
      </dl>
      @if (tree().stats.nodes < tree().stats.uncapped) {
        <p class="rd-note">Cut at the node budget: the full depth is generated first, then levels fill breadth-first.</p>
      }
    </mat-card>
    <div class="rd-tree" #treeRoot data-testid="deep.tree"><bm-rich-node [node]="tree().root" /></div>
  `,
  styles: `
    .rd-title { font: 400 28px/1.3 Roboto, system-ui, sans-serif; margin: 0 0 16px; }
    .rd-panel { padding: 16px; background: var(--mat-sys-surface, #fff); }
    .rd-knobs { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 4px 24px; }
    .rd-knob { display: flex; flex-direction: column; font-size: 13px; }
    .rd-knob mat-slider { width: 100%; }
    .rd-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 16px; }
    .rd-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin: 0; }
    .rd-stats div { background: var(--mat-sys-surface-container, #eef2f8); border-radius: 10px; padding: 10px 14px; }
    .rd-stats dt { font-size: 12px; color: var(--mat-sys-on-surface-variant, #555); }
    .rd-stats dd { margin: 2px 0 0; font: 500 22px Roboto, system-ui, sans-serif; font-variant-numeric: tabular-nums; }
    .rd-note { font-size: 12px; color: var(--mat-sys-on-surface-variant, #555); margin: 12px 0 0; }
    .rd-tree { overflow-x: auto; padding-bottom: 24px; }
  `,
})
export class RichDeepComponent {
  private readonly params = inject(BenchParams);
  private readonly router = inject(Router);
  private readonly ready = inject(Ready);
  private readonly treeRoot = viewChild.required<ElementRef<HTMLElement>>('treeRoot');

  protected readonly knobs = KNOBS;
  protected readonly presets = PRESETS;

  private readonly shape = computed(() => ({
    depth: this.params.depth(), breadth: this.params.breadth(),
    items: this.params.items(), nodes: this.params.nodes(),
  }));

  protected readonly tree = computed(() => buildTree(this.params.seed(), this.shape()));
  protected readonly uncapped = computed(() => {
    const u = this.tree().stats.uncapped;
    return u >= 1e12 ? '> 10¹²' : u.toLocaleString('en');
  });

  /** Slider positions not yet applied; reset whenever the URL changes. */
  private readonly edits = signal<Partial<Record<Knob['key'], number>>>({});
  protected readonly draft = computed(() => ({ ...this.shape(), ...this.edits() }));

  protected readonly domCount = signal(0);

  protected setDraft(key: Knob['key'], value: number): void {
    this.edits.update((e) => ({ ...e, [key]: value }));
  }

  protected apply(q: Record<string, number>): void {
    this.edits.set({});
    void this.router.navigate([], { queryParams: q, queryParamsHandling: 'merge' });
  }

  private readonly publish = afterRenderEffect(() => {
    const s = this.shape();
    this.domCount.set(this.treeRoot().nativeElement.querySelectorAll('*').length);
    this.ready.set(`rich-deep:${s.depth}:${s.breadth}:${s.items}:${s.nodes}:${this.params.seed()}`);
  });
}
