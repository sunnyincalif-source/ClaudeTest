// Cross-language contract test: every golden trace the Python engine records must satisfy
// the TypeScript schema validator. If the Pydantic mirror drifts from schema.ts, this fails.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isCompatibleEngine, isTrace, parseTrace, SCHEMA_VERSION } from './index';

const snapshots = join(__dirname, '..', '..', 'engine', 'tests', 'snapshots');
const files = readdirSync(snapshots).filter((f) => f.endsWith('.json'));

describe('engine golden traces conform to the TS schema', () => {
  it('has golden traces to check', () => {
    expect(files.length).toBeGreaterThanOrEqual(7);
  });
  for (const f of files) {
    it(f, () => {
      const data: unknown = JSON.parse(readFileSync(join(snapshots, f), 'utf8'));
      expect(isTrace(data)).toBe(true);
    });
  }
});

describe('validator rejects malformed payloads', () => {
  const ok = { language: 'python', source: '', steps: [], engineVersion: SCHEMA_VERSION };
  it('accepts a minimal trace', () => expect(isTrace(ok)).toBe(true));
  it('rejects a foreign language', () => expect(isTrace({ ...ok, language: 'cobol' })).toBe(false));
  it('rejects missing engineVersion', () => {
    const { engineVersion: _v, ...rest } = ok;
    expect(isTrace(rest)).toBe(false);
  });
  it('rejects a bad value kind', () => {
    const bad = {
      ...ok,
      steps: [
        {
          i: 0,
          line: 1,
          event: 'line',
          stack: [{ id: 'f1', func: 'f', locals: { x: { kind: 'pointer' } }, order: ['x'] }],
          heap: {},
          stdout: '',
        },
      ],
    };
    expect(isTrace(bad)).toBe(false);
    expect(() => parseTrace(bad)).toThrow();
  });
});

describe('engine version compatibility', () => {
  it('matches on major.minor', () => {
    expect(isCompatibleEngine('0.1.7', '0.1.0')).toBe(true);
    expect(isCompatibleEngine('0.2.0', '0.1.0')).toBe(false);
  });
});
