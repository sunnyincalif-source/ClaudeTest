import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Trace } from '@leettrace/schema';
import { TraceViewer } from '@leettrace/viz';
import { boot, EngineError, getRun, health, traceLeetCode, traceScript, type Case } from './api';
import { SAMPLES, type Sample } from './samples';
import { Welcome } from './Welcome';
import { useWatch, type WatchedRun } from './useWatch';

type View = 'live' | 'practice' | 'welcome';
type ThemePref = 'system' | 'light' | 'dark';

function useTheme(): [ThemePref, (t: ThemePref) => void, 'light' | 'dark'] {
  const [pref, setPref] = useState<ThemePref>(() => {
    try {
      return (localStorage.getItem('leettrace.theme') as ThemePref | null) ?? 'system';
    } catch {
      return 'system';
    }
  });
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  );
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const on = () => setSystemDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const resolved = pref === 'system' ? (systemDark ? 'dark' : 'light') : pref;
  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    try {
      localStorage.setItem('leettrace.theme', pref);
    } catch {
      // ignore
    }
  }, [pref, resolved]);
  return [pref, setPref, resolved];
}

export function App() {
  const [{ token, runId: bootRun, view: bootView }] = useState(boot);
  const [theme, setTheme, resolvedTheme] = useTheme();
  const [view, setView] = useState<View>(bootView === 'welcome' ? 'welcome' : 'live');
  const [runs, setRuns] = useState<WatchedRun[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [engineVersion, setEngineVersion] = useState<string | null>(null);
  const howRef = useRef<HTMLDialogElement>(null);

  const onRun = useCallback((run: WatchedRun) => {
    setRuns((rs) => [run, ...rs.filter((r) => r.runId !== run.runId)].slice(0, 20));
    setCurrent(run.runId);
  }, []);
  const link = useWatch(token, onRun);

  useEffect(() => {
    if (!token) return;
    health(token)
      .then((h) => setEngineVersion(h.version))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    if (bootRun) {
      getRun(token, bootRun)
        .then((trace) => onRun({ runId: bootRun, label: '', trace, receivedAt: Date.now() }))
        .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    }
  }, [token, bootRun, onRun]);

  const active = runs.find((r) => r.runId === current) ?? null;

  return (
    <div className="app">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <div className="brand">
          <Logo />
          <span>LeetTrace</span>
        </div>
        <nav className="tabs" aria-label="Views">
          <button
            type="button"
            aria-pressed={view === 'welcome'}
            onClick={() => setView('welcome')}
          >
            Setup
          </button>
          <button type="button" aria-pressed={view === 'live'} onClick={() => setView('live')}>
            Live runs
          </button>
          <button
            type="button"
            aria-pressed={view === 'practice'}
            onClick={() => setView('practice')}
          >
            Practice
          </button>
        </nav>
        <div className="topbar-right">
          <span className={`link link-${token ? link : 'offline'}`} role="status">
            <span className="dot" aria-hidden="true" />
            {!token
              ? 'Not connected'
              : link === 'live'
                ? 'Engine connected'
                : link === 'connecting'
                  ? 'Connecting…'
                  : 'Engine offline'}
            {engineVersion && <span className="muted"> · v{engineVersion}</span>}
          </span>
          <label className="theme">
            <span className="sr-only">Theme</span>
            <select
              value={theme}
              onChange={(e) => setTheme(e.currentTarget.value as ThemePref)}
              aria-label="Theme"
            >
              <option value="system">System theme</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <button type="button" className="ghost" onClick={() => howRef.current?.showModal()}>
            How it works
          </button>
        </div>
      </header>

      {error && (
        <div className="toast" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="ghost"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

      <main id="main">
        {!token ? (
          <Onboarding />
        ) : view === 'welcome' ? (
          <Welcome token={token} onError={setError} onDone={() => setView('live')} />
        ) : view === 'live' ? (
          <LiveView
            runs={runs}
            active={active}
            onSelect={setCurrent}
            theme={resolvedTheme}
            link={link}
          />
        ) : (
          <Practice token={token} theme={resolvedTheme} onError={setError} />
        )}
      </main>

      <dialog ref={howRef} className="how" aria-labelledby="how-title">
        <HowItWorks onClose={() => howRef.current?.close()} />
      </dialog>
    </div>
  );
}

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="var(--accent)" />
      <path d="M6 16 L12 8 L18 16" stroke="white" strokeWidth="2" fill="none" />
      <circle cx="6" cy="16" r="2.3" fill="white" />
      <circle cx="12" cy="8" r="2.3" fill="white" />
      <circle cx="18" cy="16" r="2.3" fill="white" />
    </svg>
  );
}

function Onboarding() {
  return (
    <section className="card onboarding" aria-labelledby="ob-title">
      <h1 id="ob-title">Open LeetTrace from your terminal</h1>
      <p>
        This page is served by your local LeetTrace engine. For your security it needs the session
        key that the engine prints, so open it via the CLI:
      </p>
      <ol>
        <li>
          Install the engine: <code>pipx install leettrace</code>
        </li>
        <li>
          Start it: <code>leettrace start</code> — it opens this page already connected.
        </li>
        <li>
          Trace a file: <code>leettrace run solution.py</code>, or live-reload while you edit:{' '}
          <code>leettrace watch solution.py</code>
        </li>
        <li>On leetcode.com, the LeetTrace extension adds a Trace button next to Run.</li>
      </ol>
      <p className="muted">
        Already running? <code>leettrace open</code> prints a fresh link.
      </p>
    </section>
  );
}

function LiveView({
  runs,
  active,
  onSelect,
  theme,
  link,
}: {
  runs: WatchedRun[];
  active: WatchedRun | null;
  onSelect: (id: string) => void;
  theme: 'light' | 'dark';
  link: string;
}) {
  if (!active) {
    return (
      <section className="card empty" aria-labelledby="wait-title">
        <h1 id="wait-title">Waiting for a run…</h1>
        <p>
          Run <code>leettrace run solution.py</code> or <code>leettrace watch solution.py</code> in
          your terminal, or click <strong>Trace</strong> on a LeetCode problem. It will appear here
          instantly.
        </p>
        <p className="muted">Or try a bundled problem in the Practice tab.</p>
        {link !== 'live' && (
          <p className="warn">The live connection is down; reconnecting automatically.</p>
        )}
      </section>
    );
  }
  return (
    <div className="live">
      <div className="runbar">
        <h1 className="runtitle">{active.label || 'Trace'}</h1>
        <span className="muted">
          {active.trace.steps.length} steps · {new Date(active.receivedAt).toLocaleTimeString()}
        </span>
        {runs.length > 1 && (
          <label className="history">
            <span className="sr-only">Recent runs</span>
            <select
              value={active.runId}
              onChange={(e) => onSelect(e.currentTarget.value)}
              aria-label="Recent runs"
            >
              {runs.map((r) => (
                <option key={r.runId} value={r.runId}>
                  {(r.label || 'Trace') + ' — ' + new Date(r.receivedAt).toLocaleTimeString()}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <TraceViewer key={active.runId} trace={active.trace} globalKeys theme={theme} />
    </div>
  );
}

function Practice({
  token,
  theme,
  onError,
}: {
  token: string;
  theme: 'light' | 'dark';
  onError: (e: string) => void;
}) {
  const [sample, setSample] = useState<Sample>(SAMPLES[0]!);
  const [code, setCode] = useState(sample.code);
  const [cases, setCases] = useState<Case[]>(sample.cases ?? []);
  const [stdin, setStdin] = useState('');
  const [traces, setTraces] = useState<Trace[] | null>(null);
  const [which, setWhich] = useState(0);
  const [busy, setBusy] = useState(false);

  const pick = (s: Sample) => {
    setSample(s);
    setCode(s.code);
    setCases(s.cases ?? []);
    setTraces(null);
    setWhich(0);
  };

  const run = async () => {
    setBusy(true);
    try {
      const result =
        sample.mode === 'leetcode'
          ? await traceLeetCode(
              token,
              code,
              cases.filter((c) => c.input.trim()),
            )
          : [await traceScript(token, code, stdin)];
      setTraces(result);
      setWhich(0);
    } catch (e) {
      onError(e instanceof EngineError || e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const trace = useMemo(() => traces?.[which] ?? null, [traces, which]);

  return (
    <div className="practice">
      <aside className="problems" aria-label="Practice problems">
        <h2>Practice</h2>
        <ul>
          {SAMPLES.map((s) => (
            <li key={s.id}>
              <button type="button" aria-pressed={s.id === sample.id} onClick={() => pick(s)}>
                <strong>{s.title}</strong>
                <span>{s.blurb}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="workspace" aria-label="Editor">
        <div className="editor-head">
          <h2>{sample.title}</h2>
          <span className="pill">{sample.mode === 'leetcode' ? 'class Solution' : 'script'}</span>
        </div>
        <label className="sr-only" htmlFor="code">
          Python code
        </label>
        <textarea
          id="code"
          className="code"
          spellCheck={false}
          value={code}
          rows={Math.min(18, Math.max(8, code.split('\n').length + 1))}
          onChange={(e) => setCode(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Tab' && !e.shiftKey) {
              e.preventDefault();
              const el = e.currentTarget;
              const { selectionStart: a, selectionEnd: b } = el;
              const next = code.slice(0, a) + '    ' + code.slice(b);
              setCode(next);
              requestAnimationFrame(() => el.setSelectionRange(a + 4, a + 4));
            } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void run();
            }
          }}
        />
        {sample.mode === 'leetcode' ? (
          <fieldset className="cases">
            <legend>Test cases</legend>
            {cases.map((c, i) => (
              <div className="case" key={i}>
                <label>
                  <span>Input</span>
                  <input
                    value={c.input}
                    onChange={(e) =>
                      setCases(
                        cases.map((x, j) => (j === i ? { ...x, input: e.currentTarget.value } : x)),
                      )
                    }
                  />
                </label>
                <label>
                  <span>Expected</span>
                  <input
                    value={c.expected ?? ''}
                    onChange={(e) =>
                      setCases(
                        cases.map((x, j) =>
                          j === i ? { ...x, expected: e.currentTarget.value || undefined } : x,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  className="ghost"
                  aria-label={`Remove case ${i + 1}`}
                  onClick={() => setCases(cases.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              className="ghost"
              onClick={() => setCases([...cases, { input: '' }])}
            >
              + Add case
            </button>
          </fieldset>
        ) : (
          <label className="stdin">
            <span>stdin (optional)</span>
            <input value={stdin} onChange={(e) => setStdin(e.currentTarget.value)} />
          </label>
        )}
        <div className="actions">
          <button type="button" className="primary" onClick={() => void run()} disabled={busy}>
            {busy ? 'Tracing…' : 'Trace'}
          </button>
          <span className="muted">Ctrl/⌘ + Enter</span>
        </div>
      </section>
      <section className="result" aria-label="Visualization">
        {traces && traces.length > 1 && (
          <div className="casetabs" role="tablist" aria-label="Cases">
            {traces.map((t, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === which}
                onClick={() => setWhich(i)}
              >
                Case {i + 1} {t.test?.passed === true ? '✓' : t.test?.passed === false ? '✗' : ''}
              </button>
            ))}
          </div>
        )}
        {trace ? (
          <TraceViewer
            key={`${sample.id}-${which}-${traces?.length}`}
            trace={trace}
            globalKeys
            theme={theme}
          />
        ) : (
          <div className="card empty">
            <p>
              Press <strong>Trace</strong> to run this on your machine and step through it.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function HowItWorks({ onClose }: { onClose: () => void }) {
  return (
    <div>
      <h2 id="how-title">How LeetTrace works</h2>
      <p>
        <strong>Real Python, not a simulator.</strong> Your code runs in genuine CPython inside a
        sandboxed subprocess on your machine. The engine hooks the interpreter with{' '}
        <code>sys.settrace</code> and, at every line, call and return, snapshots the full call stack
        plus every object reachable from it.
      </p>
      <p>
        <strong>Stable identity.</strong> Each object keeps the same id across steps, so a node
        stays put while its <code>next</code> pointer rewires — the arrows you see are the real
        object graph.
      </p>
      <p>
        <strong>One contract.</strong> The engine emits a language-agnostic <em>Trace</em>; this
        page, the terminal, and the LeetCode extension all render that same schema.
      </p>
      <p>
        <strong>Local and locked down.</strong> The engine listens on 127.0.0.1 only, requires a
        per-session token, and only accepts requests from leetcode.com and this page.
      </p>
      <p className="muted">Keys: ← → step · Space play/pause · Home/End jump.</p>
      <button type="button" className="primary" onClick={onClose}>
        Got it
      </button>
    </div>
  );
}
