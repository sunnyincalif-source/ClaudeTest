import type { HeapObject, Value } from '@leettrace/schema';
import { primitiveText, refLabel } from '../lib/format';

interface Props {
  value: Value;
  /** Stable arrow-source key, e.g. "f2:head" or "o3:next". */
  sourceKey: string;
  heap: Record<string, HeapObject>;
  changed?: boolean;
}

/** A value: primitives inline; refs render an anchor dot that ArrowLayer draws from. */
export function ValuePill({ value, sourceKey, heap, changed }: Props) {
  const cls = `lt-pill${changed ? ' lt-changed' : ''}`;
  if (value.kind === 'ref') {
    const target = heap[value.id];
    const label = refLabel(target);
    return (
      <span className={`${cls} lt-pill-ref`} title={`points to ${label}`}>
        <span
          className="lt-ref-dot"
          data-ref-source={sourceKey}
          data-ref-target={target ? value.id : undefined}
          aria-hidden="true"
        />
        <span className="lt-sr">points to {label}</span>
        {!target && <span className="lt-ref-missing">…</span>}
      </span>
    );
  }
  return (
    <span className={`${cls} lt-pill-${value.kind}`} title={primitiveText(value)}>
      {primitiveText(value)}
    </span>
  );
}
