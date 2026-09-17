import { mulberry32, seedFrom } from './rng';

export const COLUMN_KEYS = [
  'revenue', 'region', 'status', 'owner', 'quantity', 'margin',
  'updated', 'channel', 'segment', 'priority', 'score', 'tier',
] as const;

export const STATUS_KEYS = ['active', 'pending', 'closed', 'blocked'] as const;

export interface BmRow {
  readonly r: number;
  readonly statusKey: string;
  readonly values: readonly string[];
}

const REGIONS = ['EMEA', 'APAC', 'LATAM', 'NA', 'ANZ'];

/**
 * Deterministic dataset. Same seed + same dimensions => byte-identical DOM, which
 * is what makes timings from different runs comparable at all.
 */
export function buildRows(seed: string, rows: number, cols: number): BmRow[] {
  const rand = mulberry32(seedFrom(seed));
  const out: BmRow[] = new Array(rows);
  for (let r = 0; r < rows; r++) {
    const values: string[] = new Array(cols);
    for (let c = 0; c < cols; c++) {
      const key = COLUMN_KEYS[c % COLUMN_KEYS.length];
      values[c] = cellValue(key, rand, r, c);
    }
    out[r] = {
      r,
      statusKey: STATUS_KEYS[Math.floor(rand() * STATUS_KEYS.length)],
      values,
    };
  }
  return out;
}

function cellValue(key: string, rand: () => number, r: number, c: number): string {
  switch (key) {
    case 'revenue':
      return `$${(rand() * 900_000 + 1_000).toFixed(2)}`;
    case 'region':
      return REGIONS[Math.floor(rand() * REGIONS.length)];
    case 'margin':
      return `${(rand() * 60 + 2).toFixed(1)}%`;
    case 'quantity':
      return String(Math.floor(rand() * 5_000) + 1);
    case 'score':
      return (rand() * 100).toFixed(1);
    case 'updated':
      return `2026-0${1 + Math.floor(rand() * 9)}-1${Math.floor(rand() * 9)}`;
    default:
      // Deliberately unique per cell so text locators can be strict-safe when the
      // scenario wants them to be.
      return `${key}-${r}-${c}-${Math.floor(rand() * 1e6).toString(36)}`;
  }
}

export function columnKey(c: number): string {
  return COLUMN_KEYS[c % COLUMN_KEYS.length];
}
