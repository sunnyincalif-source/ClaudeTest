// The local welcome page: what you see when you double-click the app (or run `leettrace`).
// Status, the one-time pairing code (copyable), and the extension install step — so the
// happy path needs no terminal at all.
import { useCallback, useEffect, useState } from 'react';
import {
  EXTENSION_ZIP,
  extensionZipAvailable,
  health,
  pairCode,
  shutdown,
  type Health,
  type PairInfo,
} from './api';

const SITE_URL = (
  import.meta.env.VITE_LEETTRACE_SITE_URL || 'https://leettrace.vercel.app'
).replace(/\/+$/, '');
const SITE_INSTALL = `${SITE_URL}/#install`;

function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const copy = useCallback((text: string) => {
    const done = () => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done, () => undefined);
    }
  }, []);
  return [copied, copy];
}

export function Welcome({
  token,
  onError,
  onDone,
}: {
  token: string;
  onError: (e: string) => void;
  onDone: () => void;
}) {
  const [info, setInfo] = useState<Health | null>(null);
  const [pair, setPair] = useState<PairInfo | null>(null);
  const [zip, setZip] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [copied, copy] = useCopy();

  const poll = useCallback(async () => {
    try {
      const [h, p] = await Promise.all([health(token), pairCode(token)]);
      setInfo(h);
      setPair(p);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }, [token, onError]);

  useEffect(() => {
    void poll();
    void extensionZipAvailable().then(setZip);
    // Refresh the code (it rotates after use/expiry) and notice a new pairing.
    const id = window.setInterval(() => void poll(), 3000);
    return () => window.clearInterval(id);
  }, [poll]);

  if (stopped) {
    return (
      <section className="card welcome" aria-labelledby="w-title">
        <h1 id="w-title">LeetTrace stopped</h1>
        <p>The engine has shut down. Open the LeetTrace app again whenever you want to trace.</p>
      </section>
    );
  }

  const pretty = pair ? `${pair.code.slice(0, 3)}-${pair.code.slice(3)}` : '······';
  const paired = (info?.paired ?? 0) > 0;
  const mem = info?.limits.memory;

  return (
    <div className="welcome">
      <section className="card welcome-hero" aria-labelledby="w-title">
        <div className="status-line" role="status">
          <span className="dot ok" aria-hidden="true" />
          <span>
            LeetTrace {info ? `v${info.version}` : ''} is running on this computer
            {info ? ` (127.0.0.1:${info.port})` : ''}.
          </span>
        </div>
        <h1 id="w-title">You’re one step from tracing on LeetCode</h1>
        <p className="muted">
          Keep this app running while you practice. Your code never leaves this machine.
        </p>
      </section>

      <ol className="welcome-steps">
        <li className="card">
          <h2>
            <span className="step-no">1</span> Add the browser extension
          </h2>
          <p>
            {zip ? (
              <>
                <a className="button primary" href={EXTENSION_ZIP} download>
                  Download the extension (.zip)
                </a>{' '}
              </>
            ) : (
              <>
                Get the extension zip from the{' '}
                <a href={SITE_INSTALL} target="_blank" rel="noreferrer">
                  install page
                </a>
                .{' '}
              </>
            )}
          </p>
          <ol className="substeps">
            <li>Unzip it into a folder you’ll keep.</li>
            <li>
              Open <code>chrome://extensions</code> and turn on <strong>Developer mode</strong>.
            </li>
            <li>
              Click <strong>Load unpacked</strong> and select the folder.
            </li>
          </ol>
          <p className="muted small">
            Already installed it from the Chrome Web Store? Skip this step.
          </p>
        </li>

        <li className="card">
          <h2>
            <span className="step-no">2</span> Pair it with this app
          </h2>
          <p>
            Open any LeetCode problem and click <strong>Trace</strong> (next to Run). Paste this
            code into the panel — once:
          </p>
          <div className="pair">
            <output className="pair-code" aria-label={`Pairing code ${pretty.split('').join(' ')}`}>
              {pretty}
            </output>
            <button
              type="button"
              className="primary"
              onClick={() => pair && copy(pair.code)}
              disabled={!pair}
            >
              {copied ? 'Copied ✓' : 'Copy code'}
            </button>
          </div>
          <p className="muted small" aria-live="polite">
            {paired
              ? '✓ Extension connected. You can close this tab.'
              : pair
                ? `One use · valid for ${Math.max(1, Math.round(pair.expiresIn / 60))} more min · a new one appears here automatically.`
                : 'Loading…'}
          </p>
        </li>

        <li className="card">
          <h2>
            <span className="step-no">3</span> Hit Trace
          </h2>
          <p>
            Write Python 3, click Trace, and step through your solution against the problem’s
            examples — stack, memory, and pointers.
          </p>
          <p>
            <button type="button" className="ghost" onClick={onDone}>
              See runs from the terminal
            </button>
          </p>
        </li>
      </ol>

      <section className="card welcome-foot" aria-label="Engine status">
        <p className="small muted">
          Limits per run: {info?.limits.maxSteps.toLocaleString() ?? '…'} steps ·{' '}
          {info?.limits.maxSeconds ?? '…'} s · depth {info?.limits.maxDepth ?? '…'} · memory{' '}
          {mem === 'enforced'
            ? `${info?.limits.maxMemoryMb} MB`
            : mem
              ? `cap ${mem} (${info?.limits.mechanism})`
              : '…'}
          .
        </p>
        <p className="small muted">
          Stop anytime by closing the LeetTrace window, pressing Ctrl+C in it, or:{' '}
          <button
            type="button"
            className="ghost"
            onClick={() => {
              if (
                window.confirm(
                  'Stop the LeetTrace engine? The extension will show “Start the LeetTrace app” until you reopen it.',
                )
              ) {
                void shutdown(token).then(() => setStopped(true));
              }
            }}
          >
            Stop LeetTrace
          </button>
        </p>
      </section>
    </div>
  );
}
