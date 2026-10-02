/**
 * Sorting and filtering for the rich tables, kept free of Angular so the
 * behaviour can be tested without a browser.
 */
export type TableRow = Readonly<Record<string, string>>;
export type SortDir = 'asc' | 'desc' | '';

export interface TableQuery {
  /** Case-insensitive substring; blank matches everything. */
  readonly text: string;
  /** Column the text is matched against; '' means any column. */
  readonly column: string;
  readonly sortKey: string;
  readonly sortDir: SortDir;
}

export const EMPTY_QUERY: TableQuery = { text: '', column: '', sortKey: '', sortDir: '' };

/**
 * Numeric value of a cell, or NaN. Understands the dataset's formats: "$1,234.50",
 * "42.1%", "2026-03-14" (sorted as a number so dates order chronologically).
 */
export function numeric(value: string): number {
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return Number(v.replaceAll('-', ''));
  if (!/^[-+$]?[$]?[\d,]*\.?\d+%?$/.test(v)) return NaN;
  return Number(v.replace(/[$,%+]/g, ''));
}

/** Numbers before text; numbers by value, text by locale with numeric collation. */
export function compareCells(a: string, b: string): number {
  const na = numeric(a);
  const nb = numeric(b);
  const aNum = !Number.isNaN(na);
  const bNum = !Number.isNaN(nb);
  if (aNum && bNum) return na - nb;
  if (aNum !== bNum) return aNum ? -1 : 1;
  return a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
}

export function filterRows<T extends TableRow>(rows: readonly T[], text: string, column: string): T[] {
  const needle = text.trim().toLowerCase();
  if (!needle) return rows.slice();
  return rows.filter((row) =>
    column
      ? (row[column] ?? '').toLowerCase().includes(needle)
      : Object.values(row).some((v) => v.toLowerCase().includes(needle)),
  );
}

/** Stable: rows that compare equal keep their original order. */
export function sortRows<T extends TableRow>(rows: readonly T[], key: string, dir: SortDir): T[] {
  if (!key || !dir) return rows.slice();
  const sign = dir === 'asc' ? 1 : -1;
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => sign * compareCells(a.row[key] ?? '', b.row[key] ?? '') || a.i - b.i)
    .map((x) => x.row);
}

export function queryRows<T extends TableRow>(rows: readonly T[], q: TableQuery): T[] {
  return sortRows(filterRows(rows, q.text, q.column), q.sortKey, q.sortDir);
}
