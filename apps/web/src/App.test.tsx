import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EXTENSION_ID } from '@leettrace/schema';
import { parseHash } from './api';
import { App } from './App';
import { handToExtension } from './extension';

const HEALTH = {
  version: '1.1.0',
  runs: 0,
  port: 47823,
  paired: 0,
  limits: {
    maxSteps: 10000,
    maxSeconds: 5,
    maxDepth: 200,
    maxMemoryMb: 256,
    memory: 'enforced',
    mechanism: 'RLIMIT_AS',
  },
};

function stubEngine(extra: Record<string, unknown> = {}) {
  const responses: Record<string, unknown> = {
    '/health': HEALTH,
    '/pair/code': { code: '123456', expiresIn: 900, paired: 0 },
    ...extra,
  };
  const fetchSpy = vi.fn(async (url: string) => {
    if (url in responses) {
      const body = responses[url];
      return body === 403
        ? new Response('{}', { status: 403 })
        : new Response(JSON.stringify(body), { status: 200 });
    }
    return new Response('', { status: 200 }); // HEAD on the extension zip
  });
  vi.stubGlobal('fetch', fetchSpy);
  vi.stubGlobal(
    'WebSocket',
    class {
      static OPEN = 1;
      readyState = 0;
      close() {}
      send() {}
    },
  );
  return fetchSpy;
}

/** A fake Chrome extension runtime that accepts the pairing message. */
function stubExtension(accept = true) {
  const sendMessage = vi.fn((id: string, _msg: unknown, cb: (r: unknown) => void) =>
    cb(accept && id === EXTENSION_ID ? { ok: true, extensionVersion: '1.1.0' } : undefined),
  );
  vi.stubGlobal('chrome', { runtime: { sendMessage } });
  return sendMessage;
}

describe('boot', () => {
  it('reads the token, run id, view and first-run flag from the fragment', () => {
    expect(parseHash('#t=abc&run=r1')).toEqual({
      token: 'abc',
      runId: 'r1',
      view: null,
      first: false,
    });
    expect(parseHash('#t=abc&view=welcome').view).toBe('welcome');
    expect(parseHash('#t=abc&view=welcome&first=1').first).toBe(true);
    expect(parseHash('')).toEqual({ token: null, runId: null, view: null, first: false });
  });
});

describe('App', () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it('asks the engine for the token when opened without one', async () => {
    const fetchSpy = stubEngine({ '/pair/bootstrap': 403 });
    window.history.replaceState(null, '', '/');
    render(<App />);
    expect(await screen.findByText('Open LeetTrace from the app')).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith('/pair/bootstrap', { cache: 'no-store' });
    expect(fetchSpy).toHaveBeenCalledTimes(1); // nothing else without a token
  });

  it('strips the token from the URL and keeps it for this tab only', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => undefined)),
    );
    vi.stubGlobal(
      'WebSocket',
      class {
        static OPEN = 1;
        readyState = 0;
        close() {}
        send() {}
      },
    );
    window.history.replaceState(null, '', '/#t=secret-token');
    render(<App />);
    expect(window.location.hash).toBe('');
    expect(sessionStorage.getItem('leettrace.token')).toBe('secret-token');
    expect(screen.getByText('Waiting for a run…')).toBeInTheDocument();
  });
});

describe('Welcome (automatic connection)', () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it('hands the token to the extension — no code shown or typed', async () => {
    stubEngine();
    const send = stubExtension();
    window.history.replaceState(null, '', '/#t=tok&view=welcome&first=1');
    render(<App />);
    expect(await screen.findByText(/Extension connected automatically/)).toBeInTheDocument();
    expect(send).toHaveBeenCalledWith(
      EXTENSION_ID,
      { type: 'leettrace-pair', token: 'tok', port: 47823, version: '1.1.0' },
      expect.any(Function),
    );
    expect(screen.getByText(/is running on this computer/)).toBeInTheDocument();
    expect(screen.queryByText('123-456')).toBeNull(); // the code isn't even fetched
    expect(window.location.hash).toBe('');
  });

  it('without the extension: leads with adding it; the code stays a hidden fallback', async () => {
    stubEngine();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    window.history.replaceState(null, '', '/#t=tok&view=welcome&first=1');
    render(<App />);
    expect(
      await screen.findByText('Welcome! One step left: add the browser extension'),
    ).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Download the extension/ })).toHaveAttribute(
      'href',
      '/downloads/leettrace-chrome-extension.zip',
    );
    expect(await screen.findByText(/Waiting for the extension/)).toBeInTheDocument();
    const trouble = screen.getByText('Trouble connecting?');
    const details = trouble.closest('details')!;
    details.open = true;
    fireEvent(details, new Event('toggle'));
    expect(await screen.findByText('123-456')).toBeVisible();
    screen.getByRole('button', { name: 'Copy code' }).click();
    expect(writeText).toHaveBeenCalledWith('123456');
  });

  it('handToExtension reports a missing extension instead of throwing', async () => {
    expect(await handToExtension('t'.repeat(40), 47823, '1.1.0')).toBe('no-extension');
    stubExtension(false);
    expect(await handToExtension('t'.repeat(40), 47823, '1.1.0')).toBe('no-extension');
    stubExtension(true);
    expect(await handToExtension('t'.repeat(40), 47823, '1.1.0')).toBe('connected');
  });
});
