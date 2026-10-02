import { expect, test } from '@playwright/test';
import { ITEM_KINDS, TreeNode, buildTree } from '../../app/src/app/rich/deep-tree';

function walk(n: TreeNode, out: TreeNode[] = []): TreeNode[] {
  out.push(n);
  n.children.forEach((c) => walk(c, out));
  return out;
}

test('an uncapped tree has exactly breadth^0 + ... + breadth^depth nodes', () => {
  const { root, stats } = buildTree('s', { depth: 3, breadth: 3, items: 2, nodes: 10_000 });
  expect(stats.nodes).toBe(1 + 3 + 9 + 27);
  expect(stats.uncapped).toBe(40);
  expect(walk(root)).toHaveLength(40);
  expect(stats.items).toBe(80);
  expect(walk(root).every((n) => n.children.length === (n.level < 3 ? 3 : 0))).toBe(true);
});

test('the requested depth is reached even when the budget is tiny', () => {
  const { root, stats } = buildTree('s', { depth: 50, breadth: 4, items: 0, nodes: 10 });
  expect(stats.maxLevel).toBe(50);
  expect(stats.nodes).toBe(51);
  expect(Math.max(...walk(root).map((n) => n.level))).toBe(50);
});

test('the budget caps the node count and fills breadth-first', () => {
  const { root, stats } = buildTree('s', { depth: 10, breadth: 3, items: 1, nodes: 200 });
  expect(stats.nodes).toBe(200);
  expect(walk(root)).toHaveLength(200);
  // Breadth-first: levels 0-3 (1+3+9+27 nodes) are complete before anything is cut.
  const nodes = walk(root);
  for (let l = 0; l <= 3; l++) expect(nodes.filter((n) => n.level === l)).toHaveLength(3 ** l);
  expect(nodes.every((n) => n.children.length <= 3)).toBe(true);
});

test('ids are unique paths and generation is deterministic per seed', () => {
  const a = buildTree('seed-a', { depth: 6, breadth: 2, items: 3, nodes: 100 });
  const ids = walk(a.root).map((n) => n.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(JSON.stringify(buildTree('seed-a', { depth: 6, breadth: 2, items: 3, nodes: 100 }))).toBe(JSON.stringify(a));
  expect(JSON.stringify(buildTree('seed-b', { depth: 6, breadth: 2, items: 3, nodes: 100 }))).not.toBe(JSON.stringify(a));
});

test('items cycle through every element kind', () => {
  const { root } = buildTree('s', { depth: 2, breadth: 2, items: ITEM_KINDS.length, nodes: 100 });
  expect(new Set(root.items.map((i) => i.kind))).toEqual(new Set(ITEM_KINDS));
});
