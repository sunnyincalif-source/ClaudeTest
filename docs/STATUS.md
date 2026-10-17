# LeetTrace: status report

**Code:** branch `leettrace` of `github.com/sunnyincalif-source/ClaudeTest`, 13 commits.
**Spec:** `SPEC.md`, with the standing rules in `CLAUDE.md`. All ten phases in SPEC §9 are implemented.
**Tests:** 144 automated tests pass: engine 103 (pytest), schema 14, viz 13, extension 11 and web 3 (Vitest). Three browser end-to-end scripts also pass.

## 1. What's finished

### Monorepo (Phase 0)

- pnpm workspaces and Turborepo, covering `packages/schema`, `packages/engine` (Python, uv + hatchling), `packages/viz`, `apps/web` and `apps/extension`.
- Root commands `pnpm build`, `pnpm test` and `pnpm lint` cover both toolchains: ESLint, Prettier, ruff, `mypy --strict`, Vitest and pytest.
- TypeScript strict mode is on, and `any` is banned in schema, viz and store code.
- CI workflow: `.github/workflows/ci.yml`. Release workflow: `.github/workflows/release.yml`, which builds the wheel, binaries on Linux/macOS/Windows, and extension zips on a version tag.

### Trace Schema (Phase 1)

- `packages/schema/src/index.ts` defines the SPEC §3 types (Trace, Step, Frame, Value, HeapObject, TestResult, engineVersion).
- It also has a zero-dependency runtime validator (`isTrace` / `parseTrace`) and a version-compatibility check (`isCompatibleEngine`, which compares major.minor).
- The engine mirrors the schema in Pydantic (`leettrace/schema.py`), and every trace is validated at the engine boundary.
- A cross-language test checks every engine golden trace against the TypeScript validator.

### Tracer (Phase 1)

- `leettrace/tracer/core.py` uses real CPython and `sys.settrace`. It keeps its own copy of the call stack and records line, call, return and exception events.
- Every step stores the full stack plus every object reachable from it, found by walking references from the locals, with cycle protection.
- Object ids stay stable for the whole trace. Values are serialized as int, float, bool, str, None, list, tuple, dict, set, deque (shown as a list), and instances of your own classes (including `__slots__`). Anything else is shown via its repr.
- Display trimming: long strings are cut at 200 characters, ints above 2^53 are shown as text, and NaN or infinity are shown as their repr.
- Hidden from the variable list: dunder names, imported modules, class objects, `def` definitions and class bodies.
- Sandbox (`tracer/child.py`): every run is a fresh `python -I` subprocess with a minimal environment and a fixed hash seed.
  - The trace comes back over a private file descriptor; the program's own output never touches it.
  - A program's `stdout`/`stderr` are captured and accumulate step by step.
  - `input()` reads from the `--input` text.
- Limits: 10,000 steps, 5 s wall clock, recursion depth 200, and 256 MB memory plus a CPU cap (memory and CPU caps are POSIX only). Runs have a hard parent timeout and a cap on total recorded data.
- When a limit is hit, the run stops immediately and returns a partial trace marked `truncated`, even if the code catches exceptions.
- Errors never crash the engine. A program that raises gets a final "exception" step showing where it blew up, and `trace.error` is set. A syntax error returns an `error` trace.

### Narration (Phase 1 and Phase 8, tier 1)

- `tracer/narrate.py` writes one note per step from the code on the current line plus the event. Conditions are evaluated by a small whitelist evaluator that never calls your code.
- It looks ahead one step to describe what a line does, for example: "x will be 5", "head will point to the Node(1)", "Checking if n <= 1 (5 <= 1) → False, so we skip the if block", "Swap: nums[j] (5) and nums[j + 1] (1) trade places", "Base case: n <= 1 is True — returning 1", and "Calling factorial(n=4) (recursion depth 2)".
- `tests/test_narration.py` checks every factual claim in a note against the next state the viz shows.

### Local server and CLI (Phase 2)

- `leettrace/server/` is FastAPI plus uvicorn, bound to `127.0.0.1` only. Default port 47823; if busy it tries the next 10.
- Endpoints: `/health`, `/trace`, `/leetcode/trace`, `/runs/{id}`, WebSocket `/watch`, `/pair/request`, `/pair/confirm`, `/pair/pending` and `/shutdown`.
- Security:
  - Bearer session token on every API call, compared in constant time.
  - Session file `~/.leettrace/session.json` is 0600 inside a 0700 folder.
  - Origin allowlist: `https://leetcode.com` plus the engine's own UI.
  - Host-header check against DNS rebinding.
  - CORS and Private Network Access preflight handling.
  - Size limits: 413 for bodies over 1 MB, 100 KB for code.
  - At most 2 traces run at once.
  - A strict Content-Security-Policy on the UI.
- Pairing: the extension asks to pair, the terminal prints a 6-digit code, and you type it into the panel. Lockout after 5 wrong attempts, at most 3 pending requests, rate-limited.
- Documented in `docs/SECURITY.md`.
- CLI commands (Typer + Rich): `start`, `stop`, `status`, `open`, `pair`, `run [--input] [--json] [--tui] [--no-open]`, `watch`, `leetcode -c CASE -e EXPECTED [--function] [--tui]`, `demo`, and `--version`.
- The engine starts in the background automatically when needed. A welcome message is shown on first run.

### Shared visualization (Phase 3)

- `packages/viz` contains TraceViewer, StackPanel, HeapPanel, ArrowLayer, NarrationBar, Controls, OutputPane, SourceView and TestResultBadge.
- Layout (`lib/layout.ts`) is computed once per trace, so objects never move:
  - Chains (like linked lists) go left to right.
  - Trees are laid out in-order, one row per depth.
  - Lists, dicts and other containers flow below.
- Arrows are SVG curves measured from the page. A repointed reference slides to its new target, self-references loop, and arrows re-measure on resize, scroll and font load.
- Values that just changed are highlighted, computed purely from the current and previous step.
- Playback: play/pause, step, first/last, a speed setting (0.5–16 steps per second), a timeline scrubber, and keys ←/→/Space/Home/End.
- Supports `prefers-reduced-motion`, light/dark themes via CSS variables, ARIA labels, and a phone layout below 560 px. A banner appears if the engine version doesn't match.
- At most 60 objects are drawn per step; the rest show as "+N more".
- A harness (`pnpm --filter @leettrace/viz harness`) replays recorded traces in `packages/viz/fixtures`, so the viz can be developed without the engine.

### Local web UI and watch mode (Phase 4)

- `apps/web` is built into the engine package, and the engine serves it.
- It reads the token from the URL fragment, removes it from the address bar, and keeps it only for that tab.
- Live view over WebSocket `/watch`, with auto-reconnect and an in-memory run history.
- Practice tab with 8 bundled problems. The editor is a plain textarea with a case editor, and Ctrl/⌘+Enter runs it.
- Also has a theme toggle, a "How it works" dialog and onboarding when opened without a token.
- `leettrace watch` re-traces on save; the open page updates in about 200 ms (measured end to end).

### LeetCode adapter (Phase 5)

- Codec (`leettrace/leetcode/codec.py`) parses inputs written as `nums = [..], target = 9` or one value per line. It understands JSON and Python-style literals, linked lists like `[1,2,3]`, level-order trees like `[1,2,null,3]`, and `List[ListNode]` / `List[TreeNode]`.
- Comparison is structural and tolerates small float differences.
- Harness (`leettrace/leetcode/harness.py`) loads a prelude matching LeetCode's environment:
  - `typing` and `collections`
  - `heapq`, `bisect`, `math` and `itertools`
  - `ListNode` and `TreeNode`
  - a fixed random seed
- It loads your module without tracing it, finds `class Solution` and its method (`functionName` or the first public method), and converts arguments from the type hints.
- Only your own frames are traced; an empty `self` is hidden.
- For problems that return `None` (modify in place), the first argument is compared. Each case gets a TestResult (input, expected, actual, passed, error), and you get one trace per case.

### Browser extension (Phase 6)

- `apps/extension` is MV3 (Chrome) built with CRXJS, plus a Firefox build in `dist-firefox`.
- It loads on all of leetcode.com and only shows itself on `/problems/` pages, including after in-app navigation (fixed after the first test).
- All reading of LeetCode's page lives in one module, `content/leetcodePage.ts`, covering the slug, title, example cases, Run button and language label. If the examples can't be read, it says so and lets you paste a test case.
- Code is read from LeetCode's editor by the background worker. If that fails, it falls back to the visible editor lines.
- Requests to the engine come from the content script, so they carry `Origin: https://leetcode.com`.
- Chrome's local-network permission: it now checks both old and new permission names, waits up to 60 s for your answer to Chrome's prompt, and explains how to allow access if denied (fixed after the first test).
- The side panel lives in its own shadow DOM, so LeetCode's styles can't break it. It has a Trace button next to Run, example checkboxes, a custom case box, and pass/fail tabs per case.
- Other screens: "Start the LeetTrace app" when the engine is off, the pairing screen, an outdated-engine warning, a Python-only message, a popup (status and "forget pairing"), and a welcome page shown on install.

### Terminal UI (Phase 7)

- `leettrace/tui.py` (Textual) shows the source with the current line, the call stack and locals, a compact heap, the note and the output. Keys: ←/→, Home/End, Space, q.

### Packaging and hardening (Phase 9)

- The wheel includes the web UI and was verified in a clean Python 3.11 environment.
- `packaging/build_binary.sh` builds a standalone PyInstaller binary (the sandbox child re-runs the same binary). It was verified in an empty environment.
- `pnpm --filter @leettrace/extension package` builds the Chrome and Firefox zips. Release steps are in `docs/RELEASING.md`.

### Polish, accessibility and docs (Phase 10)

- axe-core finds no WCAG 2.1 AA violations in the light, dark, practice, 380 px and onboarding views. There is no horizontal scrolling at 380 px.
- Lighthouse on the web UI: Performance 91, Accessibility 99, Best Practices 100.
- Docs:
  - `README.md` (architecture diagram, trace contract, install and usage)
  - `docs/SECURITY.md`, `docs/RELEASING.md` and `docs/HANDOFF.md`
  - `docs/store-listing.md` and `docs/linkedin-post.md`
  - demo GIFs in `docs/demo/` and screenshots in `docs/images/`

### End-to-end scripts (each needs a real engine and Chromium)

- `pnpm --filter @leettrace/web e2e`: page shown without a token, token removed from the URL, watch round trip, run pushed into the open UI, arrows drawn, no console errors.
- `pnpm --filter @leettrace/web audit`: axe-core plus the 380 px check.
- `pnpm --filter @leettrace/extension e2e`: the unpacked extension against a mock problem page served at the real leetcode.com URL. Covers in-app navigation, the engine-off prompt, pairing (wrong code rejected), scraped examples, pass/fail, only your frames shown, arrows drawn, and the token not exposed to the page.

## 2. Not verified or not done yet

| Area              | Status                                                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Real leetcode.com | Never tested against the live site; only against `apps/extension/e2e/mock-problem.html`. The user's first real test found two bugs (both fixed and pushed). A retest after the fixes is still pending. |
| Windows           | Built and tested only on Linux. The user runs Windows/PowerShell. The memory cap isn't enforced on Windows. Snapshot tests may fail if git converts line endings.                                      |
| Publishing        | Not on PyPI, the Chrome Web Store or Firefox Add-ons. There's no public repo, and the code lives on a branch of an unrelated repo.                                                                     |
| CI                | The workflow exists but has never run on GitHub.                                                                                                                                                       |
| Install link      | `INSTALL_URL` in `apps/extension/src/content/Panel.tsx` is a placeholder.                                                                                                                              |
| Process           | Each phase is one commit on a single branch; no pull requests were opened.                                                                                                                             |

## 3. Known limitations (candidates for next work)

**LeetCode support**

- "Design" problems written as `["LRUCache","put",…]` with argument lists aren't supported.
- Not decoded: N-ary `Node`, graph `Node` (clone graph), random-pointer lists, linked lists with a cycle (`pos`), and `List[List[TreeNode]]`.
- Problems that accept answers in any order are compared strictly.
- Only Python 3 is supported. A `-> None` problem is assumed to modify its first argument.

**Tracer**

- At most 300 heap objects per step; references past that show as "…".
- Threads, async code, and code inside imported library modules aren't traced.
- Captured output is capped at 64 KB.
- deque is shown as a plain list.

**Visualization**

- Arrows can cross over cards.
- A doubly linked list is laid out as a tree (staircase).
- Lists and dicts shift position as they appear and disappear.
- No search, zoom or pan for large heaps.
- No export as GIF or video, and no shareable link.

**Web UI**

- The practice editor is a plain textarea, not CodeMirror.
- Run history isn't saved.
- No file picker for local files.

**Extension**

- Reading LeetCode's editor depends on `window.monaco`.
- Reading the page depends on LeetCode's markup (one module to update).
- Chrome's local-network prompt is required.
- No keyboard shortcut to trigger a trace.

**Security**

- Bodies sent without a `Content-Length` header (chunked) are only limited by the per-field limits.
- The sandbox limits resources but is not a security sandbox: code runs with the user's own permissions.

**Not built yet (roadmap)**

- An LLM narration tier (SPEC §7 tier 2).
- A JavaScript tracer via Node's inspector protocol.
- C++ and Java tracers.

## 4. How to resume

```bash
git clone -b leettrace https://github.com/sunnyincalif-source/ClaudeTest.git leettrace && cd leettrace
pnpm install && (cd packages/engine && uv sync)
pnpm build && pnpm test && pnpm lint
cd packages/engine && uv run leettrace demo
```

Key files:

| What           | Where                                                                                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract       | `packages/schema/src/index.ts`, `packages/engine/src/leettrace/schema.py`                                                                                   |
| Tracer         | `packages/engine/src/leettrace/tracer/{core,child,runner,narrate}.py`                                                                                       |
| LeetCode       | `packages/engine/src/leettrace/leetcode/{codec,harness}.py`                                                                                                 |
| Server and CLI | `packages/engine/src/leettrace/server/*`, `packages/engine/src/leettrace/cli/__init__.py`, `packages/engine/src/leettrace/client.py`                        |
| Viz            | `packages/viz/src/components/*`, `packages/viz/src/lib/{layout,diff,usePlayback}.ts`, `packages/viz/src/viz.css`                                            |
| Web            | `apps/web/src/{App.tsx,api.ts,useWatch.ts,samples.ts}`                                                                                                      |
| Extension      | `apps/extension/src/content/{index.tsx,Panel.tsx,daemon.ts,leetcodePage.ts}`, `apps/extension/src/background/index.ts`, `apps/extension/manifest.config.ts` |
| Golden traces  | `packages/engine/tests/snapshots/`. A new snapshot fails on purpose so it gets reviewed; update with `uv run pytest --snapshot-update` and review the diff. |

Rules that apply to any next prompt (from `CLAUDE.md`):

- The UI reads only the Trace Schema; never branch on the language in viz, web or extension code.
- Changes to the tracer or adapter must update the golden tests, and the snapshot diffs must be reviewed.
- The server stays bound to 127.0.0.1 and requires the token. The origin allowlist is never widened.
- Don't use Pyodide or WebAssembly.
- Accessibility and both themes are acceptance criteria.
