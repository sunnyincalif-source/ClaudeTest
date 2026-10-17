import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseHash } from './api';
import { App } from './App';

describe('boot', () => {
  it('reads the token and run id from the fragment', () => {
    expect(parseHash('#t=abc&run=r1')).toEqual({ token: 'abc', runId: 'r1', view: null });
    expect(parseHash('#t=abc&view=welcome').view).toBe('welcome');
    expect(parseHash('')).toEqual({ token: null, runId: null, view: null });
  });
});

describe('App', () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it('shows onboarding without a token and makes no requests', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    window.history.replaceState(null, '', '/');
    render(<App />);
    expect(screen.getByText('Open LeetTrace from your terminal')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
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

describe('Welcome (friendly launch)', () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it('shows status and a copyable pairing code without any terminal step', async () => {
    const responses: Record<string, unknown> = {
      '/health': {
        version: '0.1.0',
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
      },
      '/pair/code': { code: '123456', expiresIn: 900, paired: 0 },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url in responses) return new Response(JSON.stringify(responses[url]), { status: 200 });
        return new Response('', { status: 200 }); // HEAD on the extension zip
      }),
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
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    window.history.replaceState(null, '', '/#t=tok&view=welcome');
    render(<App />);
    expect(await screen.findByText('123-456')).toBeInTheDocument();
    expect(screen.getByText(/is running on this computer/)).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Download the extension/ })).toHaveAttribute(
      'href',
      '/downloads/leettrace-chrome-extension.zip',
    );
    screen.getByRole('button', { name: 'Copy code' }).click();
    expect(writeText).toHaveBeenCalledWith('123456');
    expect(window.location.hash).toBe('');
  });
});
