// The LeetTrace Trace Schema (SPEC §3).
//
// This is the spine of the project: the engine's output, the localhost wire format, and
// the only thing the visualization knows how to read. It is mirrored by Pydantic models in
// packages/engine (leettrace/schema.py). Nothing language-specific may leak in here.

export type HeapId = string; // stable within a trace

export type Primitive =
  | { kind: 'int'; value: number }
  | { kind: 'float'; value: number }
  | { kind: 'bool'; value: boolean }
  | { kind: 'str'; value: string }
  | { kind: 'none' }
  | { kind: 'unserializable'; repr: string };

export type Ref = { kind: 'ref'; id: HeapId };
export type Value = Primitive | Ref;

export type HeapObject =
  | { type: 'list'; id: HeapId; items: Value[] }
  | { type: 'tuple'; id: HeapId; items: Value[] }
  | { type: 'dict'; id: HeapId; entries: { key: Value; value: Value }[] }
  | { type: 'set'; id: HeapId; items: Value[] }
  | { type: 'instance'; id: HeapId; className: string; fields: Record<string, Value> };

export interface Frame {
  id: string; // stable per activation
  func: string;
  locals: Record<string, Value>;
  order: string[]; // display order of locals
  returnValue?: Value;
}

export type StepEvent = 'line' | 'call' | 'return' | 'exception';

export interface Step {
  i: number;
  line: number; // 1-based, in the user's source
  event: StepEvent;
  stack: Frame[]; // top-of-stack last
  heap: Record<HeapId, HeapObject>; // ONLY reachable objects
  stdout: string; // cumulative, not a delta
  note?: string; // the "why"
  exception?: { type: string; message: string };
}

export interface TestResult {
  index: number;
  input: string; // human-readable rendering of the case
  expected?: string;
  actual?: string;
  passed?: boolean; // undefined if no expected value available
  error?: string;
}

export interface Trace {
  language: 'python'; // union grows later
  source: string;
  steps: Step[];
  test?: TestResult; // which case this trace ran (LeetCode mode)
  truncated?: boolean; // hit the step/time cap
  error?: { type: string; message: string; line?: number };
  engineVersion: string; // for client/engine compatibility checks
}

/**
 * The schema version this client was built against. Clients compare it with
 * `trace.engineVersion`; a mismatch shows an "update" prompt, never a silent misrender.
 */
export const SCHEMA_VERSION = '0.1.0';

/** Compatible when major.minor match (patch releases never change the wire format). */
export function isCompatibleEngine(engineVersion: string, clientVersion = SCHEMA_VERSION): boolean {
  const mm = (v: string) => v.split('.').slice(0, 2).join('.');
  return mm(engineVersion) === mm(clientVersion);
}

// ---------------------------------------------------------------------------------------
// Runtime validation (zero-dependency). Used at the client boundary so a malformed or
// foreign payload is rejected loudly instead of misrendered.

type Json = unknown;

function isObj(x: Json): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

export function isValue(x: Json): x is Value {
  if (!isObj(x)) return false;
  switch (x.kind) {
    case 'int':
    case 'float':
      return typeof x.value === 'number';
    case 'bool':
      return typeof x.value === 'boolean';
    case 'str':
      return typeof x.value === 'string';
    case 'none':
      return true;
    case 'unserializable':
      return typeof x.repr === 'string';
    case 'ref':
      return typeof x.id === 'string';
    default:
      return false;
  }
}

function isValueArray(x: Json): x is Value[] {
  return Array.isArray(x) && x.every(isValue);
}

function isValueRecord(x: Json): x is Record<string, Value> {
  return isObj(x) && Object.values(x).every(isValue);
}

export function isHeapObject(x: Json): x is HeapObject {
  if (!isObj(x) || typeof x.id !== 'string') return false;
  switch (x.type) {
    case 'list':
    case 'tuple':
    case 'set':
      return isValueArray(x.items);
    case 'dict':
      return (
        Array.isArray(x.entries) &&
        x.entries.every((e) => isObj(e) && isValue(e.key) && isValue(e.value))
      );
    case 'instance':
      return typeof x.className === 'string' && isValueRecord(x.fields);
    default:
      return false;
  }
}

function isFrame(x: Json): x is Frame {
  return (
    isObj(x) &&
    typeof x.id === 'string' &&
    typeof x.func === 'string' &&
    isValueRecord(x.locals) &&
    Array.isArray(x.order) &&
    x.order.every((n) => typeof n === 'string') &&
    (x.returnValue === undefined || isValue(x.returnValue))
  );
}

const EVENTS: ReadonlySet<string> = new Set(['line', 'call', 'return', 'exception']);

function isStep(x: Json): x is Step {
  return (
    isObj(x) &&
    typeof x.i === 'number' &&
    typeof x.line === 'number' &&
    typeof x.event === 'string' &&
    EVENTS.has(x.event) &&
    Array.isArray(x.stack) &&
    x.stack.every(isFrame) &&
    isObj(x.heap) &&
    Object.values(x.heap).every(isHeapObject) &&
    typeof x.stdout === 'string' &&
    (x.note === undefined || typeof x.note === 'string') &&
    (x.exception === undefined ||
      (isObj(x.exception) &&
        typeof x.exception.type === 'string' &&
        typeof x.exception.message === 'string'))
  );
}

export function isTrace(x: Json): x is Trace {
  return (
    isObj(x) &&
    x.language === 'python' &&
    typeof x.source === 'string' &&
    typeof x.engineVersion === 'string' &&
    Array.isArray(x.steps) &&
    x.steps.every(isStep) &&
    (x.truncated === undefined || typeof x.truncated === 'boolean') &&
    (x.error === undefined ||
      (isObj(x.error) && typeof x.error.type === 'string' && typeof x.error.message === 'string'))
  );
}

/** Parse untrusted JSON into a Trace, throwing a descriptive error if it doesn't conform. */
export function parseTrace(x: Json): Trace {
  if (!isTrace(x)) throw new Error('Payload does not conform to the LeetTrace Trace Schema');
  return x;
}
