// Deterministic heap layout (SPEC §6).
//
// Positions are computed ONCE for the whole trace, not per step, so an object never moves
// during its lifetime: a linked-list reversal flips arrows while nodes sit still.
//
// Rules:
// - Each instance's "layout parent" is the first instance (in step order) that pointed to
//   it through a field. That gives a forest (cycles are refused).
// - A class whose instances only ever use one pointer field is a chain: children go to the
//   right on the same row. A class with 2+ pointer fields is a tree: in-order columns, one
//   row per depth, with the first half of the pointer fields (e.g. `left`) on the left.
// - Roots stack vertically in first-appearance order; childless roots share one row.
// - Containers (list/tuple/dict/set) don't get grid cells: they flow below the grid in
//   first-appearance order.

import type { HeapId, HeapObject, Trace } from '@leettrace/schema';

export interface GridPos {
  col: number;
  row: number;
}

export interface HeapLayout {
  grid: Map<HeapId, GridPos>;
  cols: number;
  rows: number;
  /** All heap ids in first-appearance order (stable sort key for containers). */
  order: Map<HeapId, number>;
  /** Max number of fields any instance has (to size grid cells). */
  maxFields: number;
}

interface Edge {
  parent: HeapId;
  field: string;
}

export function computeLayout(trace: Trace): HeapLayout {
  const order = new Map<HeapId, number>();
  const parentOf = new Map<HeapId, Edge>();
  const childrenOf = new Map<HeapId, HeapId[]>();
  const classOf = new Map<HeapId, string>();
  const refFields = new Map<string, string[]>(); // className → pointer fields, first-seen order
  let maxFields = 0;

  const isAncestor = (maybeAncestor: HeapId, node: HeapId): boolean => {
    let cur: HeapId | undefined = node;
    const seen = new Set<HeapId>();
    while (cur !== undefined && !seen.has(cur)) {
      if (cur === maybeAncestor) return true;
      seen.add(cur);
      cur = parentOf.get(cur)?.parent;
    }
    return false;
  };

  for (const step of trace.steps) {
    for (const obj of Object.values(step.heap)) {
      if (!order.has(obj.id)) order.set(obj.id, order.size);
      if (obj.type !== 'instance') continue;
      classOf.set(obj.id, obj.className);
      maxFields = Math.max(maxFields, Object.keys(obj.fields).length);
      for (const [field, v] of Object.entries(obj.fields)) {
        if (v.kind !== 'ref') continue;
        const target = step.heap[v.id];
        if (!target || target.type !== 'instance') continue;
        const fields = refFields.get(obj.className) ?? [];
        if (!fields.includes(field)) {
          fields.push(field);
          refFields.set(obj.className, fields);
        }
        if (v.id === obj.id || parentOf.has(v.id) || isAncestor(v.id, obj.id)) continue;
        parentOf.set(v.id, { parent: obj.id, field });
        const kids = childrenOf.get(obj.id) ?? [];
        kids.push(v.id);
        childrenOf.set(obj.id, kids);
      }
    }
  }

  const byOrder = (a: HeapId, b: HeapId) => (order.get(a) ?? 0) - (order.get(b) ?? 0);
  const instances = [...classOf.keys()].sort(byOrder);
  const roots = instances.filter((id) => !parentOf.has(id));
  const grid = new Map<HeapId, GridPos>();
  let bandTop = 0;
  let cols = 0;

  const slot = (child: HeapId): number => {
    const edge = parentOf.get(child);
    if (!edge) return 0;
    const fields = refFields.get(classOf.get(edge.parent) ?? '') ?? [];
    return Math.max(0, fields.indexOf(edge.field));
  };

  const placeTree = (root: HeapId) => {
    let counter = 0;
    let deepest = 0;
    const place = (node: HeapId, depth: number) => {
      deepest = Math.max(deepest, depth);
      const kids = [...(childrenOf.get(node) ?? [])].sort(
        (a, b) => slot(a) - slot(b) || byOrder(a, b),
      );
      const nFields = (refFields.get(classOf.get(node) ?? '') ?? []).length;
      if (nFields <= 1) {
        grid.set(node, { col: counter++, row: bandTop + depth });
        for (const k of kids) place(k, depth); // chain: same row, to the right
        return;
      }
      const half = Math.ceil(nFields / 2);
      for (const k of kids) if (slot(k) < half) place(k, depth + 1);
      grid.set(node, { col: counter++, row: bandTop + depth });
      for (const k of kids) if (slot(k) >= half) place(k, depth + 1);
    };
    place(root, 0);
    cols = Math.max(cols, counter);
    bandTop += deepest + 1;
  };

  const singletons: HeapId[] = [];
  for (const r of roots) {
    if ((childrenOf.get(r) ?? []).length === 0) singletons.push(r);
    else placeTree(r);
  }
  if (singletons.length > 0) {
    singletons.forEach((id, i) => grid.set(id, { col: i, row: bandTop }));
    cols = Math.max(cols, singletons.length);
    bandTop += 1;
  }

  return { grid, cols, rows: bandTop, order, maxFields };
}

/** Containers reachable at this step, in stable first-appearance order. */
export function orderedContainers(
  heap: Record<HeapId, HeapObject>,
  layout: HeapLayout,
): HeapObject[] {
  return Object.values(heap)
    .filter((o) => o.type !== 'instance')
    .sort((a, b) => (layout.order.get(a.id) ?? 0) - (layout.order.get(b.id) ?? 0));
}
