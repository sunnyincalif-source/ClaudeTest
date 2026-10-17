// Build-time fallback for the Download button: bake the latest GitHub Release's asset list
// into the bundle, so downloads still resolve if the visitor hits the API rate limit.
// Never fails the build: with no network or no release yet, it writes `null`.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  (existsSync(join(root, '../../.env')) ? readFileSync(join(root, '../../.env'), 'utf8') : '')
    .split('\n')
    .filter((l) => /^\w+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const repo = process.env.VITE_GITHUB_REPO || env.VITE_GITHUB_REPO;
const out = join(root, 'src', 'generated');
mkdirSync(out, { recursive: true });
let release = null;
try {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(8000),
  });
  if (res.ok) {
    const r = await res.json();
    release = {
      tag: r.tag_name,
      publishedAt: r.published_at,
      htmlUrl: r.html_url,
      assets: r.assets.map((a) => ({
        name: a.name,
        size: a.size,
        url: a.browser_download_url,
        digest: a.digest ?? null,
      })),
    };
  } else {
    console.warn(`fetch-release: ${repo} → HTTP ${res.status}; using the latest/download fallback`);
  }
} catch (e) {
  console.warn(`fetch-release: ${e.message}; using the latest/download fallback`);
}
writeFileSync(join(out, 'release.json'), JSON.stringify(release, null, 2) + '\n');
console.log(`fetch-release: ${release ? release.tag : 'no release baked in'}`);
