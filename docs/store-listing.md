# Chrome Web Store listing (ready to paste)

Upload `leettrace-chrome-extension.zip` from the latest GitHub Release. Assets for the listing
are in `docs/store/`.

**Name:** LeetTrace

**Summary (132 chars max):**
See your LeetCode solution run: call stack, memory and pointers, step by step, on the real test cases. 100% local.

**Category:** Developer Tools · **Language:** English

**Description:**

See your code actually run.

LeetTrace rides along with your LeetCode practice and shows the call stack, memory, and
pointers step by step, on the real test cases. Runs entirely on your machine — nothing is
uploaded.

Open any LeetCode problem and a **Trace** button is already there, next to Run. Click it and
step through your Python solution against the problem's own examples:

- **Call stack** — frames push and pop as functions run; recursion becomes something you can
  watch.
- **Live heap & pointer arrows** — lists, dicts, linked lists and trees render as real objects
  and arrows that rewire as your code runs.
- **Step-by-step "why"** — a plain-English reason for every step.
- **Real test cases** — pass/fail and output vs expected, per example.

LeetTrace needs its small free desktop app (Windows, macOS, Linux) from
https://leettrace.vercel.app — that's where your code runs, in a sandbox on your own computer.
The extension connects to it automatically: no codes, no terminal.

Python 3 today; JavaScript next.

LeetTrace is an independent open-source tool and is not affiliated with or endorsed by
LeetCode.

**Single purpose:** show how the user's own solution executes on LeetCode problem pages, using
the LeetTrace app on the user's computer.

**Permission justifications:**

- _Host permission, leetcode.com:_ adds the Trace button and side panel to problem pages;
  reads the problem's public example cases and the code in the editor when the user clicks
  Trace.
- _Host permission, 127.0.0.1:_ talks to the LeetTrace app on the user's own computer
  (loopback only).
- _storage:_ remembers the connection to that app.
- _scripting:_ reads the code from LeetCode's editor, which lives in the page's own context.
- _externally_connectable (127.0.0.1 / localhost):_ lets the LeetTrace app's local page hand
  the extension its connection token automatically.

**Data use disclosures:** collects nothing. No personal data, no analytics, no remote code.
Code and test cases are sent only to the app on the user's own computer (127.0.0.1).

**Privacy policy URL:** https://leettrace.vercel.app/privacy/ (use your deployed site URL)

**Assets (`docs/store/`):**

- Icon 128×128: `icon-128.png`
- Screenshots 1280×800: `1-hero.png`, `2-panel.png`, `3-on-leetcode.png`
- Promo / social image 1200×630: `apps/site/public/media/og.png`

**Firefox Add-ons (secondary):** upload `leettrace-firefox-extension.zip`. Firefox has no
automatic connection (no `externally_connectable`): users connect once with the one-time code
under "Other ways to connect" in the panel.
