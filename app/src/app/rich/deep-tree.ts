import { mulberry32, seedFrom } from '../core/rng';

/**
 * Generated tree for the rich nesting page. Shape comes entirely from the URL:
 *
 *   depth    levels below the root (1-60)
 *   breadth  children per node (1-8)
 *   items    generated elements per node (0-24)
 *   nodes    node budget (depth..20,000)
 *
 * breadth^depth explodes long before depth 60, so the tree is cut at the node
 * budget. A full-depth spine is generated first, so the requested depth is always
 * reached however small the budget; the rest of the budget is filled
 * breadth-first, which keeps the upper levels complete rather than one branch.
 */
export const ITEM_KINDS = ['button', 'chip', 'checkbox', 'progress', 'toggle', 'link', 'badge'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

const NODE_KINDS = ['Region', 'Cluster', 'Service', 'Team', 'Dataset', 'Pipeline', 'Job', 'Task'] as const;
const WORDS = ['amber', 'birch', 'cobalt', 'delta', 'ember', 'fjord', 'granite', 'harbor', 'iris', 'juniper', 'krypton', 'lumen'];
const STATES = ['healthy', 'degraded', 'offline'] as const;

export interface TreeItem {
  readonly kind: ItemKind;
  readonly label: string;
  /** 0-100, used by progress and as the checked/on state for checkbox and toggle. */
  readonly value: number;
}

export interface TreeNode {
  /** Child indices from the root, e.g. "0.2.1"; the root is "0". */
  readonly id: string;
  readonly level: number;
  readonly kind: string;
  readonly title: string;
  readonly state: (typeof STATES)[number];
  readonly items: readonly TreeItem[];
  readonly children: TreeNode[];
}

export interface TreeShape {
  readonly depth: number;
  readonly breadth: number;
  readonly items: number;
  readonly nodes: number;
}

export interface TreeStats {
  readonly nodes: number;
  readonly items: number;
  readonly maxLevel: number;
  /** breadth^0 + ... + breadth^depth: what an uncapped tree would hold. */
  readonly uncapped: number;
}

export function buildTree(seed: string, shape: TreeShape): { root: TreeNode; stats: TreeStats } {
  const rand = mulberry32(seedFrom(`${seed}:tree`));
  const budget = Math.max(shape.nodes, shape.depth + 1);
  let count = 0;
  let items = 0;
  let maxLevel = 0;

  const make = (id: string, level: number): TreeNode => {
    count++;
    maxLevel = Math.max(maxLevel, level);
    const node: TreeNode = {
      id,
      level,
      kind: NODE_KINDS[level % NODE_KINDS.length],
      title: `${WORDS[Math.floor(rand() * WORDS.length)]}-${id.replaceAll('.', '')}`,
      state: STATES[rand() < 0.75 ? 0 : rand() < 0.6 ? 1 : 2],
      items: Array.from({ length: shape.items }, (_, i) => ({
        kind: ITEM_KINDS[(level + i) % ITEM_KINDS.length],
        label: `${WORDS[(level * 7 + i) % WORDS.length]} ${id}.${i}`,
        value: Math.floor(rand() * 101),
      })),
      children: [],
    };
    items += node.items.length;
    return node;
  };

  const root = make('0', 0);
  // Spine: first child at every level down to the requested depth.
  let tip = root;
  while (tip.level < shape.depth) {
    const child = make(`${tip.id}.0`, tip.level + 1);
    tip.children.push(child);
    tip = child;
  }
  // Breadth-first fill with what is left of the budget.
  const queue: TreeNode[] = [root];
  while (queue.length && count < budget) {
    const node = queue.shift()!;
    if (node.level >= shape.depth) continue;
    for (let b = 0; b < shape.breadth && count < budget; b++) {
      if (!node.children[b]) node.children.push(make(`${node.id}.${b}`, node.level + 1));
    }
    queue.push(...node.children);
  }

  let uncapped = 0;
  for (let l = 0; l <= shape.depth && uncapped < 1e12; l++) uncapped += shape.breadth ** l;
  return { root, stats: { nodes: count, items, maxLevel, uncapped } };
}
