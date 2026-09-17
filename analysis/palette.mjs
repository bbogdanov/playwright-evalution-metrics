/**
 * Design tokens for the dashboard.
 *
 * Both modes are selected rather than derived: the dark column is the same hues
 * re-stepped for the dark surface, not an automatic inversion.
 *
 * Categorical slots are assigned in fixed order and never cycled. Charts whose
 * marks can land adjacent to any other mark (the scatter) use only the first
 * three slots, which are the ones that clear the all-pairs separation floors;
 * charts with an adjacent-only pairlist (bars, lines) may use the full set.
 */
export const PALETTE = {
  light: {
    surface: '#fcfcfb', plane: '#f9f9f7',
    primary: '#0b0b0b', secondary: '#52514e', muted: '#898781',
    grid: '#e1e0d9', axis: '#c3c2b7', border: 'rgba(11,11,11,0.10)',
    series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
    seq: ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'],
  },
  dark: {
    surface: '#1a1a19', plane: '#0d0d0d',
    primary: '#ffffff', secondary: '#c3c2b7', muted: '#898781',
    grid: '#2c2c2a', axis: '#383835', border: 'rgba(255,255,255,0.10)',
    series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
    seq: ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'],
  },
};

/** Fixed, never themed, never reused as a series colour. Always shipped with a glyph and a label. */
export const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
};

/**
 * Robustness outcomes mapped to status roles.
 *
 * `broken-wrong` is critical rather than merely bad: the locator resolves to
 * exactly one element and it is the wrong one, so the test passes against the
 * wrong thing. That is worse than any failure.
 */
export const OUTCOME_STATUS = {
  'survived': { role: 'good', glyph: '●', label: 'Survived' },
  'broken-none': { role: 'serious', glyph: '○', label: 'No match' },
  'broken-ambiguous': { role: 'warning', glyph: '◐', label: 'Ambiguous' },
  'broken-wrong': { role: 'critical', glyph: '✖', label: 'Wrong element' },
  'error': { role: 'critical', glyph: '✖', label: 'Error' },
};
