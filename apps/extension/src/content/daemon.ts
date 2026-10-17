// Client for the local LeetTrace engine, used from the content script so requests carry
// `Origin: https://leetcode.com` — the one browser origin (besides the engine's own UI) on
// the engine's allowlist. The session token comes from a one-time pairing confirmed with
// a code shown in the user's terminal (SPEC §8).
import { isCompatibleEngine, parseTrace, SCHEMA_VERSION, type Trace } from '@leettrace/schema';
import { clearPairing, getPairing, setPairing, type Pairing } from '../shared/storage';

export const DEFAULT_PORT = 47823;
export const PORT_SCAN = 10;

export type DaemonStatus =
  | { kind: 'offline'; localNetworkBlocked?: boolean }
  | { kind: 'unpaired'; port: number }
  | { kind: 'ready'; pairing: Pairing; version: string }
  | { kind: 'outdated'; pairing: Pairing; version: string };

export class DaemonError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type Fetch = typeof fetch;

/**
 * Chrome's Local Network Access asks the user before leetcode.com may reach 127.0.0.1.
 * 'prompt' means the next request will show that permission bubble.
 */
// Chrome renamed this permission over time ('local-network-access' → 'loopback-network' /
// 'local-network'); ask for every name and use the first one the browser knows.
const LNA_PERMISSION_NAMES = ['loopback-network', 'local-network-access', 'local-network'];

export async function localNetworkPermission(): Promise<PermissionState | 'unsupported'> {
  for (const name of LNA_PERMISSION_NAMES) {
    try {
      const status = await navigator.permissions.query({ name: name as PermissionName });
      return status.state;
    } catch {
      // unknown name in this browser: try the next one
    }
  }
  return 'unsupported';
}

/** Tells Chrome's Local Network Access this request intentionally targets this machine. */
const LOOPBACK = { targetAddressSpace: 'loopback' } as RequestInit;

async function probe(
  port: number,
  token: string | null,
  f: Fetch,
  timeoutMs = 1200,
): Promise<Response | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await f(`http://127.0.0.1:${port}/health`, {
      ...LOOPBACK,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    return res.headers.get('X-LeetTrace') ? res : null;
  } catch {
    return null;
  }
}

/** Find the engine and whether our stored pairing still works. */
export async function checkDaemon(f: Fetch = fetch): Promise<DaemonStatus> {
  const pairing = await getPairing();
  const permission = await localNetworkPermission();
  if (permission === 'denied') return { kind: 'offline', localNetworkBlocked: true };
  // The first request may show Chrome's "allow access to apps on this device" bubble; give
  // the user time to answer it. (A stopped engine still fails fast: connection refused.)
  const firstTimeout = permission === 'granted' ? 3000 : 60_000;
  if (pairing) {
    const res = await probe(pairing.port, pairing.token, f, firstTimeout);
    if (res?.ok) {
      const { version } = (await res.json()) as { version: string };
      return isCompatibleEngine(version, SCHEMA_VERSION)
        ? { kind: 'ready', pairing, version }
        : { kind: 'outdated', pairing, version };
    }
    if (res?.status === 401) {
      await clearPairing(); // engine restarted with a new token: pair again
      return { kind: 'unpaired', port: pairing.port };
    }
  }
  for (let port = DEFAULT_PORT; port <= DEFAULT_PORT + PORT_SCAN; port++) {
    const res = await probe(port, null, f, port === DEFAULT_PORT && !pairing ? firstTimeout : 1200);
    if (res) return { kind: 'unpaired', port };
  }
  return { kind: 'offline', localNetworkBlocked: (await localNetworkPermission()) === 'denied' };
}

async function postJson(url: string, body: unknown, f: Fetch, token?: string): Promise<Response> {
  let res: Response;
  try {
    res = await f(url, {
      ...LOOPBACK,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new DaemonError(
      'Lost connection to the LeetTrace engine. Is `leettrace start` running?',
      0,
    );
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = ((await res.json()) as { error?: string }).error ?? msg;
    } catch {
      // keep statusText
    }
    throw new DaemonError(msg, res.status);
  }
  return res;
}

export async function requestPairing(port: number, f: Fetch = fetch): Promise<string> {
  const res = await postJson(
    `http://127.0.0.1:${port}/pair/request`,
    { client: 'LeetTrace extension' },
    f,
  );
  return ((await res.json()) as { requestId: string }).requestId;
}

export async function confirmPairing(
  port: number,
  requestId: string,
  code: string,
  f: Fetch = fetch,
): Promise<Pairing> {
  const res = await postJson(`http://127.0.0.1:${port}/pair/confirm`, { requestId, code }, f);
  const body = (await res.json()) as { token: string; port: number; version: string };
  const pairing = { port: body.port, token: body.token, version: body.version };
  await setPairing(pairing);
  return pairing;
}

export interface TraceRequest {
  code: string;
  slug: string | null;
  cases: { input: string; expected?: string }[];
}

export async function traceCases(
  pairing: Pairing,
  req: TraceRequest,
  f: Fetch = fetch,
): Promise<Trace[]> {
  const res = await postJson(
    `http://127.0.0.1:${pairing.port}/leetcode/trace`,
    { code: req.code, language: 'python3', slug: req.slug, cases: req.cases, publish: true },
    f,
    pairing.token,
  );
  const body = (await res.json()) as { traces: unknown[] };
  return body.traces.map(parseTrace);
}
