import { createContext, useContext, useEffect, useId, useState, type ReactNode } from 'react';
import baked from './generated/release.json';
import { GITHUB_REPO } from './config';
import { ASSETS, EXTENSION_ZIPS, detect, type Detected, type Platform } from './platform';
import { formatSize, resolveRelease, type RawRelease, type ReleaseInfo } from './release';

interface Downloads {
  detected: Detected | null;
  release: ReleaseInfo | null;
}

const Ctx = createContext<Downloads>({ detected: null, release: null });

export function DownloadsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Downloads>({ detected: null, release: null });
  useEffect(() => {
    let alive = true;
    void Promise.all([detect(), resolveRelease(GITHUB_REPO, baked as RawRelease | null)]).then(
      ([detected, release]) => {
        if (alive) setState({ detected, release });
      },
    );
    return () => {
      alive = false;
    };
  }, []);
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const useDownloads = () => useContext(Ctx);

function shortSha(sha: string | null) {
  return sha ? `${sha.slice(0, 8)}…${sha.slice(-6)}` : null;
}

/** The primary CTA: one big OS-matched download, with every other build one click away. */
export function DownloadButton({ id, compact = false }: { id?: string; compact?: boolean }) {
  const { detected, release } = useDownloads();
  const [open, setOpen] = useState(false);
  const listId = useId();
  const platform = detected?.platform ?? null;
  const asset = platform ? ASSETS[platform] : null;
  const info = asset && release ? release.asset(asset.name) : null;
  const meta = info ? [release?.tag, formatSize(info.size)].filter(Boolean).join(' · ') : null;

  return (
    <div className={`download${compact ? ' compact' : ''}`} id={id}>
      {asset && info ? (
        <a className="btn btn-primary btn-lg" href={info.url} download>
          <DownloadIcon />
          <span>
            Download for {asset.os}
            <small>{meta || asset.label}</small>
          </span>
        </a>
      ) : (
        <button
          type="button"
          className="btn btn-primary btn-lg"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen(!open)}
        >
          <DownloadIcon />
          <span>
            Download LeetTrace
            <small>{detected ? 'for Mac, Windows or Linux' : 'Detecting your system…'}</small>
          </span>
        </button>
      )}
      {asset && info?.sha256 && !compact && (
        <p className="sha" title={`SHA-256 ${info.sha256}`}>
          SHA-256 <code>{shortSha(info.sha256)}</code>
        </p>
      )}
      {platform === 'macos-arm64' && detected && !detected.archKnown && !compact && (
        <p className="arch-note">
          Apple silicon build. On an Intel Mac?{' '}
          <a href={release?.asset(ASSETS['macos-x64'].name).url} download>
            Get the Intel build
          </a>
          .
        </p>
      )}
      {!detected?.platform && detected && (
        <p className="arch-note">
          LeetTrace runs on your computer. Open this page on a Mac, Windows or Linux machine — or
          pick a build below.
        </p>
      )}
      <button
        type="button"
        className="link-btn"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(!open)}
      >
        {open ? 'Hide other platforms' : 'Other platforms & checksums'}
      </button>
      {open && <PlatformList id={listId} current={platform} />}
    </div>
  );
}

function PlatformList({ id, current }: { id: string; current: Platform | null }) {
  const { release } = useDownloads();
  if (!release) return null;
  return (
    <ul className="platforms" id={id}>
      {(Object.keys(ASSETS) as Platform[]).map((p) => {
        const a = release.asset(ASSETS[p].name);
        return (
          <li key={p} aria-current={p === current ? 'true' : undefined}>
            <a href={a.url} download>
              {ASSETS[p].label}
            </a>
            <span className="muted">
              {[formatSize(a.size), a.sha256 ? `sha256 ${shortSha(a.sha256)}` : null]
                .filter(Boolean)
                .join(' · ') || ASSETS[p].name}
            </span>
          </li>
        );
      })}
      <li>
        <a href={release.asset(EXTENSION_ZIPS.chrome).url} download>
          Chrome extension (.zip)
        </a>
        <span className="muted">Load unpacked — see the install steps</span>
      </li>
      <li>
        <a href={release.asset(EXTENSION_ZIPS.firefox).url} download>
          Firefox extension (.zip)
        </a>
        <span className="muted">about:debugging → Load Temporary Add-on</span>
      </li>
      <li>
        <a href={release.checksumsUrl}>SHA256SUMS</a>
        <span className="muted">
          {release.tag ? `${release.tag} · ` : ''}
          <a href={release.pageUrl}>release notes</a>
        </span>
      </li>
    </ul>
  );
}

function DownloadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19.5h14" />
    </svg>
  );
}
