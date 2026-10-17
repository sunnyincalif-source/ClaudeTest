import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@leettrace/design/fonts.css';
import '@leettrace/design/components.css';
import '@leettrace/design/tokens.css';
import { BrandMark } from '../shared/BrandMark';
import { INSTALL_URL } from '../shared/config';
import { clearPairing } from '../shared/storage';
import { useConnection } from '../shared/useConnection';
import './popup.css';

function Popup() {
  const pairing = useConnection();
  return (
    <main>
      <h1>
        <BrandMark size={18} />
        Leet<span>Trace</span>
      </h1>
      <p>
        Open any problem on leetcode.com and click <strong>Trace</strong> next to Run.
      </p>
      {pairing === undefined ? null : pairing ? (
        <>
          <p>
            <span className="ds-live">Connected to the app (port {pairing.port})</span>
          </p>
          <button type="button" onClick={() => void clearPairing()}>
            Disconnect
          </button>
        </>
      ) : (
        <p className="muted">
          Not connected yet. Open the LeetTrace app — the extension connects to it automatically.
        </p>
      )}
      <p className="small">
        <a href={INSTALL_URL} target="_blank" rel="noreferrer">
          Get the LeetTrace app
        </a>
      </p>
      <p className="muted small">
        Your code runs only on your computer. LeetTrace is an independent tool, not affiliated with
        LeetCode.
      </p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);
