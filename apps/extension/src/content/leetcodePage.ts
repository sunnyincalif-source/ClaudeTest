// THE LeetCode DOM adapter (SPEC §5.3). Every read of LeetCode's page lives here, behind a
// version guard, so a site redesign breaks one module — and the panel shows a visible
// "couldn't read the page" fallback (paste your test case) instead of failing silently.
//
// Scope: only the public problem description's example blocks. Never premium/auth-gated
// content, never submissions.

export const ADAPTER_VERSION = '2026.10b';

/** The fallback message shown whenever the page can't be read. */
export const PAGE_FALLBACK = "Couldn't read the page — paste a test case below.";

export interface ExampleCase {
  input: string;
  expected?: string;
}

export interface ProblemInfo {
  slug: string | null;
  title: string | null;
  examples: ExampleCase[];
  /** Language label shown on LeetCode's language picker, if found (e.g. "Python3"). */
  languageLabel: string | null;
  /** Non-fatal reasons something couldn't be read, shown to the user. */
  warnings: string[];
}

export function isProblemPath(pathname: string): boolean {
  return /^\/problems\/[a-z0-9-]+/i.test(pathname);
}

export function slugFromPath(pathname: string): string | null {
  const m = /^\/problems\/([a-z0-9-]+)/i.exec(pathname);
  return m ? m[1]!.toLowerCase() : null;
}

const DESCRIPTION_SELECTORS = [
  '[data-track-load="description_content"]',
  '[data-cy="question-content"]',
  '.question-content__JfgR',
  'div.elfjS',
];

function descriptionRoot(doc: Document): Element | null {
  for (const sel of DESCRIPTION_SELECTORS) {
    const el = doc.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function clean(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** Parse "Input: ... Output: ... Explanation: ..." text into a case. */
export function parseExampleText(text: string): ExampleCase | null {
  const t = text.replace(/\u00a0/g, ' ');
  const m = /Input\s*:?\s*([\s\S]*?)\s*Output\s*:?\s*([\s\S]*?)\s*(?:Explanation\s*:|$)/i.exec(t);
  if (!m) return null;
  const input = clean(m[1]!.replace(/\n+/g, ' '));
  const expected = clean(m[2]!.split('\n')[0]!);
  if (!input) return null;
  return { input, expected: expected || undefined };
}

export function readExamples(doc: Document): ExampleCase[] {
  const root = descriptionRoot(doc);
  if (!root) return [];
  const out: ExampleCase[] = [];
  // Newer layout: <div class="example-block"> with <strong>Input:</strong> spans; older: <pre>.
  const blocks = root.querySelectorAll('.example-block, pre');
  blocks.forEach((b) => {
    const c = parseExampleText((b as HTMLElement).innerText ?? b.textContent ?? '');
    if (c && !out.some((o) => o.input === c.input)) out.push(c);
  });
  return out;
}

function readLanguageLabel(doc: Document): string | null {
  const candidates = doc.querySelectorAll<HTMLElement>(
    '#editor button[aria-haspopup="dialog"], [data-cy="lang-select"], button[id^="headlessui-popover-button"]',
  );
  for (const el of candidates) {
    const text = clean(el.innerText || el.textContent || '');
    if (
      /^(python|python3|c\+\+|java|javascript|typescript|c#|c|go|rust|kotlin|swift|ruby|scala|php|dart)$/i.test(
        text,
      )
    ) {
      return text;
    }
  }
  return null;
}

export function readTitle(doc: Document): string | null {
  const t = doc.querySelector(
    '[data-cy="question-title"], a[href*="/problems/"].no-underline, div.text-title-large',
  );
  const text = t ? clean(t.textContent ?? '') : '';
  return text || null;
}

export function readProblem(doc: Document = document, loc: Location = location): ProblemInfo {
  const warnings: string[] = [];
  const slug = slugFromPath(loc.pathname);
  let examples: ExampleCase[] = [];
  try {
    examples = readExamples(doc);
  } catch {
    // fall through to the warning below
  }
  if (examples.length === 0) warnings.push(`${PAGE_FALLBACK} (adapter ${ADAPTER_VERSION})`);
  return { slug, title: readTitle(doc), examples, languageLabel: readLanguageLabel(doc), warnings };
}

export function isPythonLabel(label: string | null | undefined): boolean {
  return !!label && /^python3?$/i.test(label.trim());
}

/** LeetCode's Run button, to place our Trace button beside it. */
export function findRunButton(doc: Document = document): HTMLElement | null {
  const byLocator = doc.querySelector<HTMLElement>('[data-e2e-locator="console-run-button"]');
  if (byLocator) return byLocator;
  for (const b of doc.querySelectorAll<HTMLElement>('button')) {
    const label = clean(b.innerText || b.textContent || b.getAttribute('aria-label') || '');
    if (label === 'Run' || b.getAttribute('aria-label') === 'Run') return b;
  }
  return null;
}

/**
 * Read the editor's code. Runs in the page's MAIN world (via the background worker's
 * chrome.scripting.executeScript) because Monaco lives on `window` there.
 * Must be self-contained: it is serialized and injected.
 */
export function readMonacoInPage(): { code: string; languageId: string | null } | null {
  type Model = {
    getValue(): string;
    getLanguageId?: () => string;
    getModeId?: () => string;
    isDisposed?: () => boolean;
  };
  type Editor = { getModel(): Model | null; hasTextFocus?: () => boolean };
  const w = window as unknown as {
    monaco?: { editor?: { getModels(): Model[]; getEditors?: () => Editor[] } };
  };
  const api = w.monaco?.editor;
  if (!api) return null;
  const lang = (m: Model) => (m.getLanguageId?.() ?? m.getModeId?.() ?? '').toLowerCase();
  // LeetCode also runs Monaco for the test-case panel (plaintext); skip those models.
  const isCode = (m: Model | null | undefined): m is Model =>
    !!m && !m.isDisposed?.() && !['plaintext', 'json', ''].includes(lang(m));
  const editors = api.getEditors?.() ?? [];
  const fromEditors = editors.map((e) => e.getModel()).filter(isCode);
  const focused = editors.find((e) => e.hasTextFocus?.() && isCode(e.getModel()))?.getModel();
  const candidates = fromEditors.length ? fromEditors : api.getModels().filter(isCode);
  // Prefer the focused editor, then the longest buffer (the solution, not a scratch model).
  const model =
    focused ?? [...candidates].sort((a, b) => b.getValue().length - a.getValue().length)[0] ?? null;
  if (!model) return null;
  return { code: model.getValue(), languageId: lang(model) || null };
}

/** Last-resort fallback when Monaco isn't reachable: visible lines only (lossy). */
export function readVisibleEditorText(doc: Document = document): string | null {
  // The solution editor lives under #editor; the test-case panel has its own Monaco.
  const editor = doc.querySelector('#editor .monaco-editor') ?? doc.querySelector('.monaco-editor');
  if (!editor) return null;
  const lines = editor.querySelectorAll<HTMLElement>('.view-lines .view-line');
  if (lines.length === 0) return null;
  const sorted = [...lines].sort(
    (a, b) => parseFloat(a.style.top || '0') - parseFloat(b.style.top || '0'),
  );
  return sorted.map((l) => (l.innerText || l.textContent || '').replace(/\u00a0/g, ' ')).join('\n');
}

/**
 * Call `onChange` whenever the in-tab URL changes. LeetCode is a single-page app: going from
 * one problem to the next pushes history without a page load. Content scripts can't patch
 * the page's own history.pushState (different JS world), so combine every signal available:
 * the Navigation API, popstate, DOM mutations, and a slow poll as a backstop.
 */
export function watchNavigation(onChange: (url: string) => void, win: Window = window): () => void {
  let last = win.location.href;
  const check = () => {
    const now = win.location.href;
    if (now !== last) {
      last = now;
      onChange(now);
    }
  };
  type Nav = {
    addEventListener(t: string, l: () => void): void;
    removeEventListener(t: string, l: () => void): void;
  };
  const nav = (win as unknown as { navigation?: Nav }).navigation;
  const deferred = () => setTimeout(check, 0);
  nav?.addEventListener('currententrychange', deferred);
  win.addEventListener('popstate', deferred);
  const mo = new MutationObserver(check);
  mo.observe(win.document.documentElement, { childList: true, subtree: true });
  const poll = win.setInterval(check, 700);
  return () => {
    nav?.removeEventListener('currententrychange', deferred);
    win.removeEventListener('popstate', deferred);
    mo.disconnect();
    win.clearInterval(poll);
  };
}
