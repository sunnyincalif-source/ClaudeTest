// Automatic pairing contract (SPEC-PRODUCT §6): the engine's own page (served on
// http://127.0.0.1:<port>) hands the session token to the extension with
// chrome.runtime.sendMessage(EXTENSION_ID, PairMessage) — Chrome's externally_connectable.
// The token still gates every engine request; only its delivery is automatic.

/**
 * The extension's public key (manifest `key`). It pins the extension ID, so the unpacked
 * build and the Chrome Web Store build share one ID. Not a secret.
 */
export const EXTENSION_PUBLIC_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAn+gylYSP0OLSrQJxmbWIYd8T3JwgKPg7iv0B2OUjNrkc0VmGMwPT+clCa3tzs4xfQh1IZWVczlTNGHZ2nsACTB8uKCgM0C2UJBfFGEVTiVcQAVu6xvoJqx4GFNbZTR5TLSObIZQUVp5zLknYO9YZEL97rc9M08esqxgCo5wIRuhjWrOlS/HRhDiB1JDvZm7BCUW5IWMoEfh4jkAbbxKbZf7ZiGTYmiqwWejfobKkf9wV5CI8i89v64mowpop4SetV1nvICyoIfTUzsa6N7Oe0ZESid/RQw0BgUBC0ZPTDq269yuV/PIoXlrPo1VYg4Tn7So/aKHLKKDR6XloM51nXwIDAQAB';

/** Chrome extension ID derived from EXTENSION_PUBLIC_KEY (checked by a unit test). */
export const EXTENSION_ID = 'gjlkgfonngmdpbldpigiodmpfknmbpbp';

export const PAIR_MESSAGE_TYPE = 'leettrace-pair';

export interface PairMessage {
  type: typeof PAIR_MESSAGE_TYPE;
  token: string;
  port: number;
  version: string;
}

export interface PairReply {
  ok: boolean;
  extensionVersion?: string;
  error?: string;
}

/** The engine's page origins that may hand over a token (any port on loopback). */
export function isEngineOrigin(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost');
  } catch {
    return false;
  }
}

/** Validates a pairing message *and* that it came from the engine page on that same port. */
export function parsePairMessage(msg: unknown, senderUrl: string | undefined): PairMessage | null {
  if (!isEngineOrigin(senderUrl) || typeof msg !== 'object' || msg === null) return null;
  const m = msg as Record<string, unknown>;
  if (m.type !== PAIR_MESSAGE_TYPE) return null;
  const { token, port, version } = m;
  if (typeof token !== 'string' || token.length < 32 || token.length > 256) return null;
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1024 || port > 65535)
    return null;
  if (typeof version !== 'string' || version.length > 40) return null;
  if (Number(new URL(senderUrl).port || 80) !== port) return null;
  return { type: PAIR_MESSAGE_TYPE, token, port, version };
}

/** Extension ID for a public key (Chrome: first 32 hex of SHA-256(DER), mapped 0-f → a-p). */
export async function extensionIdFromKey(base64Key: string): Promise<string> {
  const der = Uint8Array.from(atob(base64Key), (c) => c.charCodeAt(0));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', der));
  return Array.from(digest.slice(0, 16))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .replace(/[0-9a-f]/g, (c) => String.fromCharCode(97 + parseInt(c, 16)));
}
