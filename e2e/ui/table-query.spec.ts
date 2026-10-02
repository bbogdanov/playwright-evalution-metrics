import { expect, test } from '@playwright/test';
import { compareCells, filterRows, numeric, queryRows, sortRows } from '../../app/src/app/rich/table-query';

const rows = [
  { id: 'a', amount: '$1,200.00', margin: '9.5%', region: 'EMEA', when: '2026-03-11' },
  { id: 'b', amount: '$300.10', margin: '40.0%', region: 'apac', when: '2026-01-19' },
  { id: 'c', amount: '$45,000.00', margin: '9.5%', region: 'NA', when: '2026-09-10' },
  { id: 'd', amount: '$300.10', margin: '2.1%', region: 'APAC', when: '2026-01-12' },
];
const ids = (r: readonly { id: string }[]) => r.map((x) => x.id).join('');

test('numeric understands the dataset formats and rejects text', () => {
  expect(numeric('$1,204.50')).toBe(1204.5);
  expect(numeric('38.2%')).toBe(38.2);
  expect(numeric('4021')).toBe(4021);
  expect(numeric('2026-03-14')).toBe(20260314);
  expect(numeric('owner-3-1-abc')).toBeNaN();
  expect(numeric('EMEA')).toBeNaN();
});

test('numbers compare by value, not as text', () => {
  expect(compareCells('$9.00', '$10.00')).toBeLessThan(0);
  expect(compareCells('item-2', 'item-10')).toBeLessThan(0);
  expect(compareCells('5', 'text')).toBeLessThan(0);
});

test('sort is by value in both directions and stable on ties', () => {
  expect(ids(sortRows(rows, 'amount', 'asc'))).toBe('bdac');
  expect(ids(sortRows(rows, 'amount', 'desc'))).toBe('cabd');
  expect(ids(sortRows(rows, 'margin', 'asc'))).toBe('dacb');
  expect(ids(sortRows(rows, 'when', 'asc'))).toBe('dbac');
  expect(ids(sortRows(rows, 'amount', ''))).toBe('abcd');
});

test('filter is case-insensitive, trims, and can be limited to a column', () => {
  expect(ids(filterRows(rows, ' apac ', ''))).toBe('bd');
  expect(ids(filterRows(rows, '9.5', 'margin'))).toBe('ac');
  expect(ids(filterRows(rows, '9.5', 'region'))).toBe('');
  expect(ids(filterRows(rows, '', 'region'))).toBe('abcd');
});

test('query filters first, then sorts, and never mutates its input', () => {
  const before = JSON.stringify(rows);
  expect(ids(queryRows(rows, { text: 'apac', column: 'region', sortKey: 'margin', sortDir: 'asc' }))).toBe('db');
  expect(JSON.stringify(rows)).toBe(before);
});
