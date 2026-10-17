import { useCallback, useEffect, useRef, useState } from 'react';
import type { Trace } from '@leettrace/schema';
import { TraceViewer } from '@leettrace/viz';
import { BrandMark } from '../shared/BrandMark';
import { INSTALL_URL, SITE_URL } from '../shared/config';
import { clearPairing, PAIRING_KEY } from '../shared/storage';
import { bus } from './bus';
import {
  autoConnect,
  checkDaemon,
  confirmPairing,
  DaemonError,
  traceCases,
  type DaemonStatus,
} from './daemon';
import {
  isPythonLabel,
  readProblem,
  readVisibleEditorText,
  type ExampleCase,
  type ProblemInfo,
} from './leetcodePage';

export interface EditorRead {
  code: string;
  languageId: string | null;
  lossy?: boolean;
}

async function readEditor(): Promise<EditorRead | null> {
  try {
    const res = (await chrome.runtime.sendMessage({
      type: 'leettrace:readEditor',
    })) as EditorRead | null;
    if (res?.code) return res;
  } catch {
    // background unavailable: fall back below
  }
  const text = readVisibleEditorText();
  return text ? { code: text, languageId: null, lossy: true } : null;
}

const RETRY_DELAYS_MS = [2000, 4000, 8000, 15000, 30000];

export function Panel({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [status, setStatus] = useState<DaemonStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [problem, setProblem] = useState<ProblemInfo | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set([0]));
  const [custom, setCustom] = useState('');
  const [traces, setTraces] = useState<Trace[] | null>(null);
  const [which, setWhich] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pastedCode, setPastedCode] = useState('');
  const [needCode, setNeedCode] = useState(false);
  const autoTried = useRef(new Set<string>());

  /** Check the engine; if it's there but we hold no (valid) token, connect automatically. */
  const refresh = useCallback(async (interactive = false): Promise<DaemonStatus> => {
    let st = await checkDaemon(fetch, { interactive });
    if (st.kind === 'unpaired') {
      // Silent handshake through the engine's own page, once per port per page view (a
      // second failure shows the one-click Connect instead of looping).
      const key = String(st.port);
      if (!autoTried.current.has(key)) {
        autoTried.current.add(key);
        setStatus(st);
        setConnecting(true);
        const paired = await autoConnect(st.port);
        setConnecting(false);
        if (paired) st = await checkDaemon(fetch, { interactive });
      }
    }
    setStatus(st);
    return st;
  }, []);

  const loadProblem = useCallback(() => {
    const p = readProblem();
    setProblem(p);
    setSelected(new Set(p.examples.map((_, i) => i).slice(0, 3)));
  }, []);

  const runTrace = useCallback(async () => {
    setOpen(true);
    setError(null);
    setNotice(null);
    const st = status?.kind === 'ready' ? status : await refresh(true);
    if (st.kind !== 'ready') return;
    const p = problem ?? readProblem();
    if (!problem) setProblem(p);
    const editor = pastedCode.trim()
      ? { code: pastedCode, languageId: null, lossy: false }
      : await readEditor();
    if (!editor) {
      setNeedCode(true);
      setError("Couldn't read your code from the editor — paste it below and press Trace again.");
      return;
    }
    const lang = editor.languageId ?? p.languageLabel;
    if (lang && !/^python/i.test(lang) && !isPythonLabel(lang)) {
      setError(
        `LeetTrace traces Python 3 for now — switch the editor language to Python3 (currently ${lang}).`,
      );
      return;
    }
    if (editor.lossy)
      setNotice(
        'Read only the visible editor lines (fallback). Scroll the editor to the top if lines are missing.',
      );
    const chosen: ExampleCase[] = p.examples.filter((_, i) => selected.has(i));
    if (custom.trim()) chosen.push({ input: custom.trim() });
    if (chosen.length === 0) {
      setError(
        'Pick at least one example, or paste a test case (e.g. nums = [2,7,11,15], target = 9).',
      );
      return;
    }
    setBusy(true);
    try {
      const result = await traceCases(st.pairing, {
        code: editor.code,
        slug: p.slug,
        cases: chosen,
      });
      setTraces(result);
      const firstFail = result.findIndex((t) => t.test?.passed === false || t.test?.error);
      setWhich(firstFail >= 0 ? firstFail : 0);
    } catch (e) {
      if (e instanceof DaemonError && (e.status === 401 || e.status === 0)) {
        if (e.status === 401) await clearPairing();
        autoTried.current.clear();
        const again = await refresh(true);
        setError(
          again.kind === 'ready'
            ? 'Reconnected to the LeetTrace app — press Trace my code again.'
            : e.message,
        );
      } else setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [status, problem, selected, custom, refresh, pastedCode]);

  useEffect(() => {
    void refresh();
    loadProblem();
  }, [refresh, loadProblem]);

  // A pairing stored by another tab / the engine's page: pick it up right away.
  useEffect(() => {
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && PAIRING_KEY in changes) void refresh();
    };
    chrome.storage?.onChanged.addListener(onChange);
    return () => chrome.storage?.onChanged.removeListener(onChange);
  }, [refresh]);

  // App not running (or just restarted): keep retrying with backoff while the panel is open,
  // and whenever the tab comes back into focus. It reconnects by itself, no re-pairing.
  useEffect(() => {
    if (!open || status?.kind !== 'offline' || status.localNetworkBlocked) return;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      timer = setTimeout(
        async () => {
          const st = await refresh();
          if (st.kind === 'offline') {
            attempt++;
            tick();
          }
        },
        RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)],
      );
    };
    tick();
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [open, status, refresh]);

  useEffect(
    () =>
      bus.on((e) => {
        if (e === 'toggle') setOpen((o) => !o);
        if (e === 'open') setOpen(true);
        if (e === 'trace') void runTrace();
        if (e === 'navigate') {
          // Problem-to-problem navigation without a page load: start fresh on the new problem.
          loadProblem();
          setTraces(null);
          setError(null);
          setNotice(null);
          setPastedCode('');
          setNeedCode(false);
        }
      }),
    [runTrace, loadProblem],
  );

  if (!open) {
    return (
      <button
        type="button"
        className="ltx-tab"
        onClick={() => setOpen(true)}
        aria-label="Open LeetTrace panel"
      >
        <BrandMark mono size={15} />
        LeetTrace
      </button>
    );
  }

  return (
    <aside className="ltx-panel" aria-label="LeetTrace">
      <header className="ltx-head">
        <BrandMark className="ltx-mark" />
        <strong className="ltx-name">
          Leet<span>Trace</span>
        </strong>
        <span className="ltx-sub">{problem?.title ?? problem?.slug ?? ''}</span>
        {status?.kind === 'ready' && (
          <span className="ltx-conn ds-live" role="status">
            connected
          </span>
        )}
        <button
          type="button"
          className="ltx-icon"
          onClick={() => setOpen(false)}
          aria-label="Collapse LeetTrace panel"
        >
          ⟩
        </button>
      </header>
      <div className="ltx-body">
        {status === null && <p className="ltx-muted">Looking for the LeetTrace app…</p>}
        {status?.kind === 'idle' && <Idle onConnect={() => void refresh(true)} />}
        {status?.kind === 'offline' &&
          (status.localNetworkBlocked ? (
            <Blocked onRetry={() => void refresh(true)} />
          ) : (
            <Offline onRetry={() => void refresh(true)} />
          ))}
        {status?.kind === 'unpaired' &&
          (connecting ? (
            <p className="ltx-card" role="status">
              Connecting to the LeetTrace app…
            </p>
          ) : (
            <Connect
              port={status.port}
              onConnect={async () => {
                setConnecting(true);
                const paired = await autoConnect(status.port, { active: true, timeoutMs: 30_000 });
                setConnecting(false);
                if (paired) await refresh(true);
              }}
              onPaired={() => void refresh(true)}
            />
          ))}
        {status?.kind === 'outdated' && (
          <div className="ltx-card ltx-warn" role="alert">
            <h2>Update LeetTrace</h2>
            <p>
              The app on this computer is v{status.version}; this extension expects a matching
              version.{' '}
              <a href={SITE_URL} target="_blank" rel="noreferrer">
                Download the latest LeetTrace
              </a>{' '}
              and open it — the extension reconnects by itself.
            </p>
          </div>
        )}
        {status?.kind === 'ready' && problem && (
          <>
            {problem.warnings.map((w) => (
              <p key={w} className="ltx-card ltx-warn" role="status">
                {w}
              </p>
            ))}
            <fieldset className="ltx-cases">
              <legend>Test cases</legend>
              {problem.examples.map((c, i) => (
                <label key={i} className="ltx-case">
                  <input
                    type="checkbox"
                    checked={selected.has(i)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.currentTarget.checked) next.add(i);
                      else next.delete(i);
                      setSelected(next);
                    }}
                  />
                  <span>
                    <code>{c.input}</code>
                    {c.expected && <span className="ltx-muted"> → {c.expected}</span>}
                  </span>
                </label>
              ))}
              <label className="ltx-custom">
                <span>Custom case</span>
                <input
                  value={custom}
                  placeholder="e.g. nums = [3,3], target = 6"
                  onChange={(e) => setCustom(e.currentTarget.value)}
                />
              </label>
              {needCode && (
                <label className="ltx-custom">
                  <span>Your code (paste it if the editor couldn&apos;t be read)</span>
                  <textarea
                    className="ltx-code"
                    value={pastedCode}
                    rows={8}
                    spellCheck={false}
                    onChange={(e) => setPastedCode(e.currentTarget.value)}
                  />
                </label>
              )}
              <div className="ltx-actions">
                <button
                  type="button"
                  className="ltx-primary"
                  onClick={() => void runTrace()}
                  disabled={busy}
                >
                  {busy ? 'Tracing…' : 'Trace my code'}
                </button>
                <button type="button" onClick={loadProblem}>
                  Re-read page
                </button>
              </div>
            </fieldset>
          </>
        )}
        {error && (
          <p className="ltx-card ltx-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="ltx-card ltx-warn" role="status">
            {notice}
          </p>
        )}
        {traces && traces.length > 0 && (
          <section aria-label="Trace results">
            {traces.length > 1 && (
              <div className="ltx-tabs" role="tablist">
                {traces.map((t, i) => (
                  <button
                    key={i}
                    type="button"
                    role="tab"
                    aria-selected={i === which}
                    onClick={() => setWhich(i)}
                  >
                    Case {i + 1}{' '}
                    {t.test?.passed === true ? (
                      <span className="ltx-pass">✓</span>
                    ) : t.test?.passed === false || t.test?.error ? (
                      <span className="ltx-fail">✗</span>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
            {traces[which] && <TraceViewer key={which} trace={traces[which]} compact />}
          </section>
        )}
      </div>
    </aside>
  );
}

function Idle({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="ltx-card" role="status">
      <h2>Connect to the LeetTrace app</h2>
      <p>
        Press <strong>Trace</strong> (or Connect) to reach the LeetTrace app on this computer. If
        Chrome asks whether leetcode.com may use <strong>apps on this device</strong>, choose{' '}
        <strong>Allow</strong> — it only lets this page talk to LeetTrace on your own machine.
      </p>
      <button type="button" className="ltx-primary" onClick={onConnect}>
        Connect
      </button>
    </div>
  );
}

function Blocked({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="ltx-card ltx-warn" role="alert">
      <h2>Chrome is blocking the connection</h2>
      <p>LeetCode needs permission to reach the LeetTrace app on this computer:</p>
      <ol className="ltx-steps">
        <li>
          Click the icon at the <strong>left of the address bar</strong>, then{' '}
          <strong>Site settings</strong>.
        </li>
        <li>
          Set <strong>Apps on device</strong> to <strong>Allow</strong>:
          <br />
          <span className="ltx-setting" aria-hidden="true">
            Apps on device <span className="ltx-toggle" />
          </span>
          <br />
          <span className="ltx-muted">
            (Older Chrome calls it <em>Local network access</em>.)
          </span>
        </li>
        <li>Come back here and reload the page.</li>
      </ol>
      <div className="ltx-actions">
        <button type="button" className="ltx-primary" onClick={() => location.reload()}>
          Reload page
        </button>
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      </div>
    </div>
  );
}

function Offline({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="ltx-card" role="status">
      <h2>Start the LeetTrace app</h2>
      <p>
        Tracing runs in the LeetTrace app on your computer, and it isn&apos;t running right now.
        Open <strong>LeetTrace</strong> from the Start menu (Windows), Applications (Mac) or your
        app launcher (Linux). After the first time, it starts by itself when you log in.
      </p>
      <p className="ltx-muted">
        This panel reconnects automatically once it&apos;s running. Not installed yet?{' '}
        <a href={INSTALL_URL} target="_blank" rel="noreferrer">
          Download LeetTrace
        </a>
        .
      </p>
      <button type="button" className="ltx-primary" onClick={onRetry}>
        Retry now
      </button>
    </div>
  );
}

function Connect({
  port,
  onConnect,
  onPaired,
}: {
  port: number;
  onConnect: () => Promise<void>;
  onPaired: () => void;
}) {
  return (
    <div className="ltx-card">
      <h2>Connect to the LeetTrace app</h2>
      <p>
        The app is running. One click connects this browser to it — a LeetTrace tab opens and closes
        by itself.
      </p>
      <button type="button" className="ltx-primary" onClick={() => void onConnect()}>
        Connect
      </button>
      <details className="ltx-more">
        <summary>Other ways to connect</summary>
        <ManualCode port={port} onPaired={onPaired} />
      </details>
    </div>
  );
}

/** Last resort (e.g. Firefox): a one-time code from the LeetTrace welcome page. */
function ManualCode({ port, onPaired }: { port: number; onPaired: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setError(null);
    setBusy(true);
    try {
      await confirmPairing(port, code);
      onPaired();
    } catch (e) {
      const status = e instanceof DaemonError ? e.status : 0;
      setError(
        status === 403
          ? 'That code didn’t match. Copy it again from the LeetTrace welcome page.'
          : status === 410
            ? 'That code expired. The welcome page now shows a new one — use that.'
            : status === 429
              ? 'Too many attempts. Wait a minute, then try again.'
              : e instanceof Error
                ? e.message
                : String(e),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void confirm();
      }}
    >
      <p className="ltx-muted">
        On the LeetTrace welcome page, open <em>Trouble connecting?</em> and copy the one-time code.
      </p>
      <label className="ltx-custom">
        <span>One-time code</span>
        <input
          value={code}
          onChange={(e) => setCode(e.currentTarget.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123-456"
          aria-label="One-time code"
        />
      </label>
      <button type="submit" disabled={busy || !code.trim()}>
        {busy ? 'Connecting…' : 'Connect with code'}
      </button>
      {error && (
        <p className="ltx-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
