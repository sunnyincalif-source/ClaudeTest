// Client for the local engine. Same-origin (the engine serves this UI); the session token
// arrives in the URL fragment (#t=…), which browsers never send to any server — or, when the
// page is opened without one (e.g. by the extension to connect), from /pair/bootstrap, which
// the engine only answers for its own same-origin page.
import { parseTrace, type Trace } from '@leettrace/schema';

const TOKEN_KEY = 'leettrace.token';

export interface Boot {
  token: string | null;
  runId: string | null;
  view: string | null;
  /** First launch after install: lead with "Add the extension". */
  first?: boolean;
}

export function parseHash(hash: string): Boot {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  return {
    token: params.get('t'),
    runId: params.get('run'),
    view: params.get('view'),
    first: params.get('first') === '1' || params.get('extension') === '1',
  };
}

/** Ask the engine for the token (only works for this, its own, page). */
export async function bootstrapToken(): Promise<string | null> {
  try {
    const res = await fetch('/pair/bootstrap', { cache: 'no-store' });
    if (!res.ok) return null;
    const body = (await res.json()) as { token?: string };
    if (body.token) {
      try {
        sessionStorage.setItem(TOKEN_KEY, body.token);
      } catch {
        // storage blocked: fine for this page load
      }
    }
    return body.token ?? null;
  } catch {
    return null;
  }
}

/** Read the token from the fragment (or this tab's session), then strip it from the URL. */
export function boot(): Boot {
  const fromHash = parseHash(window.location.hash);
  let token = fromHash.token;
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else token = sessionStorage.getItem(TOKEN_KEY);
  } catch {
    // storage blocked: the token still works for this page load
  }
  if (fromHash.token || fromHash.runId || fromHash.view) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  return { token, runId: fromHash.runId, view: fromHash.view, first: fromHash.first };
}

export class EngineError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request(token: string, path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
  } catch {
    throw new EngineError(
      'Cannot reach LeetTrace. Is the app still running? (Look for its icon in the tray / menu bar.)',
      0,
    );
  }
  if (res.status === 401) {
    throw new EngineError('This page’s session expired. Reload the page to reconnect.', 401);
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { error?: string; detail?: unknown };
      detail = body.error ?? JSON.stringify(body.detail ?? body);
    } catch {
      // keep statusText
    }
    throw new EngineError(detail, res.status);
  }
  return res;
}

export interface Health {
  version: string;
  runs: number;
  port: number;
  paired: number;
  limits: {
    maxSteps: number;
    maxSeconds: number;
    maxDepth: number;
    maxMemoryMb: number;
    memory: 'enforced' | 'best-effort' | 'unavailable';
    mechanism: string;
  };
}

export interface PairInfo {
  code: string;
  expiresIn: number;
  paired: number;
}

export async function pairCode(token: string): Promise<PairInfo> {
  return (await (await request(token, '/pair/code')).json()) as PairInfo;
}

export async function shutdown(token: string): Promise<void> {
  await request(token, '/shutdown', { method: 'POST', body: '{}' });
}

/** The engine serves the Chrome extension zip when it was bundled into this build. */
export async function extensionZipAvailable(): Promise<boolean> {
  try {
    const res = await fetch(EXTENSION_ZIP, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

export const EXTENSION_ZIP = '/downloads/leettrace-chrome-extension.zip';

export async function health(token: string): Promise<Health> {
  return (await (await request(token, '/health')).json()) as Health;
}

export async function getRun(token: string, runId: string): Promise<Trace> {
  return parseTrace(await (await request(token, `/runs/${encodeURIComponent(runId)}`)).json());
}

export async function traceScript(token: string, code: string, input: string): Promise<Trace> {
  const res = await request(token, '/trace', {
    method: 'POST',
    body: JSON.stringify({ code, input }),
  });
  return parseTrace(await res.json());
}

export interface Case {
  input: string;
  expected?: string;
}

export async function traceLeetCode(token: string, code: string, cases: Case[]): Promise<Trace[]> {
  const res = await request(token, '/leetcode/trace', {
    method: 'POST',
    body: JSON.stringify({ code, cases, language: 'python3' }),
  });
  const body = (await res.json()) as { traces: unknown[] };
  return body.traces.map(parseTrace);
}
