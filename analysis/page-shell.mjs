/**
 * Chrome shared by every generated page: theme tokens, the pinned popover, and
 * the theme toggle.
 *
 * Extracted so the dashboard and the accessibility matrix cannot drift apart.
 * Two pages published side by side that disagree about their own colours, or
 * behave differently when you click an explanation, read as two projects.
 *
 * Deliberately excludes anything page-specific: charts, glossary content, matrix
 * data. This is the frame, not the picture.
 */
import { PALETTE } from './palette.mjs';

/** CSS custom properties per mode, emitted for both the OS setting and the theme toggle. */
export function tokenBlock(mode) {
  const p = PALETTE[mode];
  return `
    color-scheme: ${mode};
    --surface-1: ${p.surface};
    --plane: ${p.plane};
    --text-primary: ${p.primary};
    --text-secondary: ${p.secondary};
    --text-muted: ${p.muted};
    --grid: ${p.grid};
    --axis: ${p.axis};
    --border: ${p.border};
${p.series.map((c, i) => `    --series-${i + 1}: ${c};`).join('\n')}
${p.seq.map((c, i) => `    --seq-${i}: ${c};`).join('\n')}`;
}

/**
 * Styles for the popover and the affordances that open it.
 *
 * The popover is pinned rather than hover-only: its content runs to a paragraph
 * and a code sample, which is more than anyone should have to read while holding
 * a mouse still, and it can contain a link.
 */
export const SHELL_STYLES = `
.term {
  font: inherit;
  color: inherit;
  background: none;
  border: 0;
  padding: 0 1px;
  border-bottom: 1px dotted var(--text-muted);
  cursor: help;
}
.term:hover, .term:focus-visible { border-bottom-style: solid; color: var(--series-1); outline: none; }
.term[aria-expanded="true"] { border-bottom-style: solid; color: var(--series-1); }
.term-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.95em;
  border-bottom: 1px dotted var(--text-muted);
  cursor: help;
  background: none; border-top: 0; border-left: 0; border-right: 0;
  color: inherit; padding: 0;
}
.term-code:hover, .term-code:focus-visible { color: var(--series-1); border-bottom-style: solid; outline: none; }

#pop {
  position: fixed;
  z-index: 60;
  max-width: 420px;
  background: var(--surface-1);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: 9px;
  padding: 12px 14px;
  box-shadow: 0 10px 34px rgba(0,0,0,.20);
  font: 13px/1.55 system-ui, sans-serif;
  display: none;
}
#pop[data-open="true"] { display: block; }
#pop .pop-term { font-weight: 600; font-size: 13.5px; margin-bottom: 4px; padding-right: 18px; }
#pop .pop-short { color: var(--text-primary); margin-bottom: 8px; }
#pop .pop-detail { color: var(--text-secondary); font-size: 12.5px; }
#pop .pop-call, #pop pre {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px;
  line-height: 1.5;
  background: var(--plane);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 6px 8px;
  margin: 6px 0 8px;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
#pop .pop-close {
  position: absolute; top: 6px; right: 8px;
  background: none; border: 0; color: var(--text-muted);
  font-size: 15px; line-height: 1; cursor: pointer; padding: 2px 4px;
}
#pop .pop-close:hover { color: var(--text-primary); }
.ref-link {
  font-size: 12.5px;
  color: var(--series-1);
  text-decoration: none;
  border-bottom: 1px solid transparent;
}
.ref-link:hover { border-bottom-color: currentColor; }
.toggle {
  float: right; font-size: 12px; color: var(--text-secondary);
  background: none; border: 1px solid var(--border); border-radius: 6px;
  padding: 4px 10px; cursor: pointer;
}
`;

/**
 * Popover runtime and theme toggle.
 *
 * Positioned below the trigger, flipped above when there is no room, and clamped
 * to the viewport so it never renders off-screen on a phone. Closes on Escape, on
 * a click outside, and once its trigger has scrolled out of sight.
 *
 * Scrolling re-anchors rather than closing. Closing on any scroll looks correct
 * until you click a control that is only half on screen: the browser scrolls it
 * into view, that scroll fires, and the popover you just opened disappears.
 */
export const SHELL_SCRIPT = String.raw`
const pop = document.getElementById('pop');
let popTrigger = null;

function openPop(trigger, html) {
  if (popTrigger === trigger && pop.dataset.open === 'true') { closePop(); return; }
  closePop();
  popTrigger = trigger;
  pop.innerHTML = '<button class="pop-close" type="button" aria-label="Close">×</button>' + html;
  pop.dataset.open = 'true';
  trigger.setAttribute('aria-expanded', 'true');
  placePop();
  pop.querySelector('.pop-close').addEventListener('click', closePop);
}

function placePop() {
  if (!popTrigger) return;
  const t = popTrigger.getBoundingClientRect();
  const r = pop.getBoundingClientRect();
  const margin = 8;
  let top = t.bottom + 6;
  if (top + r.height > innerHeight - margin) {
    const above = t.top - r.height - 6;
    top = above >= margin ? above : Math.max(margin, innerHeight - r.height - margin);
  }
  let left = t.left;
  if (left + r.width > innerWidth - margin) left = innerWidth - r.width - margin;
  pop.style.left = Math.max(margin, left) + 'px';
  pop.style.top = top + 'px';
}

function closePop() {
  pop.dataset.open = 'false';
  if (popTrigger) popTrigger.setAttribute('aria-expanded', 'false');
  popTrigger = null;
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePop(); });
document.addEventListener('click', (e) => {
  if (pop.dataset.open !== 'true') return;
  if (pop.contains(e.target) || (popTrigger && popTrigger.contains(e.target))) return;
  closePop();
});

// One reposition per frame: scroll fires far more often than the layout changes.
let queued = false;
addEventListener('scroll', () => {
  if (pop.dataset.open !== 'true' || queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    if (!popTrigger || pop.dataset.open !== 'true') return;
    const t = popTrigger.getBoundingClientRect();
    if (t.bottom < 0 || t.top > innerHeight) { closePop(); return; }
    placePop();
  });
}, { passive: true });
addEventListener('resize', closePop);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

(function theme() {
  const btn = document.getElementById('themeToggle');
  if (!btn) return;
  let stored = null;
  try { stored = localStorage.getItem('bm-theme'); } catch { /* private mode */ }
  if (stored) document.documentElement.setAttribute('data-theme', stored);
  btn.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const isDark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    const next = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('bm-theme', next); } catch { /* ignore */ }
  });
})();
`;
