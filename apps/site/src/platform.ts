// Which download fits this visitor? Uses UA Client Hints where available, UA sniffing
// otherwise. Never sends anything anywhere.

export type Platform = 'macos-arm64' | 'macos-x64' | 'windows-x64' | 'linux-x64';

export interface Asset {
  platform: Platform;
  name: string; // release asset file name (version-less → stable latest/download URL)
  /** The v1.0 name of the same download, used while the latest release predates v1.1. */
  legacy?: string;
  os: 'macOS' | 'Windows' | 'Linux';
  label: string;
}

export const ASSETS: Record<Platform, Asset> = {
  'macos-arm64': {
    platform: 'macos-arm64',
    name: 'LeetTrace-macos-arm64.dmg',
    os: 'macOS',
    label: 'macOS · Apple silicon',
  },
  'macos-x64': {
    platform: 'macos-x64',
    name: 'LeetTrace-macos-x64.dmg',
    os: 'macOS',
    label: 'macOS · Intel',
  },
  'windows-x64': {
    platform: 'windows-x64',
    name: 'LeetTrace-Setup-windows-x64.exe',
    legacy: 'LeetTrace-windows-x64.exe',
    os: 'Windows',
    label: 'Windows · x64 installer',
  },
  'linux-x64': {
    platform: 'linux-x64',
    name: 'LeetTrace-linux-x86_64.AppImage',
    legacy: 'leettrace-linux-x64',
    os: 'Linux',
    label: 'Linux · x64 AppImage',
  },
};

/** The terminal-only binary for Linux power users. */
export const LINUX_CLI = 'leettrace-linux-x64';

export const EXTENSION_ZIPS = {
  chrome: 'leettrace-chrome-extension.zip',
  firefox: 'leettrace-firefox-extension.zip',
} as const;

export interface Detected {
  platform: Platform | null; // null on phones/tablets/unknown
  /** False when we guessed the Mac's chip (Safari/Firefox don't expose it). */
  archKnown: boolean;
}

interface UAData {
  platform?: string;
  mobile?: boolean;
  getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string; platform?: string }>;
}

export function detectFromUA(ua: string): Detected {
  if (/android|iphone|ipad|ipod|mobile/i.test(ua)) return { platform: null, archKnown: true };
  if (/windows/i.test(ua)) return { platform: 'windows-x64', archKnown: true };
  if (/mac os x|macintosh/i.test(ua)) return { platform: 'macos-arm64', archKnown: false };
  if (/linux|x11|cros/i.test(ua)) return { platform: 'linux-x64', archKnown: true };
  return { platform: null, archKnown: true };
}

export async function detect(nav: Navigator = navigator): Promise<Detected> {
  const uaData = (nav as Navigator & { userAgentData?: UAData }).userAgentData;
  const base = detectFromUA(nav.userAgent);
  if (!uaData) return base;
  if (uaData.mobile) return { platform: null, archKnown: true };
  const p = (uaData.platform ?? '').toLowerCase();
  if (p === 'macos' && uaData.getHighEntropyValues) {
    try {
      const { architecture } = await uaData.getHighEntropyValues(['architecture']);
      if (architecture === 'arm') return { platform: 'macos-arm64', archKnown: true };
      if (architecture === 'x86') return { platform: 'macos-x64', archKnown: true };
    } catch {
      // fall through to the UA guess
    }
  }
  if (p === 'windows') return { platform: 'windows-x64', archKnown: true };
  if (p === 'linux' || p === 'chrome os') return { platform: 'linux-x64', archKnown: true };
  return base;
}
