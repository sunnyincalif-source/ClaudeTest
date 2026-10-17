// Automatic pairing, extension side: the background accepts the token only from the
// engine's own page, stores it, and closes the tab it opened for the handshake.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type External = (
  msg: unknown,
  sender: { url?: string; tab?: { id?: number } },
  reply: (r: unknown) => void,
) => boolean;
type Internal = (msg: unknown, sender: unknown, reply: (r: unknown) => void) => boolean;

const local: Record<string, unknown> = {};
const session: Record<string, unknown> = {};
let external: External;
let internal: Internal;
const created: string[] = [];
const removed: number[] = [];

beforeAll(async () => {
  vi.stubGlobal('chrome', {
    runtime: {
      onMessage: { addListener: (l: Internal) => (internal = l) },
      onMessageExternal: { addListener: (l: External) => (external = l) },
      onInstalled: { addListener: () => undefined },
      getManifest: () => ({ version: '1.1.0' }),
      getURL: (p: string) => `chrome-extension://id/${p}`,
    },
    storage: {
      local: {
        get: async (k: string) => ({ [k]: local[k] }),
        set: async (o: Record<string, unknown>) => Object.assign(local, o),
      },
      session: {
        get: async (k: string) => ({ [k]: session[k] }),
        set: async (o: Record<string, unknown>) => Object.assign(session, o),
      },
    },
    tabs: {
      create: async ({ url }: { url: string }) => {
        created.push(url);
        return { id: 77 };
      },
      remove: async (id: number) => void removed.push(id),
      query: async () => [],
      reload: async () => undefined,
    },
    scripting: { executeScript: async () => [] },
  });
  await import('./index');
});

beforeEach(() => {
  for (const k of Object.keys(local)) delete local[k];
});

const token = 'k'.repeat(43);
const send = (msg: unknown, url: string, tabId?: number) =>
  new Promise<unknown>((resolve) => external(msg, { url, tab: { id: tabId } }, resolve));

describe('background: automatic pairing', () => {
  it('stores the token handed over by the engine page', async () => {
    const reply = await send(
      { type: 'leettrace-pair', token, port: 47823, version: '1.1.0' },
      'http://127.0.0.1:47823/#view=welcome',
    );
    expect(reply).toEqual({ ok: true, extensionVersion: '1.1.0' });
    expect(local['leettrace.pairing']).toEqual({
      port: 47823,
      token,
      version: '1.1.0',
      via: 'auto',
    });
  });

  it('refuses anything that is not the engine page on that port', async () => {
    for (const url of [
      'https://leetcode.com/problems/two-sum/',
      'http://127.0.0.1:9999/',
      'https://evil.example/',
    ]) {
      const reply = await send({ type: 'leettrace-pair', token, port: 47823, version: '1' }, url);
      expect(reply).toMatchObject({ ok: false });
    }
    expect(local['leettrace.pairing']).toBeUndefined();
  });

  it('opens the engine page for a (re)connect and closes it after the handshake', async () => {
    await new Promise((resolve) =>
      internal({ type: 'leettrace:connect', port: 47823, active: false }, {}, resolve),
    );
    expect(created).toContain('http://127.0.0.1:47823/#view=connect');
    vi.useFakeTimers();
    await send(
      { type: 'leettrace-pair', token, port: 47823, version: '1.1.0' },
      'http://127.0.0.1:47823/#view=connect',
      77,
    );
    await vi.advanceTimersByTimeAsync(500);
    expect(removed).toContain(77);
    vi.useRealTimers();
  });
});
