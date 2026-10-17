// Keeps LeetTrace attached to LeetCode as the single-page app re-renders and navigates:
// the side panel exists only on /problems/ pages, the Trace button sits beside Run, and a
// problem-to-problem navigation (no page load) re-attaches both and tells the panel.
// All *reading* of LeetCode's DOM goes through ./leetcodePage (the guarded adapter).
import { dark } from '@leettrace/design';
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

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The LeetTrace mark in currentColor (the button lives in LeetCode's DOM: no React here). */
function markIcon(doc: Document): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.4');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = doc.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4');
  const dot = doc.createElementNS(SVG_NS, 'circle');
  dot.setAttribute('cx', '12');
  dot.setAttribute('cy', '12');
  dot.setAttribute('r', '3.2');
  svg.append(path, dot);
  return svg;
}

function makeButton(doc: Document): HTMLButtonElement {
  const btn = doc.createElement('button');
  btn.id = BUTTON_ID;
  btn.type = 'button';
  btn.append(markIcon(doc), doc.createTextNode('Trace'));
  btn.title = 'Visualize your code with LeetTrace';
  btn.setAttribute('aria-label', 'Trace with LeetTrace');
  // Inline styles (the button lives in LeetCode's DOM, outside our shadow root), built from
  // the design tokens: the blue→cyan accent gradient reads on LeetCode's light and dark themes.
  Object.assign(btn.style, {
    font: '600 13px "Geist Sans", system-ui, sans-serif',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '0 13px',
    height: '32px',
    marginRight: '6px',
    borderRadius: '8px',
    border: '0',
    background: `linear-gradient(135deg, ${dark.accent}, ${dark['accent-2']})`,
    color: dark['accent-ink'],
    boxShadow: `0 0 0 1px color-mix(in srgb, ${dark.accent} 40%, transparent)`,
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
