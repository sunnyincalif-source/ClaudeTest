import { useEffect, useState } from 'react';
import { CHROME_STORE_URL, REPO_URL, RELEASES_URL } from './config';
import { CopyButton, DemoVideo, Mark, WindowFrame, useReveal } from './components';
import { DownloadButton, DownloadsProvider, useDownloads } from './Download';
import { EXTENSION_ZIPS } from './platform';

type Theme = 'system' | 'light' | 'dark';

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem('leettrace.site.theme') as Theme | null) ?? 'system';
    } catch {
      return 'system';
    }
  });
  useEffect(() => {
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('leettrace.site.theme', theme);
    } catch {
      // per-viewer convenience only
    }
  }, [theme]);
  const next = () => setTheme((t) => (t === 'system' ? 'dark' : t === 'dark' ? 'light' : 'system'));
  return [theme, next];
}

const ADD_TO_CHROME = CHROME_STORE_URL || '#install-extension';

export function App() {
  return (
    <DownloadsProvider>
      <Page />
    </DownloadsProvider>
  );
}

function Page() {
  useReveal();
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Nav />
      <main id="main">
        <Hero />
        <HowItWorks />
        <Payoff />
        <Bento />
        <Privacy />
        <Install />
        <Faq />
        <ClosingCta />
      </main>
      <Footer />
    </>
  );
}

function Nav() {
  const [open, setOpen] = useState(false);
  const [theme, cycle] = useTheme();
  return (
    <header className="nav">
      <div className="wrap nav-inner">
        <a className="wordmark" href="#top" aria-label="LeetTrace home">
          <Mark />
          <span>LeetTrace</span>
        </a>
        <button
          type="button"
          className="menu-btn"
          aria-expanded={open}
          aria-controls="nav-links"
          onClick={() => setOpen(!open)}
        >
          <span className="sr-only">Menu</span>
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            aria-hidden="true"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
        <nav id="nav-links" className={`nav-links${open ? ' open' : ''}`} aria-label="Main">
          <a href="#install" onClick={() => setOpen(false)}>
            Install
          </a>
          <a
            href={ADD_TO_CHROME}
            onClick={() => setOpen(false)}
            {...(CHROME_STORE_URL ? { target: '_blank', rel: 'noreferrer' } : {})}
          >
            Add to Chrome
          </a>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <button
            type="button"
            className="theme-btn"
            onClick={cycle}
            aria-label={`Theme: ${theme}. Change theme`}
          >
            <ThemeIcon theme={theme} />
          </button>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="hero" id="top" aria-labelledby="hero-title">
      <div className="wrap hero-grid">
        <div className="hero-copy">
          <h1 id="hero-title">
            See your code <span className="hl">actually run.</span>
          </h1>
          <p className="lede">
            LeetTrace rides along with your LeetCode practice — in your browser and your terminal —
            and shows the call stack, memory, and pointers step by step, on the real test cases.
            Runs entirely on your machine.
          </p>
          <div className="cta-row">
            <DownloadButton id="download" />
            <a
              className="btn btn-secondary btn-lg"
              href={ADD_TO_CHROME}
              {...(CHROME_STORE_URL ? { target: '_blank', rel: 'noreferrer' } : {})}
            >
              <ChromeGlyph /> Add to Chrome
            </a>
          </div>
          <p className="trust">Python · 100% local · open source</p>
        </div>
        <div className="hero-visual">
          <WindowFrame title="LeetTrace — reverse a linked list">
            <DemoVideo
              name="linked-list-reverse"
              eager
              label="Reversing a linked list: each next pointer flips while the nodes stay in place"
            />
          </WindowFrame>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      title: 'Install the app.',
      body: 'One download. It runs a small tracer locally — your code never leaves your machine.',
      img: '/media/welcome-page.webp',
      alt: 'The LeetTrace welcome page with the pairing code',
    },
    {
      title: 'Add the browser extension.',
      body: (
        <>
          A <strong>Trace</strong> button appears on every LeetCode problem.
        </>
      ),
      img: '/media/extension-panel.webp',
      alt: 'The LeetTrace side panel on a problem page',
    },
    {
      title: 'Hit Trace.',
      body: 'Watch your solution execute step by step against the real example cases — stack, memory, and pointers, live.',
      img: '/media/viz-bst.webp',
      alt: 'A binary search tree traced step by step with pointer arrows',
    },
  ];
  return (
    <section className="section" id="how" aria-labelledby="how-title">
      <div className="wrap">
        <p className="eyebrow">How it works</p>
        <h2 id="how-title">Three steps. Then just practice.</h2>
        <ol className="steps">
          {steps.map((s, i) => (
            <li key={s.title} className="step reveal">
              <span className="step-no" aria-hidden="true">
                {i + 1}
              </span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
              <img
                src={s.img}
                alt={s.alt}
                loading="lazy"
                decoding="async"
                width="640"
                height="400"
              />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Payoff() {
  return (
    <section className="section payoff" aria-labelledby="payoff-title">
      <div className="wrap">
        <p className="eyebrow">The payoff</p>
        <h2 id="payoff-title">Your solution, on the problem page, one step at a time.</h2>
        <WindowFrame title="leetcode.com/problems/two-sum">
          <DemoVideo
            name="leetcode-overlay"
            width={1000}
            height={678}
            label="The LeetTrace panel tracing Two Sum against the page's examples: the dict fills in and the case passes"
          />
        </WindowFrame>
        <p className="caption">
          Two Sum, traced against the page’s own examples: the dict fills in, the pointers move, and
          each case says pass or fail.
        </p>
      </div>
    </section>
  );
}

function Bento() {
  return (
    <section className="section" id="features" aria-labelledby="features-title">
      <div className="wrap">
        <p className="eyebrow">What you get</p>
        <h2 id="features-title">Everything print-debugging never showed you.</h2>
        <div className="bento">
          <article className="card card-feature card-glow reveal">
            <h3>Live heap &amp; pointer arrows</h3>
            <p>
              Linked lists, trees and your own objects drawn as real pointer graphs. Nodes stay put
              while next and left/right rewire — exactly what your code did.
            </p>
            <DemoVideo name="recursive-fib" label="fib(5) unfolding on the call stack" />
          </article>
          <article className="card reveal">
            <h3>The real call stack</h3>
            <p>Every frame and its locals, through every recursive call and back out again.</p>
            <img
              src="/media/viz-fact_dark.webp"
              alt="Five factorial frames on the call stack"
              loading="lazy"
              decoding="async"
              width="1232"
              height="544"
            />
          </article>
          <article className="card reveal">
            <h3>A “why” for every step</h3>
            <p className="quote">
              <code>Checking if n &lt;= 1 (5 &lt;= 1) → False, so we skip the if block.</code>
            </p>
            <p>
              Plain-English notes checked against the actual state — they never contradict the
              picture.
            </p>
          </article>
          <article className="card reveal">
            <h3>Runs on the real test cases</h3>
            <p>
              Reads the problem’s examples, builds ListNode and TreeNode inputs, and tells you pass
              or fail per case.
            </p>
          </article>
          <article className="card reveal">
            <h3>Terminal + browser</h3>
            <p>
              <code>leettrace watch solution.py</code> re-traces on every save. Or step through it
              right in your terminal.
            </p>
            <img
              src="/media/tui.svg"
              alt="The LeetTrace terminal view stepping through a linked-list reversal"
              loading="lazy"
              decoding="async"
              width="1600"
              height="900"
            />
          </article>
          <article className="card reveal">
            <h3>100% local &amp; private</h3>
            <p>Real CPython on your machine. No account, no upload, no telemetry.</p>
          </article>
        </div>
      </div>
    </section>
  );
}

function Privacy() {
  return (
    <section className="section privacy" aria-labelledby="privacy-title">
      <div className="wrap privacy-grid">
        <div>
          <p className="eyebrow">Runs locally</p>
          <h2 id="privacy-title">Your code never leaves your machine.</h2>
          <p>
            The tracer is a small app on your computer. The browser talks to it only over{' '}
            <code>127.0.0.1</code>, locked to a per-session token and to leetcode.com. Nothing is
            uploaded — there’s no server to upload to.
          </p>
        </div>
        <ul className="checks">
          <li>Listens on 127.0.0.1 only — never your network</li>
          <li>Every request needs a secret session token</li>
          <li>Only leetcode.com and the app itself may connect</li>
          <li>Your program runs in a sandbox with step, time and memory caps</li>
        </ul>
      </div>
    </section>
  );
}

type OS = 'macos' | 'windows' | 'linux';

function Install() {
  const { detected } = useDownloads();
  const guess: OS = detected?.platform?.startsWith('windows')
    ? 'windows'
    : detected?.platform?.startsWith('linux')
      ? 'linux'
      : 'macos';
  const [tab, setTab] = useState<OS | null>(null);
  const current = tab ?? guess;
  const { release } = useDownloads();
  const chromeZip =
    release?.asset(EXTENSION_ZIPS.chrome).url ??
    `${RELEASES_URL}/latest/download/${EXTENSION_ZIPS.chrome}`;
  const tabs: { id: OS; label: string }[] = [
    { id: 'macos', label: 'macOS' },
    { id: 'windows', label: 'Windows' },
    { id: 'linux', label: 'Linux' },
  ];
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]!;
    setTab(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  };

  return (
    <section className="section install" id="install" aria-labelledby="install-title">
      <div className="wrap">
        <p className="eyebrow">Get started</p>
        <h2 id="install-title">Install in about five minutes.</h2>

        <div className="install-block">
          <h3>1. Install the app</h3>
          <div className="tabs" role="tablist" aria-label="Operating system">
            {tabs.map((t, i) => (
              <button
                key={t.id}
                id={`tab-${t.id}`}
                role="tab"
                type="button"
                aria-selected={current === t.id}
                aria-controls={`panel-${t.id}`}
                tabIndex={current === t.id ? 0 : -1}
                onClick={() => setTab(t.id)}
                onKeyDown={(e) => onKey(e, i)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div
            className="tab-panel"
            role="tabpanel"
            id={`panel-${current}`}
            aria-labelledby={`tab-${current}`}
            tabIndex={0}
          >
            {current === 'macos' && (
              <ol>
                <li>
                  <strong>Download</strong> → open the <code>.dmg</code> and drag{' '}
                  <strong>LeetTrace</strong> into Applications.
                </li>
                <li>
                  The first time, <strong>right-click the app → Open</strong> (macOS blocks unsigned
                  apps by default; this is a one-time step), then <strong>Allow</strong>. On macOS
                  15 (Sequoia) or later, if it still won’t open:{' '}
                  <strong>System Settings → Privacy &amp; Security → Open Anyway</strong>.
                </li>
                <li>
                  Or in Terminal:{' '}
                  <span className="cmd">
                    <code>xattr -dr com.apple.quarantine /Applications/LeetTrace.app</code>
                    <CopyButton
                      text="xattr -dr com.apple.quarantine /Applications/LeetTrace.app"
                      label="Copy the xattr command"
                    />
                  </span>
                </li>
                <li>The app starts and opens a welcome page in your browser.</li>
              </ol>
            )}
            {current === 'windows' && (
              <ol>
                <li>
                  <strong>Download</strong> the <code>.exe</code> and run it.
                </li>
                <li>
                  If SmartScreen appears, <strong>More info → Run anyway</strong> (it’s unsigned for
                  now).
                </li>
                <li>
                  The app starts and opens a welcome page. Keep its window open while you practice.
                </li>
              </ol>
            )}
            {current === 'linux' && (
              <ol>
                <li>
                  <strong>Download</strong>, then:{' '}
                  <span className="cmd">
                    <code>chmod +x leettrace-linux-x64 &amp;&amp; ./leettrace-linux-x64</code>
                    <CopyButton
                      text="chmod +x leettrace-linux-x64 && ./leettrace-linux-x64"
                      label="Copy the Linux run command"
                    />
                  </span>
                </li>
                <li>It starts the engine and opens a welcome page in your browser.</li>
              </ol>
            )}
            <div className="install-dl">
              <DownloadButton compact />
            </div>
          </div>
        </div>

        <div className="install-block" id="install-extension">
          <h3>2. Add the browser extension</h3>
          <div className="two-col">
            <div>
              <h4>Now</h4>
              <ol>
                <li>
                  Download the extension zip from the app’s welcome page (or{' '}
                  <a href={chromeZip} download>
                    download the Chrome extension zip
                  </a>
                  ) → unzip it.
                </li>
                <li>
                  Open <code>chrome://extensions</code> → turn on <strong>Developer mode</strong>.
                </li>
                <li>
                  <strong>Load unpacked</strong> → select the folder.
                </li>
              </ol>
            </div>
            <div>
              <h4>When published</h4>
              <p>
                {CHROME_STORE_URL ? (
                  <a href={CHROME_STORE_URL} target="_blank" rel="noreferrer">
                    Add to Chrome
                  </a>
                ) : (
                  <strong>Add to Chrome</strong>
                )}{' '}
                from the Web Store — one click.
              </p>
              <p className="muted">
                Firefox: download the Firefox zip from the release and load it from about:debugging.
              </p>
            </div>
          </div>
        </div>

        <div className="install-block">
          <h3>3. Pair them</h3>
          <div className="two-col">
            <div>
              <p>
                The app’s welcome page shows a <strong>pairing code</strong>. Open any LeetCode
                problem, click <strong>Trace</strong>, and paste the code into the LeetTrace panel
                once — you’ll see <strong>“Engine connected.”</strong>
              </p>
              <p className="muted">
                If Chrome asks to let leetcode.com access apps on this device, choose Allow — that’s
                how the page reaches the app on your computer.
              </p>
            </div>
            <img
              src="/media/welcome-page.webp"
              alt="The welcome page showing a six-digit pairing code with a Copy button"
              loading="lazy"
              decoding="async"
              width="1100"
              height="1130"
            />
          </div>
        </div>

        <div className="install-block">
          <h3>4. Use it</h3>
          <p>
            Open any LeetCode problem, write Python, click <strong>Trace</strong> (next to Run).
          </p>
        </div>
      </div>
    </section>
  );
}

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: 'Is my code sent anywhere?',
    a: (
      <>
        No. The tracer runs on your machine; the browser talks to it only over{' '}
        <code>127.0.0.1</code>, locked to a session token and to leetcode.com. Nothing is uploaded.
      </>
    ),
  },
  {
    q: '“macOS can’t verify the developer.”',
    a: (
      <>
        It’s unsigned for now. Right-click the app → Open (one time) — on macOS 15 or later use
        System Settings → Privacy &amp; Security → Open Anyway — or run{' '}
        <code>xattr -dr com.apple.quarantine /Applications/LeetTrace.app</code>.
      </>
    ),
  },
  {
    q: '“Windows protected your PC.”',
    a: <>SmartScreen on an unsigned app — More info → Run anyway.</>,
  },
  {
    q: 'The extension says the engine is off.',
    a: (
      <>
        Start the LeetTrace app, then open a LeetCode problem, click Trace, and pair with the code
        on the app’s welcome page.
      </>
    ),
  },
  { q: 'Which languages?', a: <>Python today. JavaScript is next; C++/Java are on the roadmap.</> },
  { q: 'Is this affiliated with LeetCode?', a: <>No — it’s an independent companion tool.</> },
];

function Faq() {
  return (
    <section className="section" id="faq" aria-labelledby="faq-title">
      <div className="wrap narrow">
        <p className="eyebrow">Troubleshooting</p>
        <h2 id="faq-title">FAQ</h2>
        <div className="faq">
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function ClosingCta() {
  return (
    <section className="section closing" aria-labelledby="closing-title">
      <div className="wrap closing-inner">
        <h2 id="closing-title">The debugger LeetCode never gave you.</h2>
        <p>Free, open source, and it runs on your machine.</p>
        <DownloadButton compact />
      </div>
    </section>
  );
}

function Footer() {
  const { release } = useDownloads();
  return (
    <footer className="footer">
      <div className="wrap footer-grid">
        <div>
          <a className="wordmark" href="#top">
            <Mark size={24} />
            <span>LeetTrace</span>
          </a>
          <p className="muted small">
            LeetTrace is an independent tool and is not affiliated with or endorsed by LeetCode.
          </p>
          <p className="muted small">
            {release?.tag ? `Latest release ${release.tag}` : 'Latest release on GitHub'}
          </p>
        </div>
        <nav aria-label="Product">
          <h2>Product</h2>
          <a href="#download">Download</a>
          <a href="#how">How it works</a>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
        <nav aria-label="Help">
          <h2>Help</h2>
          <a href="#install">Install guide</a>
          <a href="#faq">Troubleshooting</a>
          <a href={`${REPO_URL}/blob/main/docs/SECURITY.md`} target="_blank" rel="noreferrer">
            Privacy &amp; security
          </a>
        </nav>
      </div>
    </footer>
  );
}

function ChromeGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 8.5h8.2M8.9 13.8L4.8 6.7M15 13.8l-4.1 7.1" />
    </svg>
  );
}

function ThemeIcon({ theme }: { theme: Theme }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      {theme === 'dark' ? (
        <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
      ) : theme === 'light' ? (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />
        </>
      )}
    </svg>
  );
}
