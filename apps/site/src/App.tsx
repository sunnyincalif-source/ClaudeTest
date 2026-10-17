// LeetTrace landing + install site (SPEC-PRODUCT §8, copy per §9). Dark-only, built on the
// shared design system. Static: no backend, no telemetry; reads only public GitHub Release
// metadata for the Download button.
import { lazy, Suspense, useState, type ReactNode } from 'react';
import { CHROME_STORE_URL, GITHUB_REPO, REPO_URL } from './config';
import { CopyButton, Mark, WindowFrame, useNearViewport, useReveal } from './components';
import { DownloadButton, DownloadsProvider, useDownloads } from './Download';
import { ASSETS, EXTENSION_ZIPS, LINUX_CLI } from './platform';

const LivePanel = lazy(() => import('./LivePanel'));
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
  return (
    <header className="nav">
      <div className="wrap nav-in">
        <a className="brand" href="#top" aria-label="LeetTrace home">
          <Mark size={22} id="nav" />
          <b>
            Leet<span>Trace</span>
          </b>
        </a>
        <button
          type="button"
          className="nav-toggle"
          aria-expanded={open}
          aria-controls="nav-links"
          onClick={() => setOpen(!open)}
        >
          <span className="sr-only">Menu</span>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>
        <nav
          id="nav-links"
          className={`nav-links${open ? ' open' : ''}`}
          aria-label="Main"
          onClick={() => setOpen(false)}
        >
          <a href="#install">Install</a>
          <a
            href={ADD_TO_CHROME}
            {...(CHROME_STORE_URL ? { target: '_blank', rel: 'noreferrer' } : {})}
          >
            Add to Chrome
          </a>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a className="ds-btn ds-btn-primary ds-btn-sm" href="#download">
            Download
          </a>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="hero" id="top" aria-labelledby="hero-title">
      <div className="aurora" aria-hidden="true" />
      <div className="wrap hero-in">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="dot" aria-hidden="true" />
            Runs 100% on your machine
          </span>
          <h1 id="hero-title">
            See your code <span className="g">actually run.</span>
          </h1>
          <p className="sub">
            LeetTrace rides along with your LeetCode practice and shows the call stack, memory, and
            pointers step by step, on the real test cases. Runs entirely on your machine — nothing
            is uploaded.
          </p>
          <div className="cta-row">
            <DownloadButton id="download" />
            <AddToChromeButton />
          </div>
          <p className="trust">
            <b>Python</b> · 100% local · open source
          </p>
        </div>
        <HeroShot />
      </div>
    </section>
  );
}

function AddToChromeButton() {
  return (
    <a
      className="ds-btn ds-btn-ghost btn-lg"
      href={ADD_TO_CHROME}
      {...(CHROME_STORE_URL ? { target: '_blank', rel: 'noreferrer' } : {})}
    >
      <ChromeGlyph />
      Add to Chrome
    </a>
  );
}

/** Static product shot (fast first paint): the editor beside the panel's memory view. */
function HeroShot() {
  const code = [
    'def reverseList(head):',
    '    prev = None',
    '    curr = head',
    '    while curr:',
    '        nxt = curr.next',
    '        curr.next = prev',
    '        prev = curr',
    '        curr = nxt',
    '    return prev',
  ];
  return (
    <WindowFrame
      address="leetcode.com/problems/reverse-linked-list"
      label="LeetTrace on a LeetCode problem: the editor and the memory view"
    >
      <div className="shot">
        <pre className="mini-ed" aria-hidden="true">
          {code.map((l, i) => (
            <span key={i} className={i === 5 ? 'hot' : undefined}>
              <i>{i + 1}</i>
              {l}
              {'\n'}
            </span>
          ))}
        </pre>
        <div className="mini-panel" aria-hidden="true">
          <div className="mini-h">
            <span>Memory</span>
            <span className="ds-live">connected</span>
          </div>
          <div className="mini-tags">
            <span className="t-prev">prev</span>
            <span className="t-curr">curr</span>
            <span className="t-next">nxt</span>
          </div>
          <div className="mini-nodes">
            <span className="nd">1</span>
            <span className="nd lit">2</span>
            <span className="nd">3</span>
            <span className="nd null">∅</span>
            <svg className="mini-arrows" viewBox="0 0 220 80" preserveAspectRatio="none">
              <path d="M78 52 C 78 74 22 74 22 52" className="a-hot" />
              <path d="M138 22 C 150 4 182 4 190 22" className="a-dim" />
            </svg>
          </div>
          <p className="mini-cap">curr.next = prev — the link flips</p>
          <p className="mini-why">
            <b>?</b> Reverse one link: node 2.next now points back to node 1.
          </p>
        </div>
      </div>
    </WindowFrame>
  );
}

function Section({
  id,
  label,
  title,
  lede,
  children,
  className = '',
}: {
  id?: string;
  label: string;
  title: string;
  lede?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const titleId = `${id ?? label.toLowerCase().replace(/\W+/g, '-')}-title`;
  return (
    <section className={`section ${className}`} id={id} aria-labelledby={titleId}>
      <div className="wrap">
        <p className="ds-eyebrow">{label}</p>
        <h2 id={titleId}>{title}</h2>
        {lede && <p className="lede">{lede}</p>}
        {children}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps: [string, ReactNode][] = [
    [
      'Download & install.',
      'One file. A small tracer runs locally — your code never leaves your machine.',
    ],
    ['Add to Chrome.', 'One click from the Chrome Web Store.'],
    [
      'Open any LeetCode problem.',
      <>
        A <b>Trace</b> button is already there — hit it and watch it run.
      </>,
    ],
  ];
  return (
    <Section id="how" label="How it works" title="Three steps. Then just practice.">
      <ol className="steps">
        {steps.map(([t, d], i) => (
          <li key={t} className="ds-card step reveal">
            <span className="step-no" aria-hidden="true">
              {i + 1}
            </span>
            <h3>{t}</h3>
            <p>{d}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function Payoff() {
  const [ref, near] = useNearViewport<HTMLDivElement>();
  const [compact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 760px)').matches,
  );
  return (
    <Section
      id="payoff"
      label="The panel"
      title="It shows up inside LeetCode."
      lede={
        <>
          This is the real LeetTrace panel playing a recorded trace — watch the <code>next</code>{' '}
          pointers reverse one at a time. Use ←/→ or the timeline to step yourself.
        </>
      }
    >
      <div ref={ref} className="payoff-frame">
        <WindowFrame
          address={
            <>
              leetcode.com/problems/<b>reverse-linked-list</b>
            </>
          }
          label="The LeetTrace panel tracing a linked-list reversal"
        >
          {near ? (
            <Suspense fallback={<div className="panel-placeholder">Loading the trace…</div>}>
              <LivePanel compact={!!compact} />
            </Suspense>
          ) : (
            <div className="panel-placeholder" />
          )}
        </WindowFrame>
      </div>
    </Section>
  );
}

function Bento() {
  const cards: [string, string, ReactNode][] = [
    [
      'stack',
      'Call stack',
      'Frames push and pop as functions run. Recursion becomes something you can watch.',
    ],
    [
      'heap',
      'Live heap & pointer arrows',
      'Lists, dicts, linked lists and trees render as real objects and arrows that rewire as your code runs.',
    ],
    [
      'why',
      'Step-by-step “why”',
      'A plain-English reason for every step, so you know what the line just did — not just that it ran.',
    ],
    [
      'cases',
      'Real test cases',
      'Runs against the problem’s own examples, with pass/fail and output vs expected, per case.',
    ],
    [
      'term',
      'Terminal + browser',
      <>
        The same engine traces files from your terminal: <code>leettrace run</code>,{' '}
        <code>watch</code>, and a TUI.
      </>,
    ],
    [
      'local',
      '100% local',
      'Your code runs in a sandbox on your computer. Nothing is uploaded, ever.',
    ],
  ];
  return (
    <Section
      id="features"
      label="What you get"
      title="Everything print-debugging never showed you."
    >
      <div className="bento">
        {cards.map(([icon, title, body]) => (
          <article key={icon} className={`ds-card bento-card bento-${icon} reveal`}>
            <FeatureIcon name={icon} />
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </div>
    </Section>
  );
}

function Privacy() {
  return (
    <Section
      id="privacy"
      label="Runs locally"
      title="Your code never leaves your machine."
      className="privacy"
    >
      <div className="privacy-grid">
        <p className="lede">
          The tracer runs real CPython on your computer, in a sandboxed subprocess with step, time,
          depth and memory limits. The browser talks to it only over <code>127.0.0.1</code>, locked
          to a secret token and to leetcode.com. There are no accounts, no servers and no analytics.
        </p>
        <ul className="checks">
          <li>Loopback only — never your network</li>
          <li>Token-gated, origin-locked</li>
          <li>Nothing uploaded, ever</li>
          <li>
            Open source —{' '}
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              read it
            </a>
          </li>
        </ul>
      </div>
      <p>
        <a href="/privacy/">Privacy policy →</a>
      </p>
    </Section>
  );
}

type OsTab = 'macOS' | 'Windows' | 'Linux';

function Install() {
  const { detected, release } = useDownloads();
  const detectedOs: OsTab = detected?.platform ? ASSETS[detected.platform].os : 'macOS';
  const [picked, setPicked] = useState<OsTab | null>(null);
  const os = picked ?? detectedOs;
  const tabs: OsTab[] = ['macOS', 'Windows', 'Linux'];
  const linux = ASSETS['linux-x64'];
  const linuxName = release?.pick(linux.name, linux.legacy).name.split('/').pop() ?? linux.name;
  return (
    <Section
      id="install"
      label="Get started"
      title="Install in about two minutes."
      className="install"
    >
      <div className="install-grid">
        <div className="ds-card install-block">
          <h3>
            <span className="step-no" aria-hidden="true">
              1
            </span>{' '}
            Install the app
          </h3>
          <div className="ds-tabs" role="tablist" aria-label="Operating system">
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                id={`tab-${t}`}
                className="ds-tab"
                aria-selected={os === t}
                aria-controls={`panel-${t}`}
                onClick={() => setPicked(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id={`panel-${os}`}
            aria-labelledby={`tab-${os}`}
            className="os-panel"
          >
            {os === 'macOS' && (
              <p>
                Open the <code>.dmg</code>, drag to Applications. First launch:{' '}
                <b>right-click → Open</b> once (it&apos;s unsigned for now).
              </p>
            )}
            {os === 'Windows' && (
              <p>
                Run the installer; if SmartScreen appears, <b>More info → Run anyway</b> (one time).
              </p>
            )}
            {os === 'Linux' && (
              <>
                <p>Make it executable and run it.</p>
                <div className="cmd">
                  <code>
                    chmod +x {linuxName} && ./{linuxName}
                  </code>
                  <CopyButton
                    text={`chmod +x ${linuxName} && ./${linuxName}`}
                    label="Copy command"
                  />
                </div>
              </>
            )}
            <p className="muted small">
              LeetTrace then lives in your {os === 'macOS' ? 'menu bar' : 'system tray'} and starts
              when you log in.
            </p>
            <DownloadButton compact />
          </div>
        </div>

        <div className="ds-card install-block" id="install-extension">
          <h3>
            <span className="step-no" aria-hidden="true">
              2
            </span>{' '}
            Add the extension
          </h3>
          {CHROME_STORE_URL ? (
            <>
              <p>One click from the Chrome Web Store.</p>
              <p>
                <a
                  className="ds-btn ds-btn-primary"
                  href={CHROME_STORE_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ChromeGlyph /> Add to Chrome
                </a>
              </p>
            </>
          ) : (
            <>
              <p>
                Coming to the Chrome Web Store. Until then, add it in a minute:{' '}
                <a href={release?.asset(EXTENSION_ZIPS.chrome).url} download>
                  download the extension (.zip)
                </a>{' '}
                (the app&apos;s welcome page offers it too), unzip it, then:
              </p>
              <ol className="substeps">
                <li>
                  Open <code>chrome://extensions</code> and turn on <b>Developer mode</b>.
                </li>
                <li>
                  Click <b>Load unpacked</b> and pick the unzipped folder.
                </li>
              </ol>
            </>
          )}
        </div>

        <div className="ds-card install-block">
          <h3>
            <span className="step-no" aria-hidden="true">
              3
            </span>{' '}
            Connect
          </h3>
          <p>
            Nothing to do — the app and extension pair <b>automatically</b>.
          </p>
          <p className="muted small">
            If Chrome asks whether leetcode.com may use <b>apps on this device</b>, choose{' '}
            <b>Allow</b>: it only lets LeetCode talk to LeetTrace on your own computer.
          </p>
        </div>

        <div className="ds-card install-block">
          <h3>
            <span className="step-no" aria-hidden="true">
              4
            </span>{' '}
            Use it
          </h3>
          <p>
            Open any problem, write Python, click <b>Trace</b>.
          </p>
          <p className="muted small">
            Prefer the terminal? Power users can trace files directly:{' '}
            <a href={release?.asset(LINUX_CLI).url} download>
              Linux CLI binary
            </a>{' '}
            · <code>leettrace run solution.py</code>
          </p>
        </div>
      </div>
    </Section>
  );
}

export const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: 'Is my code sent anywhere?',
    a: (
      <>
        No — the tracer runs on your machine; the browser talks to it only over{' '}
        <code>127.0.0.1</code>, locked to a token and to leetcode.com.
      </>
    ),
  },
  {
    q: '“Unverified developer” / “Windows protected your PC”?',
    a: (
      <>
        Normal for an unsigned app — one-time <b>right-click → Open</b> /{' '}
        <b>More info → Run anyway</b>.
      </>
    ),
  },
  { q: 'Do I enter a code?', a: 'No — it connects automatically.' },
  { q: 'Languages?', a: 'Python today; JS next; C++/Java on the roadmap.' },
  { q: 'Affiliated with LeetCode?', a: 'No, independent companion tool.' },
];

function Faq() {
  return (
    <Section id="faq" label="FAQ" title="Questions, answered.">
      <div className="faq">
        {FAQ.map((f) => (
          <details key={f.q} className="ds-card faq-item" role="group">
            <summary>{f.q}</summary>
            <div className="faq-a">{f.a}</div>
          </details>
        ))}
      </div>
    </Section>
  );
}

function ClosingCta() {
  return (
    <section className="section closing" aria-labelledby="closing-title">
      <div className="aurora aurora-soft" aria-hidden="true" />
      <div className="wrap closing-in">
        <h2 id="closing-title">See your code actually run.</h2>
        <p className="lede">Free, open source, and entirely on your machine.</p>
        <div className="cta-row center">
          <DownloadButton compact />
          <AddToChromeButton />
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const { release } = useDownloads();
  return (
    <footer className="footer">
      <div className="wrap footer-in">
        <div className="footer-brand">
          <a className="brand" href="#top" aria-label="LeetTrace home">
            <Mark size={20} id="foot" />
            <b>
              Leet<span>Trace</span>
            </b>
          </a>
          <p className="muted small">
            {release?.tag ? `${release.tag} · ` : ''}LeetTrace is an independent tool and is not
            affiliated with or endorsed by LeetCode.
          </p>
        </div>
        <nav aria-label="Product">
          <h3>Product</h3>
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
          <a href="#download">Download</a>
        </nav>
        <nav aria-label="Help">
          <h3>Help</h3>
          <a href="#install">Install</a>
          <a href="#faq">FAQ</a>
          <a href="/privacy/">Privacy</a>
        </nav>
        <nav aria-label="GitHub">
          <h3>GitHub</h3>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            {GITHUB_REPO}
          </a>
          <a href={`${REPO_URL}/releases`} target="_blank" rel="noreferrer">
            Releases
          </a>
          <a href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer">
            Report an issue
          </a>
        </nav>
      </div>
    </footer>
  );
}

function ChromeGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none">
      <circle cx="12" cy="12" r="9.2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3.6" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 8.4h8.4M8.9 13.8 4.7 6.5M15.1 13.8l-4.2 7.3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FeatureIcon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    stack: <path d="M5 6h14M5 12h14M5 18h14" />,
    heap: (
      <>
        <rect x="3" y="9" width="6" height="6" rx="1.5" />
        <rect x="15" y="9" width="6" height="6" rx="1.5" />
        <path d="M9 12h6m-2-2 2 2-2 2" />
      </>
    ),
    why: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14M12 17h.01" />
      </>
    ),
    cases: <path d="m5 12 4 4 10-10" />,
    term: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="m7 9 3 3-3 3M12 15h5" />
      </>
    ),
    local: (
      <>
        <rect x="5" y="10" width="14" height="10" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
  };
  return (
    <span className="ic" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {paths[name]}
      </svg>
    </span>
  );
}
