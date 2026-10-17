import { useCallback, useEffect, useState } from 'react';
import type { Trace } from '@leettrace/schema';
import { TraceViewer } from '@leettrace/viz';
import { BrandMark } from '../shared/BrandMark';
import { INSTALL_URL } from '../shared/config';
import { clearPairing } from '../shared/storage';
import { bus } from './bus';
import {
  checkDaemon,
  confirmPairing,
  DaemonError,
  requestPairing,
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

export function Panel({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [status, setStatus] = useState<DaemonStatus | null>(null);
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

  const refresh = useCallback(async () => {
    setStatus(null);
    setStatus(await checkDaemon());
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
    const st = status?.kind === 'ready' ? status : await checkDaemon();
    setStatus(st);
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
        `LeetTrace v1 traces Python 3 only — switch the editor language to Python3 (currently ${lang}).`,
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
      if (e instanceof DaemonError && e.status === 401) {
        await clearPairing();
        await refresh();
      }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [status, problem, selected, custom, refresh, pastedCode]);

  useEffect(() => {
    void refresh();
    loadProblem();
  }, [refresh, loadProblem]);

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
        {status === null && <p className="ltx-muted">Looking for the LeetTrace engine…</p>}
        {status?.kind === 'offline' && (
          <Offline onRetry={refresh} blocked={!!status.localNetworkBlocked} />
        )}
        {status?.kind === 'unpaired' && (
          <Pair
            port={status.port}
            onPaired={() => {
              setNotice('Engine connected. Pick your test cases and press Trace my code.');
              void refresh();
            }}
          />
        )}
        {status?.kind === 'outdated' && (
          <div className="ltx-card ltx-warn" role="alert">
            Your engine is v{status.version}, but this extension expects a matching version. Update
            with <code>pipx upgrade leettrace</code> and restart it.
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

function Offline({ onRetry, blocked }: { onRetry: () => void; blocked: boolean }) {
  if (blocked) {
    return (
      <div className="ltx-card ltx-warn" role="alert">
        <h2>Chrome is blocking the connection</h2>
        <p>
          LeetTrace talks to the engine on your own computer (127.0.0.1). Allow{' '}
          <strong>local network access</strong> for leetcode.com: click the icon at the left of the
          address bar → Site settings → Local network access → Allow, then reload.
        </p>
        <button type="button" className="ltx-primary" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }
  return (
    <div className="ltx-card" role="status">
      <h2>Start the LeetTrace app</h2>
      <p>
        The extension shows your code running, but the tracing happens on your machine. Start the
        engine in a terminal:
      </p>
      <pre>leettrace start</pre>
      <p className="ltx-muted">
        <strong>Already running?</strong> Chrome must allow leetcode.com to reach apps on this
        computer. If Chrome shows a prompt about apps or devices on your network, choose
        <strong> Allow</strong>. Otherwise click the icon left of the address bar →{' '}
        <strong>Site settings</strong> → set <em>Local network access</em> (or{' '}
        <em>Apps on device</em>) to Allow, reload the page, and press Retry.
      </p>
      <p className="ltx-muted">
        Not installed yet? <code>pipx install leettrace</code> —{' '}
        <a href={INSTALL_URL} target="_blank" rel="noreferrer">
          install guide
        </a>
      </p>
      <button type="button" className="ltx-primary" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

function Pair({ port, onPaired }: { port: number; onPaired: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    // Also echo the code in the engine's terminal, for people running it from a shell.
    requestPairing(port).catch(() => undefined);
  }, [port]);
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
            ? 'That code expired. The welcome page now shows a new one — paste that.'
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
    <div className="ltx-card">
      <h2>Pair with the LeetTrace app</h2>
      <p>
        The LeetTrace app is running on this computer. Paste the <strong>pairing code</strong> from
        its welcome page (it opened when you started the app) — you only do this once.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void confirm();
        }}
      >
        <label className="ltx-custom">
          <span>Pairing code</span>
          <input
            value={code}
            onChange={(e) => setCode(e.currentTarget.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123-456"
            aria-label="Pairing code"
          />
        </label>
        <button type="submit" className="ltx-primary" disabled={busy || !code.trim()}>
          {busy ? 'Pairing…' : 'Pair'}
        </button>
      </form>
      <p className="ltx-muted">
        Can’t find it? Run <code>leettrace pair</code> in a terminal, or reopen the app.
      </p>
      {error && (
        <p className="ltx-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
