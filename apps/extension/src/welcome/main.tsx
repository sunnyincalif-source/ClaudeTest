// Onboarding tab, opened once when the extension is installed. It shows, live, whether the
// extension has connected to the LeetTrace app (automatic — nothing to type).
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@leettrace/design/fonts.css';
import '@leettrace/design/components.css';
import '@leettrace/design/tokens.css';
import { BrandMark } from '../shared/BrandMark';
import { INSTALL_URL, SITE_URL } from '../shared/config';
import { useConnection } from '../shared/useConnection';
import './welcome.css';

function Welcome() {
  const pairing = useConnection();
  return (
    <main>
      <p className="brand">
        <BrandMark size={26} />
        <strong>
          Leet<span>Trace</span>
        </strong>
      </p>
      <h1>See your code actually run.</h1>
      <p className="lead">
        Your Python solution, step by step — call stack, memory and pointers — right on the LeetCode
        problem, against the real examples. It all runs on your own computer.
      </p>
      <p className="status" role="status" aria-live="polite">
        {pairing === undefined ? null : pairing ? (
          <span className="ds-live">Connected to the LeetTrace app</span>
        ) : (
          <span className="ds-pill">Waiting for the LeetTrace app…</span>
        )}
      </p>
      <ol className="steps">
        <li className="ds-card">
          <h2>1 · Get the LeetTrace app</h2>
          <p>
            The extension shows the trace; the small LeetTrace app on your computer runs your code.
            If it&apos;s already running, you&apos;re connected automatically.
          </p>
          <p>
            <a
              className="ds-btn ds-btn-primary"
              href={INSTALL_URL}
              target="_blank"
              rel="noreferrer"
            >
              Download LeetTrace
            </a>
          </p>
        </li>
        <li className="ds-card">
          <h2>2 · Open any LeetCode problem</h2>
          <p>
            A <strong>Trace</strong> button appears next to Run. Click it — no codes, no terminal.
            If Chrome asks whether leetcode.com may use <em>apps on this device</em>, choose{' '}
            <strong>Allow</strong>.
          </p>
        </li>
      </ol>
      <p className="fine">
        Python 3 today. LeetTrace is an independent open-source tool, not affiliated with LeetCode.{' '}
        <a href={SITE_URL}>{SITE_URL.replace(/^https?:\/\//, '')}</a>
      </p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Welcome />
  </StrictMode>,
);
