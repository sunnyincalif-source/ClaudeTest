// Pairing state lives in extension storage, which page scripts on leetcode.com can't read.
export interface Pairing {
  port: number;
  token: string;
  version: string;
}

const KEY = 'leettrace.pairing';

export async function getPairing(): Promise<Pairing | null> {
  const got = await chrome.storage.local.get(KEY);
  const p = got[KEY] as Pairing | undefined;
  return p && typeof p.token === 'string' && typeof p.port === 'number' ? p : null;
}

export async function setPairing(p: Pairing): Promise<void> {
  await chrome.storage.local.set({ [KEY]: p });
}

export async function clearPairing(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}
