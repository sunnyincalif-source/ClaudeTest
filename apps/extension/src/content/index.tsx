// Content script on https://leetcode.com/problems/*: mounts the LeetTrace side panel in a
// shadow root (styles isolated both ways) and adds a "Trace" button beside LeetCode's Run.
import { createRoot } from 'react-dom/client';
import vizCss from '@leettrace/viz/viz.css?inline';
import panelCss from './panel.css?inline';
import { bus } from './bus';
import { findRunButton } from './leetcodePage';
import { Panel } from './Panel';

const HOST_ID = 'leettrace-root';
const BUTTON_ID = 'leettrace-trace-button';

const onProblemPage = () => location.pathname.startsWith('/problems/');

function mount() {
  const existing = document.getElementById(HOST_ID);
  if (existing) {
    existing.style.display = onProblemPage() ? '' : 'none';
    return;
  }
  if (!onProblemPage()) return;
  const host = document.createElement('div');
  host.id = HOST_ID;
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `${vizCss}\n${panelCss}`;
  shadow.appendChild(style);
  const container = document.createElement('div');
  container.className = 'ltx-root';
  shadow.appendChild(container);
  createRoot(container).render(<Panel />);
}

function injectTraceButton() {
  if (!onProblemPage() || document.getElementById(BUTTON_ID)) return;
  const run = findRunButton();
  if (!run?.parentElement) return;
  const btn = document.createElement('button');
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
    border: '1px solid #4f46e5',
    background: '#4f46e5',
    color: '#fff',
    cursor: 'pointer',
  } satisfies Partial<CSSStyleDeclaration>);
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    bus.emit('trace');
  });
  run.parentElement.insertBefore(btn, run);
}

function sync() {
  mount();
  injectTraceButton();
}

sync();
// LeetCode is a single-page app: re-check on every DOM change (route changes re-render the
// page) so the panel appears on problem pages and the button survives toolbar re-renders.
let queued = false;
new MutationObserver(() => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    sync();
  });
}).observe(document.body, { childList: true, subtree: true });
