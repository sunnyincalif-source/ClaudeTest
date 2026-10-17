// Keeps LeetTrace attached to LeetCode as the single-page app re-renders and navigates:
// the side panel exists only on /problems/ pages, the Trace button sits beside Run, and a
// problem-to-problem navigation (no page load) re-attaches both and tells the panel.
// All *reading* of LeetCode's DOM goes through ./leetcodePage (the guarded adapter).
import { bus } from './bus';
import { findRunButton, isProblemPath, slugFromPath, watchNavigation } from './leetcodePage';

export const HOST_ID = 'leettrace-root';
export const BUTTON_ID = 'leettrace-trace-button';

export interface AttachOptions {
  doc?: Document;
  win?: Window;
  /** Creates the panel inside `host` (React in production; a stub in tests). */
  mountPanel: (host: HTMLElement) => void;
}

function makeButton(doc: Document): HTMLButtonElement {
  const btn = doc.createElement('button');
  btn.id = BUTTON_ID;
  btn.type = 'button';
  btn.textContent = 'Trace';
  btn.title = 'Visualize your code with LeetTrace';
  btn.setAttribute('aria-label', 'Trace with LeetTrace');
  Object.assign(btn.style, {
    font: '600 13px system-ui, sans-serif',
    padding: '0 12px',
    height: '32px',
    marginRight: '6px',
    borderRadius: '8px',
    border: '1px solid #b8700f',
    background: '#e59a2e',
    color: '#101621',
    cursor: 'pointer',
  } satisfies Partial<CSSStyleDeclaration>);
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    bus.emit('trace');
  });
  return btn;
}

export function startLeetTrace({ doc = document, win = window, mountPanel }: AttachOptions) {
  let slug = slugFromPath(win.location.pathname);

  const sync = () => {
    const onProblem = isProblemPath(win.location.pathname);
    let host = doc.getElementById(HOST_ID);
    if (!host && onProblem) {
      host = doc.createElement('div');
      host.id = HOST_ID;
      doc.documentElement.appendChild(host);
      mountPanel(host);
    }
    if (host) host.style.display = onProblem ? '' : 'none';

    const existing = doc.getElementById(BUTTON_ID);
    if (!onProblem) {
      existing?.remove();
      return;
    }
    const run = findRunButton(doc);
    // Re-attach if LeetCode re-rendered its toolbar and dropped our button (or moved Run).
    if (existing && run && existing.nextElementSibling === run) return;
    existing?.remove();
    if (run?.parentElement) run.parentElement.insertBefore(makeButton(doc), run);
  };

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    setTimeout(() => {
      queued = false;
      sync();
    }, 50);
  };

  sync();
  const mo = new MutationObserver(schedule);
  mo.observe(doc.body, { childList: true, subtree: true });
  const stopNav = watchNavigation(() => {
    sync();
    const next = slugFromPath(win.location.pathname);
    if (next !== slug) {
      slug = next;
      bus.emit('navigate'); // the panel re-reads the new problem
    }
  }, win);

  return {
    sync,
    stop() {
      mo.disconnect();
      stopNav();
    },
  };
}
