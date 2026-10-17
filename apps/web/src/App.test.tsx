import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseHash } from './api';
import { App } from './App';

describe('boot', () => {
  it('reads the token and run id from the fragment', () => {
    expect(parseHash('#t=abc&run=r1')).toEqual({ token: 'abc', runId: 'r1' });
    expect(parseHash('')).toEqual({ token: null, runId: null });
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
