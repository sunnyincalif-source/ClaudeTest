// Pairing state lives in extension storage, which page scripts on leetcode.com can't read.
export interface Pairing {
  port: number;
  token: string;
  version: string;
  /** How it was delivered: automatically by the engine's page, or a manual code. */
  via?: 'auto' | 'code';
}

export const PAIRING_KEY = 'leettrace.pairing';

export async function getPairing(): Promise<Pairing | null> {
  const got = await chrome.storage.local.get(PAIRING_KEY);
  const p = got[PAIRING_KEY] as Pairing | undefined;
  return p && typeof p.token === 'string' && typeof p.port === 'number' ? p : null;
}

export async function setPairing(p: Pairing): Promise<void> {
  await chrome.storage.local.set({ [PAIRING_KEY]: p });
}

export async function clearPairing(): Promise<void> {
  await chrome.storage.local.remove(PAIRING_KEY);
}

/** Resolves when a new pairing is stored (e.g. by the engine's page), or null on timeout. */
export function waitForPairing(timeoutMs: number, previousToken?: string): Promise<Pairing | null> {
  return new Promise((resolve) => {
    const done = (p: Pairing | null) => {
      clearTimeout(timer);
      chrome.storage.onChanged.removeListener(onChange);
      resolve(p);
    };
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      const next = changes[PAIRING_KEY]?.newValue as Pairing | undefined;
      if (area === 'local' && next?.token && next.token !== previousToken) done(next);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    chrome.storage.onChanged.addListener(onChange);
  });
}
