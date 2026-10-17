// The local welcome page: what opens when the LeetTrace app starts (first launch, tray
// "Open LeetTrace"). Status, one prominent "Add the extension" step, and the automatic
// connection — this page hands the token to the extension, so nothing is typed. A one-time
// code stays available as a hidden last resort (e.g. Firefox).
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EXTENSION_ZIP,
  extensionZipAvailable,
  health,
  pairCode,
  shutdown,
  type Health,
  type PairInfo,
} from './api';
import { handToExtension, STORE_URL, type Handover } from './extension';

const SITE_URL = (
  import.meta.env.VITE_LEETTRACE_SITE_URL || 'https://leettrace.vercel.app'
).replace(/\/+$/, '');
const SITE_INSTALL = `${SITE_URL}/#install`;
const HANDOVER_EVERY_MS = 2500;

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

/** Keeps offering the token to the extension until it accepts (e.g. right after install). */
function useHandover(token: string, info: Health | null): Handover | null {
  const [state, setState] = useState<Handover | null>(null);
  const done = useRef(false);
  useEffect(() => {
    if (!info) return;
    let timer: number | undefined;
    const attempt = async () => {
      const r = await handToExtension(token, info.port, info.version);
      setState(r);
      if (r === 'connected') done.current = true;
      else timer = window.setTimeout(() => void attempt(), HANDOVER_EVERY_MS);
    };
    if (!done.current) void attempt();
    return () => window.clearTimeout(timer);
  }, [token, info]);
  return state;
}

export function Welcome({
  token,
  first,
  onError,
  onDone,
}: {
  token: string;
  first?: boolean;
  onError: (e: string) => void;
  onDone: () => void;
}) {
  const [info, setInfo] = useState<Health | null>(null);
  const [pair, setPair] = useState<PairInfo | null>(null);
  const [zip, setZip] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [copied, copy] = useCopy();
  const handover = useHandover(token, info);
  const connected = handover === 'connected' || (pair?.paired ?? 0) > 0;

  useEffect(() => {
    health(token)
      .then(setInfo)
      .catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)));
    void extensionZipAvailable().then(setZip);
  }, [token, onError]);

  // The manual code is only fetched (and refreshed) while its section is open.
  useEffect(() => {
    if (!showCode) return;
    const load = () =>
      pairCode(token)
        .then(setPair)
        .catch(() => undefined);
    void load();
    const id = window.setInterval(load, 3000);
    return () => window.clearInterval(id);
  }, [token, showCode]);

  if (stopped) {
    return (
      <section className="card welcome" aria-labelledby="w-title">
        <h1 id="w-title">LeetTrace stopped</h1>
        <p>Open the LeetTrace app again whenever you want to trace.</p>
      </section>
    );
  }

  const pretty = pair ? `${pair.code.slice(0, 3)}-${pair.code.slice(3)}` : '······';
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
        <h1 id="w-title">
          {connected
            ? 'All set — open any LeetCode problem and click Trace'
            : first
              ? 'Welcome! One step left: add the browser extension'
              : 'You’re one step from tracing on LeetCode'}
        </h1>
        <p className="muted">
          LeetTrace runs in the background (look for its icon in the tray or menu bar) and starts
          when you log in. Your code never leaves this machine.
        </p>
      </section>

      <ol className="welcome-steps">
        <li className="card">
          <h2>
            <span className="step-no">1</span> Add the LeetTrace extension
          </h2>
          {connected ? (
            <p className="ext-status ok" role="status">
              ✓ Extension connected automatically — nothing to type.
            </p>
          ) : (
            <>
              {STORE_URL ? (
                <p>
                  <a className="button primary" href={STORE_URL} target="_blank" rel="noreferrer">
                    Add to Chrome
                  </a>
                </p>
              ) : (
                <>
                  <p>
                    {zip ? (
                      <a className="button primary" href={EXTENSION_ZIP} download>
                        Download the extension (.zip)
                      </a>
                    ) : (
                      <a
                        className="button primary"
                        href={SITE_INSTALL}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Get the extension
                      </a>
                    )}
                  </p>
                  <ol className="substeps">
                    <li>Unzip it into a folder you’ll keep.</li>
                    <li>
                      Open <code>chrome://extensions</code> and turn on{' '}
                      <strong>Developer mode</strong>.
                    </li>
                    <li>
                      Click <strong>Load unpacked</strong> and select the folder.
                    </li>
                  </ol>
                </>
              )}
              <p className="ext-status muted" aria-live="polite">
                {handover === null
                  ? 'Checking for the extension…'
                  : 'Waiting for the extension — it connects to this app automatically once added.'}
              </p>
            </>
          )}
        </li>

        <li className="card">
          <h2>
            <span className="step-no">2</span> Open a LeetCode problem and hit Trace
          </h2>
          <p>
            A <strong>Trace</strong> button sits next to Run. Write Python 3, click it, and step
            through your solution against the problem’s examples — stack, memory and pointers.
          </p>
          <p className="muted small">
            If Chrome asks whether leetcode.com may use <strong>apps on this device</strong>, choose{' '}
            <strong>Allow</strong>: it only lets LeetCode talk to LeetTrace on this computer.
          </p>
          <p>
            <button type="button" className="ghost" onClick={onDone}>
              See runs from the terminal
            </button>
          </p>
        </li>
      </ol>

      <section className="card welcome-foot" aria-label="Engine status">
        <details
          className="trouble"
          onToggle={(e) => setShowCode((e.currentTarget as HTMLDetailsElement).open)}
        >
          <summary>Trouble connecting?</summary>
          <p className="small">
            Reload this page after adding the extension. Still not connected (or using Firefox)? In
            the LeetTrace panel on LeetCode, open <em>Other ways to connect</em> and enter this
            one-time code:
          </p>
          <div className="pair">
            <output
              className="pair-code"
              aria-label={`One-time code ${pretty.split('').join(' ')}`}
            >
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
        </details>
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
          Quit from the tray / menu-bar icon, or:{' '}
          <button
            type="button"
            className="ghost"
            onClick={() => {
              if (
                window.confirm(
                  'Stop LeetTrace? The extension will show “Start the LeetTrace app” until you reopen it.',
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

/** Opened by the extension (in a background tab) just to hand over the token. */
export function ConnectView({ token }: { token: string }) {
  const [state, setState] = useState<Handover | null>(null);
  useEffect(() => {
    let cancelled = false;
    void health(token).then(async (h) => {
      for (let i = 0; i < 8 && !cancelled; i++) {
        const r = await handToExtension(token, h.port, h.version);
        setState(r);
        if (r === 'connected') return;
        await new Promise((res) => setTimeout(res, 500));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [token]);
  return (
    <section className="card connect-card" aria-live="polite">
      <h1>
        {state === 'connected'
          ? '✓ LeetTrace is connected'
          : state === 'no-extension'
            ? 'LeetTrace extension not found'
            : 'Connecting LeetTrace…'}
      </h1>
      <p className="muted">
        {state === 'connected'
          ? 'You can close this tab and go back to LeetCode.'
          : state === 'no-extension'
            ? 'Add the LeetTrace extension to Chrome, then reload this page.'
            : 'Handing your browser the key to the app on this computer.'}
      </p>
    </section>
  );
}
