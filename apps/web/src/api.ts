// Client for the local engine. Same-origin (the engine serves this UI); the session token
// arrives in the URL fragment (#t=…), which browsers never send to any server.
import { parseTrace, type Trace } from '@leettrace/schema';

const TOKEN_KEY = 'leettrace.token';

export interface Boot {
  token: string | null;
  runId: string | null;
}

export function parseHash(hash: string): Boot {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  return { token: params.get('t'), runId: params.get('run') };
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
  if (fromHash.token || fromHash.runId) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  return { token, runId: fromHash.runId };
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
      'Cannot reach the LeetTrace engine. Is `leettrace start` still running?',
      0,
    );
  }
  if (res.status === 401) {
    throw new EngineError(
      'This page’s session expired (the engine restarted). Run `leettrace open` to reconnect.',
      401,
    );
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
}

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
