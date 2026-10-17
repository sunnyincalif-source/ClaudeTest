import type { HeapObject, Primitive, Value } from '@leettrace/schema';

/** Display text for an inline primitive. Language-neutral rendering of schema kinds. */
export function primitiveText(v: Primitive): string {
  switch (v.kind) {
    case 'int':
      return String(v.value);
    case 'float':
      return Number.isInteger(v.value) ? v.value.toFixed(1) : String(v.value);
    case 'bool':
      return v.value ? 'True' : 'False';
    case 'str':
      return JSON.stringify(v.value);
    case 'none':
      return 'None';
    case 'unserializable':
      return v.repr;
  }
}

export function valueKey(v: Value): string {
  switch (v.kind) {
    case 'ref':
      return `ref:${v.id}`;
    case 'none':
      return 'none';
    case 'unserializable':
      return `u:${v.repr}`;
    default:
      return `${v.kind}:${String(v.value)}`;
  }
}

export function objectLabel(obj: HeapObject): string {
  switch (obj.type) {
    case 'instance':
      return obj.className;
    case 'dict':
      return 'dict';
    default:
      return obj.type;
  }
}

/** A short human label for a ref target, e.g. "Node(3)" or "list[4]". */
export function refLabel(obj: HeapObject | undefined): string {
  if (!obj) return '…';
  if (obj.type === 'instance') {
    const val = obj.fields.val ?? obj.fields.value ?? obj.fields.key;
    if (val && val.kind !== 'ref') return `${obj.className}(${primitiveText(val)})`;
    return obj.className;
  }
  if (obj.type === 'dict') return `dict{${obj.entries.length}}`;
  return `${obj.type}[${obj.items.length}]`;
}
