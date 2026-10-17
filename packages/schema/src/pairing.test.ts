import { describe, expect, it } from 'vitest';
import {
  EXTENSION_ID,
  EXTENSION_PUBLIC_KEY,
  extensionIdFromKey,
  isEngineOrigin,
  parsePairMessage,
} from './pairing';

const token = 'x'.repeat(43);

describe('automatic pairing contract', () => {
  it('pins the extension ID to the manifest key', async () => {
    expect(await extensionIdFromKey(EXTENSION_PUBLIC_KEY)).toBe(EXTENSION_ID);
    expect(EXTENSION_ID).toMatch(/^[a-p]{32}$/);
  });

  it('accepts a pairing message only from the engine page on the same port', () => {
    const msg = { type: 'leettrace-pair', token, port: 47823, version: '1.1.0' };
    expect(parsePairMessage(msg, 'http://127.0.0.1:47823/#view=connect')).toEqual(msg);
    expect(parsePairMessage(msg, 'http://localhost:47823/')).toEqual(msg);
    // wrong port, wrong host, https, other sites
    expect(parsePairMessage(msg, 'http://127.0.0.1:47824/')).toBeNull();
    expect(parsePairMessage(msg, 'https://127.0.0.1:47823/')).toBeNull();
    expect(parsePairMessage(msg, 'https://leetcode.com/problems/two-sum/')).toBeNull();
    expect(parsePairMessage(msg, 'http://127.0.0.1.evil.example:47823/')).toBeNull();
    expect(parsePairMessage(msg, undefined)).toBeNull();
  });

  it('rejects malformed messages', () => {
    const base = { type: 'leettrace-pair', token, port: 47823, version: '1.1.0' };
    const url = 'http://127.0.0.1:47823/';
    for (const bad of [
      null,
      'leettrace-pair',
      { ...base, type: 'other' },
      { ...base, token: 'short' },
      { ...base, token: 42 },
      { ...base, port: '47823' },
      { ...base, port: 80 },
      { ...base, version: 1 },
    ])
      expect(parsePairMessage(bad, url)).toBeNull();
  });

  it('recognises engine origins', () => {
    expect(isEngineOrigin('http://127.0.0.1:1234/x')).toBe(true);
    expect(isEngineOrigin('http://localhost:9/')).toBe(true);
    expect(isEngineOrigin('http://192.168.1.2:47823/')).toBe(false);
    expect(isEngineOrigin('not a url')).toBe(false);
  });
});
