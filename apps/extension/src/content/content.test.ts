import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SCHEMA_VERSION } from '@leettrace/schema';
import { checkDaemon, confirmPairing, localNetworkPermission, traceCases } from './daemon';
import {
  findRunButton,
  isPythonLabel,
  parseExampleText,
  readExamples,
  readProblem,
  slugFromPath,
} from './leetcodePage';

const mockPage = readFileSync(
  join(__dirname, '..', '..', 'e2e', 'fixtures', 'two-sum.html'),
  'utf8',
);

function loadDoc(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('LeetCode page adapter', () => {
  it('reads the slug from the URL', () => {
    expect(slugFromPath('/problems/two-sum/description/')).toBe('two-sum');
    expect(slugFromPath('/contest/weekly/')).toBeNull();
  });

  it('parses example text in both layouts', () => {
    expect(
      parseExampleText('Input: nums = [2,7,11,15], target = 9\nOutput: [0,1]\nExplanation: x'),
    ).toEqual({
      input: 'nums = [2,7,11,15], target = 9',
      expected: '[0,1]',
    });
    expect(parseExampleText('Input:\u00a0s = "()"\nOutput:\u00a0true')).toEqual({
      input: 's = "()"',
      expected: 'true',
    });
    expect(parseExampleText('Constraints: 2 <= n')).toBeNull();
  });

  it('scrapes example cases from the description', () => {
    const cases = readExamples(loadDoc(mockPage));
    expect(cases.map((c) => c.input)).toEqual([
      'nums = [2,7,11,15], target = 9',
      'nums = [3,2,4], target = 6',
      'nums = [3,3], target = 6',
    ]);
    expect(cases.map((c) => c.expected)).toEqual(['[0,1]', '[1,2]', '[0,1]']);
  });

  it('falls back visibly when the page layout is unknown', () => {
    const p = readProblem(loadDoc('<div>redesigned</div>'), {
      pathname: '/problems/x/',
    } as Location);
    expect(p.examples).toEqual([]);
    expect(p.warnings[0]).toMatch(/paste a test case/i);
  });

  it('finds the Run button and the language label', () => {
    const doc = loadDoc(mockPage);
    expect(findRunButton(doc)?.textContent?.trim()).toBe('Run');
    expect(readProblem(doc, { pathname: '/problems/two-sum/' } as Location).languageLabel).toBe(
      'Python3',
    );
    expect(isPythonLabel('Python3')).toBe(true);
    expect(isPythonLabel('C++')).toBe(false);
  });
});

// ------------------------------------------------------------------ daemon client

const store: Record<string, unknown> = {};
beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (k: string) => ({ [k]: store[k] }),
        set: async (o: Record<string, unknown>) => Object.assign(store, o),
        remove: async (k: string) => void delete store[k],
      },
    },
  });
});

function res(status: number, body: unknown = {}, engine = true): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: engine ? { 'X-LeetTrace': '0.1.0' } : {},
  });
}

describe('daemon client', () => {
  it('reports offline when nothing answers', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('refused');
    });
    expect(await checkDaemon(f as unknown as typeof fetch)).toMatchObject({ kind: 'offline' });
  });

  it('finds an unpaired engine by its 401 + X-LeetTrace header', async () => {
    const f = vi.fn(async (url: string) =>
      url.includes(':47825/') ? res(401) : Promise.reject(new TypeError('x')),
    );
    expect(await checkDaemon(f as unknown as typeof fetch)).toEqual({
      kind: 'unpaired',
      port: 47825,
    });
  });

  it('ignores a non-LeetTrace service on the port', async () => {
    const f = vi.fn(async () => res(200, {}, false));
    expect((await checkDaemon(f as unknown as typeof fetch)).kind).toBe('offline');
  });

  it('pairs, then uses the token; a restarted engine (401) forces re-pairing', async () => {
    const pairFetch = vi.fn(async () =>
      res(200, { token: 't0k', port: 47823, version: SCHEMA_VERSION }),
    );
    await confirmPairing(47823, '123456', pairFetch as unknown as typeof fetch);
    const ok = vi.fn(async () => res(200, { version: SCHEMA_VERSION }));
    expect((await checkDaemon(ok as unknown as typeof fetch)).kind).toBe('ready');
    const call = ok.mock.calls[0] as unknown as [string, RequestInit];
    expect((call[1].headers as Record<string, string>).Authorization).toBe('Bearer t0k');
    const restarted = vi.fn(async () => res(401));
    expect(await checkDaemon(restarted as unknown as typeof fetch)).toEqual({
      kind: 'unpaired',
      port: 47823,
    });
    expect(store['leettrace.pairing']).toBeUndefined();
  });

  it('flags an engine with an incompatible version', async () => {
    store['leettrace.pairing'] = { port: 47823, token: 't', version: SCHEMA_VERSION };
    const f = vi.fn(async () => res(200, { version: '99.0.0' }));
    expect((await checkDaemon(f as unknown as typeof fetch)).kind).toBe('outdated');
  });

  it('validates traces coming back from the engine', async () => {
    const f = vi.fn(async () => res(200, { traces: [{ nope: true }] }));
    await expect(
      traceCases(
        { port: 1, token: 't', version: '0.1.0' },
        { code: '', slug: null, cases: [{ input: 'x = 1' }] },
        f as unknown as typeof fetch,
      ),
    ).rejects.toThrow(/Trace Schema/);
  });
});

// Regression: Chrome's local-network-access prompt (fixed in 3e4c9ec).
describe('Chrome local network access', () => {
  function stubPermissions(byName: Record<string, PermissionState>) {
    vi.stubGlobal('navigator', {
      ...navigator,
      permissions: {
        query: async ({ name }: { name: string }) => {
          if (!(name in byName)) throw new TypeError(`unknown permission ${name}`);
          return { state: byName[name] };
        },
      },
    });
  }

  it('understands the renamed permission (loopback-network)', async () => {
    stubPermissions({ 'loopback-network': 'granted' });
    expect(await localNetworkPermission()).toBe('granted');
    stubPermissions({ 'local-network-access': 'prompt' });
    expect(await localNetworkPermission()).toBe('prompt');
    stubPermissions({});
    expect(await localNetworkPermission()).toBe('unsupported');
  });

  it('reports a denial instead of "engine off"', async () => {
    stubPermissions({ 'loopback-network': 'denied' });
    const f = vi.fn();
    expect(await checkDaemon(f as unknown as typeof fetch)).toEqual({
      kind: 'offline',
      localNetworkBlocked: true,
    });
    expect(f).not.toHaveBeenCalled();
  });

  it('waits for the user to answer the prompt instead of giving up after ~1s', async () => {
    stubPermissions({ 'loopback-network': 'prompt' });
    vi.useFakeTimers();
    const f = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
          setTimeout(() => resolve(res(401)), 20_000); // the user clicks Allow after 20s
        }),
    );
    const pending = checkDaemon(f as unknown as typeof fetch);
    await vi.advanceTimersByTimeAsync(21_000);
    expect(await pending).toEqual({ kind: 'unpaired', port: 47823 });
    const init = f.mock.calls[0]![1] as RequestInit & { targetAddressSpace?: string };
    expect(init.targetAddressSpace).toBe('loopback');
    vi.useRealTimers();
  });
});
