import { useEffect, useState } from 'react';
import { getPairing, PAIRING_KEY, type Pairing } from './storage';

/** The stored connection to the LeetTrace app, kept live as it changes. */
export function useConnection(): Pairing | null | undefined {
  const [pairing, setPairing] = useState<Pairing | null | undefined>(undefined);
  useEffect(() => {
    void getPairing().then(setPairing);
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && PAIRING_KEY in changes) void getPairing().then(setPairing);
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);
  return pairing;
}
