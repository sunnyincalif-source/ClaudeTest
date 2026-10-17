// Saved-problem-page tests (SPEC-LAUNCH Phase 11). Runs the real adapter + attach logic
// against problem-page fixtures (e2e/fixtures/*.html, including any owner-captured
// real-*.html pages) so regressions are caught without a live leetcode.com login.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BUTTON_ID, HOST_ID, startLeetTrace } from './attach';
import { bus, type BusEvent } from './bus';
import {
  PAGE_FALLBACK,
  findRunButton,
  readMonacoInPage,
  readProblem,
  readVisibleEditorText,
} from './leetcodePage';

const dir = join(__dirname, '..', '..', 'e2e', 'fixtures');
const fixtures = readdirSync(dir).filter((f) => f.endsWith('.html'));
const html = (name: string) => readFileSync(join(dir, name), 'utf8');

function load(name: string, path: string) {
  const doc = new DOMParser().parseFromString(html(name), 'text/html');
  document.documentElement.innerHTML = doc.documentElement.innerHTML;
  window.history.replaceState(null, '', path);
  return doc;
}

function runPageScripts() {
  for (const s of Array.from(document.querySelectorAll('script'))) window.eval(s.textContent ?? '');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.each(fixtures)('fixture %s', (name) => {
  const slug = name.replace(/^real-/, '').replace(/\.html$/, '');
  beforeEach(() => load(name, `/problems/${slug}/description/`));

  it('reads the example cases and finds the Run button', () => {
    const p = readProblem(document, window.location);
    expect(p.slug).toBe(slug);
    expect(p.examples.length).toBeGreaterThan(0);
    expect(p.examples[0]!.input).toMatch(/=/);
    expect(p.warnings).toEqual([]);
    expect(findRunButton(document)).not.toBeNull();
  });

  it('attaches the Trace button beside Run and mounts the panel host', () => {
    const lt = startLeetTrace({ mountPanel: (h) => (h.dataset.mounted = '1') });
    const btn = document.getElementById(BUTTON_ID);
    expect(btn).not.toBeNull();
    expect(btn!.nextElementSibling).toBe(findRunButton(document));
    expect(document.getElementById(HOST_ID)?.dataset.mounted).toBe('1');
    lt.stop();
  });
});

describe('reconstructed pages', () => {
  afterEach(() => {
    delete (window as unknown as { monaco?: unknown }).monaco;
  });

  it('reads both example layouts (<pre> and example-block)', () => {
    load('two-sum.html', '/problems/two-sum/');
    expect(readProblem().examples).toEqual([
      { input: 'nums = [2,7,11,15], target = 9', expected: '[0,1]' },
      { input: 'nums = [3,2,4], target = 6', expected: '[1,2]' },
      { input: 'nums = [3,3], target = 6', expected: '[0,1]' },
    ]);
    load('reverse-linked-list.html', '/problems/reverse-linked-list/');
    expect(readProblem().examples).toEqual([
      { input: 'head = [1,2,3,4,5]', expected: '[5,4,3,2,1]' },
      { input: 'head = [1,2]', expected: '[2,1]' },
    ]);
  });

  it('reads the solution model, not the test-case panel model', () => {
    load('two-sum.html', '/problems/two-sum/');
    runPageScripts();
    const got = readMonacoInPage();
    expect(got?.languageId).toBe('python');
    expect(got?.code).toContain('def twoSum');
  });

  it('falls back to the visible solution editor lines (not the test-case editor)', () => {
    load('two-sum.html', '/problems/two-sum/');
    expect(readVisibleEditorText(document)).toContain('class Solution:');
  });

  it('shows the visible fallback when the page layout is unknown', () => {
    document.body.innerHTML = '<main>redesigned</main>';
    window.history.replaceState(null, '', '/problems/two-sum/');
    const p = readProblem();
    expect(p.examples).toEqual([]);
    expect(p.warnings[0]).toContain(PAGE_FALLBACK);
  });

  it('re-attaches after LeetCode re-renders its toolbar', async () => {
    load('two-sum.html', '/problems/two-sum/');
    const lt = startLeetTrace({ mountPanel: () => undefined });
    const toolbar = document.getElementById('ide-top-btns')!;
    const clone = toolbar.cloneNode(true) as HTMLElement;
    clone.querySelector(`#${BUTTON_ID}`)?.remove();
    toolbar.replaceWith(clone); // React re-render drops our foreign node
    expect(document.getElementById(BUTTON_ID)).toBeNull();
    await sleep(120);
    expect(document.getElementById(BUTTON_ID)?.nextElementSibling).toBe(findRunButton(document));
    lt.stop();
  });

  // Regression: "button missing after in-app navigation" (fixed in ceeacb7).
  it('survives SPA navigation: problem list → problem → next problem, no page load', async () => {
    load('two-sum.html', '/problemset/');
    document.body.innerHTML = '<div id="__next"><a href="/problems/two-sum/">Two Sum</a></div>';
    const events: BusEvent[] = [];
    const off = bus.on((e) => events.push(e));
    const lt = startLeetTrace({ mountPanel: () => undefined });
    expect(document.getElementById(BUTTON_ID)).toBeNull();

    // Click into a problem: the app pushes history and renders the problem page.
    window.history.pushState(null, '', '/problems/two-sum/');
    document.body.innerHTML = new DOMParser().parseFromString(
      html('two-sum.html'),
      'text/html',
    ).body.innerHTML;
    await sleep(800);
    expect(document.getElementById(BUTTON_ID)).not.toBeNull();
    expect(document.getElementById(HOST_ID)!.style.display).toBe('');

    // "Next problem" — again no page load.
    window.history.pushState(null, '', '/problems/reverse-linked-list/');
    document.body.innerHTML = new DOMParser().parseFromString(
      html('reverse-linked-list.html'),
      'text/html',
    ).body.innerHTML;
    await sleep(800);
    expect(document.getElementById(BUTTON_ID)?.nextElementSibling).toBe(findRunButton(document));
    expect(readProblem().slug).toBe('reverse-linked-list');
    expect(events.filter((e) => e === 'navigate').length).toBe(2);

    // Back to the list: the panel hides and the button goes away.
    window.history.pushState(null, '', '/problemset/');
    document.body.innerHTML = '<div id="__next">list</div>';
    await sleep(800);
    expect(document.getElementById(BUTTON_ID)).toBeNull();
    expect(document.getElementById(HOST_ID)!.style.display).toBe('none');
    lt.stop();
    off();
  });
});
