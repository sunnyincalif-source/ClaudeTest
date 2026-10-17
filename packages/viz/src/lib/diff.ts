// "What just changed" highlighting, derived purely from (steps[i-1], steps[i]).
// No animation state is kept anywhere: scrubbing to any step yields the same highlights.
import type { HeapObject, Step } from '@leettrace/schema';
import { valueKey } from './format';

export interface StepDiff {
  /** `${frameId}:${name}` for locals whose value changed or appeared. */
  locals: Set<string>;
  /** `${heapId}:${slot}` for heap slots whose value changed or appeared. */
  slots: Set<string>;
  /** Heap ids that are new at this step. */
  newObjects: Set<string>;
}

function slotKeys(obj: HeapObject): Map<string, string> {
  const m = new Map<string, string>();
  switch (obj.type) {
    case 'instance':
      for (const [k, v] of Object.entries(obj.fields)) m.set(k, valueKey(v));
      break;
    case 'dict':
      for (const e of obj.entries) m.set(valueKey(e.key), valueKey(e.value));
      break;
    default:
      obj.items.forEach((v, i) => m.set(String(i), valueKey(v)));
  }
  return m;
}

export function diffSteps(prev: Step | undefined, cur: Step): StepDiff {
  const out: StepDiff = { locals: new Set(), slots: new Set(), newObjects: new Set() };
  if (!prev) return out;
  const prevFrames = new Map(prev.stack.map((f) => [f.id, f]));
  for (const f of cur.stack) {
    const pf = prevFrames.get(f.id);
    if (!pf) continue; // a brand-new frame: the frame itself animates in
    for (const [name, v] of Object.entries(f.locals)) {
      const pv = pf.locals[name];
      if (!pv || valueKey(pv) !== valueKey(v)) out.locals.add(`${f.id}:${name}`);
    }
  }
  for (const obj of Object.values(cur.heap)) {
    const po = prev.heap[obj.id];
    if (!po) {
      out.newObjects.add(obj.id);
      continue;
    }
    const before = slotKeys(po);
    for (const [slot, key] of slotKeys(obj)) {
      if (before.get(slot) !== key) out.slots.add(`${obj.id}:${slot}`);
    }
  }
  return out;
}
