// Automatic pairing, page side (SPEC-PRODUCT §6): this page is served by the engine on
// 127.0.0.1, so it may read the session token; it hands it to the LeetTrace extension via
// chrome.runtime.sendMessage (the extension lists this origin in externally_connectable and
// checks the sender). No code is shown or typed.
import {
  EXTENSION_ID,
  PAIR_MESSAGE_TYPE,
  type PairMessage,
  type PairReply,
} from '@leettrace/schema';

const extra = (import.meta.env.VITE_EXTRA_EXTENSION_IDS ?? '')
  .split(',')
  .map((s: string) => s.trim())
  .filter(Boolean);

/** The pinned ID (unpacked + store builds share it) plus any extra IDs set at build time. */
export const EXTENSION_IDS: string[] = [EXTENSION_ID, ...extra];

/** Chrome's "Add to Chrome" link, once the Web Store listing is live (empty = unpacked). */
export const STORE_URL: string = import.meta.env.VITE_CHROME_STORE_URL ?? '';

interface Runtime {
  sendMessage(id: string, msg: unknown, cb: (reply: unknown) => void): void;
  lastError?: unknown;
}

function runtime(): Runtime | null {
  const rt = (globalThis as { chrome?: { runtime?: Runtime } }).chrome?.runtime;
  return rt && typeof rt.sendMessage === 'function' ? rt : null;
}

export type Handover = 'connected' | 'no-extension';

/** Try each known extension ID; resolves 'connected' once one accepts the token. */
export async function handToExtension(
  token: string,
  port: number,
  version: string,
): Promise<Handover> {
  const rt = runtime();
  if (!rt) return 'no-extension';
  const msg: PairMessage = { type: PAIR_MESSAGE_TYPE, token, port, version };
  for (const id of EXTENSION_IDS) {
    const reply = await new Promise<PairReply | null>((resolve) => {
      try {
        rt.sendMessage(id, msg, (r) => {
          void rt.lastError; // "no such extension" lands here; not an error for us
          resolve((r as PairReply | undefined) ?? null);
        });
      } catch {
        resolve(null);
      }
    });
    if (reply?.ok) return 'connected';
  }
  return 'no-extension';
}
