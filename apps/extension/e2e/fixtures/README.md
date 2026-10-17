# Problem-page fixtures

`two-sum.html` and `reverse-linked-list.html` are **reconstructions** of LeetCode problem pages.
They use the hooks the adapter reads: the description container, `<pre>` and `example-block`
examples, the Run button locator, the language picker, Monaco's DOM, and `window.monaco` with
both a solution model and a test-case (plaintext) model. The build environment can't reach
leetcode.com, so these are not byte-for-byte copies of a live page.

## Testing against a real page

The owner can capture a live page (logged in, Python3 selected):

1. Open a problem, open DevTools → Console, and run:
   `copy('<!doctype html>' + document.documentElement.outerHTML)`
2. Paste the result into `e2e/fixtures/real-<slug>.html`. Remove any personal data, such as
   your username in the nav.

Every `real-*.html` file is picked up automatically by `src/content/fixtures.test.ts`. The
test checks that the Run button is found, the Trace button attaches, and the example cases
are read. If a check fails, the fix belongs in `src/content/leetcodePage.ts` only.

`window.monaco` is not part of a saved page, so code reading is covered by the reconstructions.
