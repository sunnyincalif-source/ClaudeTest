// Resolve real download URLs for the latest GitHub Release: the public Releases API first,
// then the release baked in at build time, then GitHub's stable /releases/latest/download/
// URLs (which work for any release because asset names carry no version).
import { RELEASES_URL, latestDownload } from './config';

export interface ReleaseAsset {
  name: string;
  url: string;
  size: number | null;
  sha256: string | null;
}

export interface ReleaseInfo {
  tag: string | null;
  source: 'api' | 'build' | 'fallback';
  pageUrl: string;
  checksumsUrl: string;
  asset(name: string): ReleaseAsset;
  /** The first of these names that the release actually has (else the first name). */
  pick(...names: (string | undefined)[]): ReleaseAsset;
}

export interface RawRelease {
  tag: string;
  htmlUrl: string;
  assets: { name: string; url: string; size: number; digest: string | null }[];
}

function build(raw: RawRelease | null, source: ReleaseInfo['source']): ReleaseInfo {
  const byName = new Map((raw?.assets ?? []).map((a) => [a.name, a]));
  return {
    tag: raw?.tag ?? null,
    source,
    pageUrl: raw?.htmlUrl ?? `${RELEASES_URL}/latest`,
    checksumsUrl: byName.get('SHA256SUMS')?.url ?? latestDownload('SHA256SUMS'),
    asset(name) {
      const a = byName.get(name);
      return {
        name,
        url: a?.url ?? latestDownload(name),
        size: a?.size ?? null,
        sha256: a?.digest?.startsWith('sha256:') ? a.digest.slice(7) : null,
      };
    },
    pick(...names) {
      const wanted = names.filter((n): n is string => !!n);
      return this.asset(wanted.find((n) => byName.has(n)) ?? wanted[0]!);
    },
  };
}

interface ApiRelease {
  tag_name: string;
  html_url: string;
  assets: { name: string; size: number; browser_download_url: string; digest?: string | null }[];
}

const CACHE_KEY = 'leettrace.release';

export async function resolveRelease(
  repo: string,
  baked: RawRelease | null,
  f: typeof fetch = fetch,
): Promise<ReleaseInfo> {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) return build(JSON.parse(cached) as RawRelease, 'api');
  } catch {
    // storage unavailable: just fetch
  }
  try {
    const res = await f(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (res.ok) {
      const r = (await res.json()) as ApiRelease;
      const raw: RawRelease = {
        tag: r.tag_name,
        htmlUrl: r.html_url,
        assets: r.assets.map((a) => ({
          name: a.name,
          url: a.browser_download_url,
          size: a.size,
          digest: a.digest ?? null,
        })),
      };
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(raw));
      } catch {
        // ignore
      }
      return build(raw, 'api');
    }
  } catch {
    // offline / blocked / rate-limited: fall back below
  }
  return baked ? build(baked, 'build') : build(null, 'fallback');
}

export function formatSize(bytes: number | null): string | null {
  if (bytes == null) return null;
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}
