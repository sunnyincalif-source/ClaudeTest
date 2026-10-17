import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { clearPairing, getPairing, type Pairing } from '../shared/storage';
import './popup.css';

function Popup() {
  const [pairing, setPairing] = useState<Pairing | null | undefined>(undefined);
  useEffect(() => {
    void getPairing().then(setPairing);
  }, []);
  return (
    <main>
      <h1>LeetTrace</h1>
      <p>
        Open any problem on leetcode.com and click <strong>Trace</strong> next to Run.
      </p>
      {pairing === undefined ? null : pairing ? (
        <>
          <p className="ok">Paired with your engine on port {pairing.port}.</p>
          <button
            type="button"
            onClick={() => {
              void clearPairing().then(() => setPairing(null));
            }}
          >
            Forget this pairing
          </button>
        </>
      ) : (
        <p className="muted">
          Not paired yet. Start the engine with <code>leettrace start</code>, then click Connect in
          the panel.
        </p>
      )}
      <p className="muted small">
        Your code runs only on your machine. LeetTrace is an independent tool, not affiliated with
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
