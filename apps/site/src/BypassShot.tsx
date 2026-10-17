// The one-time first-launch step for an unsigned app, shown as a small illustration of the
// dialog the visitor will actually meet (SPEC-PRODUCT §10). Drawn in the site's palette — an
// illustration, not a pixel copy — with the exact button names highlighted.
import type { ReactNode } from 'react';

function Shot({ caption, children }: { caption: ReactNode; children: ReactNode }) {
  return (
    <figure className="bypass">
      <div className="bypass-art" aria-hidden="true">
        {children}
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

export function MacBypass() {
  return (
    <Shot
      caption={
        <>
          <b>First time only:</b> in Applications, <b>right-click LeetTrace → Open</b>, then{' '}
          <b>Open</b>. On macOS 15+: System Settings → Privacy &amp; Security → <b>Open Anyway</b>.
        </>
      }
    >
      <div className="os-finder">
        <div className="os-app">
          <span className="os-app-icon" />
          LeetTrace
        </div>
        <ul className="os-menu">
          <li className="hl">Open</li>
          <li>Show Package Contents</li>
          <li className="sep" />
          <li>Move to Trash</li>
        </ul>
      </div>
      <div className="os-dialog">
        <p className="os-title">“LeetTrace” is from an unidentified developer.</p>
        <p className="os-body">Are you sure you want to open it?</p>
        <div className="os-buttons">
          <span>Cancel</span>
          <span className="hl">Open</span>
        </div>
      </div>
    </Shot>
  );
}

export function WindowsBypass() {
  return (
    <Shot
      caption={
        <>
          <b>First time only:</b> if SmartScreen appears, click <b>More info</b>, then{' '}
          <b>Run anyway</b>.
        </>
      }
    >
      <div className="os-smartscreen">
        <p className="os-title">Windows protected your PC</p>
        <p className="os-body">
          Microsoft Defender SmartScreen prevented an unrecognized app from starting.
        </p>
        <p className="os-link hl">More info</p>
        <p className="os-body small">App: LeetTrace-Setup-windows-x64.exe</p>
        <div className="os-buttons">
          <span className="hl">Run anyway</span>
          <span>Don&apos;t run</span>
        </div>
      </div>
    </Shot>
  );
}
