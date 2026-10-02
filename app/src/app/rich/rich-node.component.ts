import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatBadgeModule } from '@angular/material/badge';
import { TreeNode } from './deep-tree';

/** One generated node: a Material card with its items, then its children. Recursive through its own selector. */
@Component({
  selector: 'bm-rich-node',
  imports: [MatButtonModule, MatChipsModule, MatCheckboxModule, MatProgressBarModule, MatSlideToggleModule, MatBadgeModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let n = node();
    <article class="rn" [style.--hue]="(n.level * 37) % 360" [attr.data-testid]="'deep.node.' + n.id"
             [attr.data-level]="n.level" [id]="'node-' + n.id">
      <header class="rn-head">
        <span class="rn-avatar" aria-hidden="true">{{ n.level }}</span>
        <div class="rn-titles">
          <h3 class="rn-title">{{ n.title }}</h3>
          <span class="rn-sub">{{ n.kind }} · level {{ n.level }} · <code>{{ n.id }}</code></span>
        </div>
        <span class="rn-state rn-state--{{ n.state }}">{{ n.state }}</span>
        @if (n.children.length) {
          <button mat-icon-button type="button" class="rn-toggle" (click)="open.set(!open())"
                  [attr.aria-expanded]="open()" [attr.aria-label]="(open() ? 'Collapse ' : 'Expand ') + n.title"
                  [attr.data-testid]="'deep.toggle.' + n.id">{{ open() ? '▾' : '▸' }}</button>
        }
      </header>

      @if (n.items.length) {
        <div class="rn-items">
          @for (it of n.items; track $index) {
            <span class="rn-item" [attr.data-kind]="it.kind" [attr.data-testid]="'deep.item.' + n.id + '.' + $index">
              @switch (it.kind) {
                @case ('button') { <button mat-stroked-button type="button">{{ it.label }}</button> }
                @case ('chip') { <mat-chip-set><mat-chip>{{ it.label }}</mat-chip></mat-chip-set> }
                @case ('checkbox') { <mat-checkbox [checked]="it.value > 50">{{ it.label }}</mat-checkbox> }
                @case ('progress') {
                  <span class="rn-progress"><small>{{ it.label }} · {{ it.value }}%</small>
                    <mat-progress-bar mode="determinate" [value]="it.value" [attr.aria-label]="it.label" /></span>
                }
                @case ('toggle') { <mat-slide-toggle [checked]="it.value > 50">{{ it.label }}</mat-slide-toggle> }
                @case ('link') { <a class="rn-link" [href]="'#node-' + n.id">{{ it.label }}</a> }
                @case ('badge') {
                  <span class="rn-badge" [matBadge]="it.value" matBadgeOverlap="false" matBadgeSize="small">{{ it.label }}</span>
                }
              }
            </span>
          }
        </div>
      }

      @if (n.children.length && open()) {
        <div class="rn-children">
          @for (c of n.children; track c.id) { <bm-rich-node [node]="c" /> }
        </div>
      }
    </article>
  `,
  styles: `
    .rn { --accent: hsl(var(--hue) 65% 45%); background: var(--mat-sys-surface, #fff); border-radius: 12px;
      border: 1px solid rgb(0 0 0 / .08); border-left: 4px solid var(--accent);
      box-shadow: 0 1px 2px rgb(0 0 0 / .06); padding: 10px 12px; margin-top: 10px; }
    .rn-head { display: flex; align-items: center; gap: 10px; }
    .rn-avatar { flex: none; width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center;
      background: var(--accent); color: #fff; font: 500 13px Roboto, system-ui, sans-serif; }
    .rn-titles { flex: 1; min-width: 0; }
    .rn-title { margin: 0; font: 500 15px/1.3 Roboto, system-ui, sans-serif; }
    .rn-sub { font-size: 12px; color: var(--mat-sys-on-surface-variant, #666); }
    .rn-state { font-size: 11px; padding: 2px 8px; border-radius: 10px; text-transform: uppercase; letter-spacing: .04em; }
    .rn-state--healthy { background: #e3f4e8; color: #1b6b35; }
    .rn-state--degraded { background: #fff1d6; color: #8a5a00; }
    .rn-state--offline { background: #fde3e3; color: #a12626; }
    .rn-items { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; margin: 10px 0 2px 42px; }
    .rn-progress { display: inline-flex; flex-direction: column; gap: 4px; width: 160px; color: #555; }
    .rn-badge { margin-right: 14px; }
    .rn-link { color: var(--accent); }
    .rn-children { margin-left: 14px; padding-left: 10px; border-left: 1px dashed hsl(var(--hue) 40% 75%); }
  `,
})
export class RichNodeComponent {
  readonly node = input.required<TreeNode>();
  protected readonly open = signal(true);
}
