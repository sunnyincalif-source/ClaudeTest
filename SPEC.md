# LeetTrace — Engineering Specification

> A downloadable developer tool that plugs into your real LeetCode practice. Install a
> local trace engine; it rides alongside your work in **two** places — your **terminal**
> and the **LeetCode tab in your browser** — and shows how your solution actually executes:
> live call stack, memory/heap, pointer arrows for linked lists and trees, variable state,
> and a plain-English reason per step, run against the problem's real test cases.
>
> Not a paste-box. Real software you download and use while you practice.

**Document owner:** you (engineering lead)
**Implementer:** Claude Code
**Status:** v1 spec, ready to build
**Target:** a usable, installable v1 (Python, terminal + LeetCode overlay) in ~4–6 weeks
part-time, published to the Chrome Web Store and installable via one command.

> Name note: "LeetTrace" is a working title and a *third-party companion* tool — not
> affiliated with or endorsed by LeetCode. Don't use their logo/branding or imply
> affiliation. Rename freely; the engine package is language/brand-neutral.

---

## 0. How to use this document
You are the senior engineer. Claude Code is the implementer. This spec is the source of
truth. Build **one phase at a time** (§9); each phase has acceptance criteria that must
pass before the next begins. The value of this project is in the parts people cut — the
real tracer, the localhost bridge done safely, the pointer arrows, the packaging. Keep
this at the repo root as `SPEC.md`; `CLAUDE.md` holds the standing rules; `PROMPTS.md` has
per-phase kickoff prompts.

---

## 1. The shape of the product (read this first)

Three components, **one contract**:

1. **Trace Engine** (`packages/engine`, Python) — the core. Installs locally. Runs the
   user's solution, traces execution with `sys.settrace`, reconstructs the live object
   graph, and emits a **Trace** (§3). Also hosts a small **localhost server** that both
   clients talk to, and a **LeetCode adapter** that wraps `Solution().method()` and runs it
   against the problem's example tests.
2. **Terminal client** (`leettrace` CLI, part of the engine package) — `run`, `watch`
   (re-trace on save), and an optional in-terminal **TUI**. For the "while I'm coding in my
   editor" workflow.
3. **Browser extension** (`apps/extension`) — injected on `leetcode.com/problems/*`. Reads
   your code + scrapes the example test cases from the page, sends them to the local engine,
   and renders the visualization in a side panel **on the LeetCode tab itself**.

The **Trace Schema** is the spine: it is the engine's output, the localhost wire format,
*and* the only thing the visualization knows how to read. Get it right once; everything
hangs off it.

```
            ┌─────────────── your machine ───────────────┐
 terminal → │  leettrace CLI ──┐                          │
            │                  ▼                          │
 browser  → │   LeetCode tab ──► Trace Engine (127.0.0.1) │ ──► Trace (schema) ──► Viz
 (extension)│   (extension)     sys.settrace + adapter    │
            └─────────────────────────────────────────────┘
```

---

## 2. The decision that defines the project (unchanged from day one, more important now)

**Do not write an interpreter. Instrument the real runtime.** For Python: genuine CPython
+ `sys.settrace`, running **natively** (it's a local app now, not WASM) in an isolated
subprocess. The whole language is correct by construction; the engineering goes into
reading state out well. "Universal" is a property of the **schema**, not a pile of
half-languages.

**Language scope (the override point — flag to the owner, don't silently expand):**
- **v1: Python only.** Real stack, heap, and pointers via `sys.settrace`.
- **v1.5: JavaScript**, via Node's inspector protocol (CDP) — same schema, new producer.
- **Roadmap, honestly hard: C++ (gdb/lldb MI) and Java (JDWP/JDI).** Real debugger
  integration, platform-sensitive. A separate project-sized effort each. Not v1.

If the owner needs C++ for their own practice, that's a scope conversation — it does not
become a v1 line item.

---

## 3. The Trace Schema (the spine — now also the localhost wire format)

Lives in `packages/schema` as the canonical TypeScript, **mirrored** by Pydantic models in
the engine. Both sides validate against it. No language-specific field ever leaks in.

```ts
export type Primitive =
  | { kind: 'int'; value: number }
  | { kind: 'float'; value: number }
  | { kind: 'bool'; value: boolean }
  | { kind: 'str'; value: string }
  | { kind: 'none' }
  | { kind: 'unserializable'; repr: string };

export type Ref = { kind: 'ref'; id: HeapId };
export type Value = Primitive | Ref;
export type HeapId = string; // stable within a trace

export type HeapObject =
  | { type: 'list';     id: HeapId; items: Value[] }
  | { type: 'tuple';    id: HeapId; items: Value[] }
  | { type: 'dict';     id: HeapId; entries: { key: Value; value: Value }[] }
  | { type: 'set';      id: HeapId; items: Value[] }
  | { type: 'instance'; id: HeapId; className: string; fields: Record<string, Value> };

export interface Frame {
  id: string;                 // stable per activation
  func: string;
  locals: Record<string, Value>;
  order: string[];            // display order of locals
  returnValue?: Value;
}

export type StepEvent = 'line' | 'call' | 'return' | 'exception';

export interface Step {
  i: number;
  line: number;               // 1-based, in the user's source
  event: StepEvent;
  stack: Frame[];             // top-of-stack last
  heap: Record<HeapId, HeapObject>; // ONLY reachable objects (§4.4)
  stdout: string;             // cumulative, not a delta
  note?: string;              // the "why" (§7)
  exception?: { type: string; message: string };
}

export interface TestResult {
  index: number;
  input: string;              // human-readable rendering of the case
  expected?: string;
  actual?: string;
  passed?: boolean;           // undefined if no expected value available
  error?: string;
}

export interface Trace {
  language: 'python';         // union grows later
  source: string;
  steps: Step[];
  test?: TestResult;          // which case this trace ran (LeetCode mode)
  truncated?: boolean;        // hit the step/time cap
  error?: { type: string; message: string; line?: number };
  engineVersion: string;      // for client/engine compatibility checks
}
```

**Schema rules (enforce in review):**
- The viz renders any valid `Trace` with zero Python knowledge. No `if (language === …)` in
  UI or viz components — push it into the engine.
- `stdout` is cumulative per step (O(1) scrubbing).
- Every step carries a complete stack + reachable heap. No trace-time diffing.
- `HeapId`s are stable across steps for the same object — this is what lets a node sit still
  while a pointer rewires. Non-negotiable for the linked-list/tree payoff.
- `engineVersion` is checked by both clients; a mismatch shows an "update" prompt, never a
  silent misrender.

---

## 4. The Trace Engine (`packages/engine`, Python)

### 4.1 Tracer (`engine/tracer/`)
- Run user code in an **isolated subprocess** with limits: **≤10k steps**, **≤5s wall**,
  **≤256MB**, recursion depth cap. On breach: stop, set `truncated`, return partial trace.
- Redirect stdout/stderr into a per-step cumulative buffer.
- Install `sys.settrace`; capture `line`/`call`/`return`/`exception`. Maintain a shadow
  stack pushed/popped on call/return (cleaner than walking `f_back`).
- **Value serialization** (done in Python, emitted as schema JSON): primitives inline;
  `list/tuple/dict/set` → heap objects, recursing; user instances → `instance` with
  `className` + `vars(x)`; everything else → `unserializable` with a trimmed `repr`. Trim
  long strings for display. Never crash on an exotic object.
- **Heap identity & reachability (§4.4 below).**
- **Errors/exceptions:** never throw to the caller. Record a final `exception` step with the
  line, set `trace.error`, return the partial trace. Showing *where it blew up* is a feature.

### 4.4 Heap identity and reachability
- Map Python `id(obj)` → short stable ids (`"o1"…`) per trace; same object ⇒ same id across
  steps.
- Build each step's heap by **BFS from roots** (all locals in all frames). Only reachable
  objects are included — keeps snapshots small and demonstrates GC-like disappearance.
  Track visited ids to survive cycles (doubly-linked lists, graphs).

### 4.5 LeetCode adapter (`engine/leetcode/`)
Turns a LeetCode submission into something traceable:
- Input: `{ code, language, slug, functionName, params, cases: [{input, expected?}] }`.
- Parse each example `input` string into real arguments (LeetCode's format: named args,
  arrays, linked-list/tree encodings like `[1,2,3,null,4]`). Provide decoders for the common
  LeetCode structures (`ListNode`, `TreeNode`) and a generic JSON path for the rest.
- Synthesize a harness: instantiate `Solution`, call `functionName(*parsed)`, capture the
  return, **trace only the user's frames** (filter out harness frames so the viz shows the
  user's code, not our wrapper). Compare to `expected` when present → `TestResult`.
- Return one `Trace` per case (or the first failing case by default; client chooses).

### 4.6 Local server (`engine/server/`)
- Bind **`127.0.0.1` only** (never `0.0.0.0`). Default port with fallback scan; write the
  chosen port + a random **session token** to `~/.leettrace/session.json`.
- Endpoints: `GET /health` (version, status), `POST /trace` (raw code + input),
  `POST /leetcode/trace` (adapter input), `WS /watch` (push updates in `watch`/extension
  live mode).
- **Security (first-class, see §8):** origin allowlist (`https://leetcode.com` + the local
  UI origin), bearer **session token** required on every request, CORS locked to those
  origins, requests without the token rejected 401. The engine executes only code handed to
  it by an authenticated local client.

### 4.7 Tests
Golden-trace tests (`engine/tests/`): for each sample program assert real `stdout`,
structural heap invariants (e.g. after `reverse`, walking `next` yields reversed values),
and full-trace snapshots. Adapter tests: `[1,2,3,null,4]` decodes to the right `TreeNode`
graph; harness frames are filtered out. Server tests: missing token → 401; disallowed
origin → rejected; oversized/looping program → `truncated`.

Minimum golden programs: factorial, recursive fib, linked-list build + reverse, BST insert
+ inorder, bubble sort, two-sum (dict), and one that raises an exception.

---

## 5. Clients

### 5.1 Terminal client — the `leettrace` CLI (ships with the engine)
- `leettrace start` — launch the daemon (server) and keep it running; print status + the
  local UI URL. This is what "download and it runs" means.
- `leettrace run <file.py> [--input "..."] [--tui]` — trace once; by default open the local
  web UI (§5.2) focused on this run; with `--tui`, render in the terminal.
- `leettrace watch <file.py> [--input "..."]` — watch the file; re-trace on every save and
  push to any open UI over `WS /watch`. This is the live "while I code in my editor" loop.
- **TUI mode** (`--tui`, Textual): current line, call stack, locals, and a compact heap view
  right in the terminal, with ←/→ to step. Great for terminal-natives. *Marked optional in
  §9 — the web UI is the primary rich view; don't build the viz twice.*

### 5.2 Local web UI (`apps/web`) — served by the engine
A single-page app the engine serves at the local URL. Full visualizer built from the shared
`packages/viz` components (§6). `leettrace run` opens it; `watch` live-updates it. This is
the same component set the extension embeds, so the rich viz exists **once**.

### 5.3 Browser extension (`apps/extension`) — the LeetCode tab integration
- Manifest V3. Content script matches `https://leetcode.com/problems/*`.
- **Read from the page:** the user's code from the Monaco editor model, the selected
  language, the problem slug, the function signature, and the **example test cases** scraped
  from the DOM. (DOM scraping is brittle by nature — isolate it behind one adapter module
  with a version guard and a visible "couldn't read the page" fallback.)
- **Talk to the daemon:** read port+token from the extension's stored handshake (§8); call
  `POST /leetcode/trace`. If the daemon isn't running, show a clear "Start the LeetTrace app
  (`leettrace start`)" panel with the install link — never fail silently.
- **Render:** inject a collapsible **side panel** on the LeetCode page rendering
  `packages/viz` (stack, heap, arrows, narration, scrubber). Add a "Trace" button beside
  LeetCode's Run.

---

## 6. Shared visualization (`packages/viz`)
Framework-shared React components consumed by both `apps/web` and `apps/extension`. A viz is
a **pure function of `trace.steps[stepIndex]`** — no imperative animation state.
- `StackPanel` (frames + locals pills), `HeapPanel` (object/node cards, deterministic layout
  via `layout.ts`), `ArrowLayer` (measure DOM rects → animated SVG bezier pointers; stable
  ids keep nodes still while arrows rewire; cycles get looped curves), `NarrationBar`,
  `Controls` (play/pause/step/back/speed + scrubber, keyboard, `prefers-reduced-motion`),
  `TestResultBadge`.
- Develop against recorded sample traces in a harness/Storybook so the viz is built and
  reviewed independently of the engine.

**Arrow acceptance:** build a 4-node linked list and reverse it — arrows flip one at a time
while nodes stay put. A binary tree renders as a readable branching structure. This is the
demo clip.

---

## 7. The "why" narration
- **Tier 1 (ship):** rule-based note per step, derived from the AST node on the current line
  + the event (compute AST in the engine during tracing; attach `Step.note`). "Calling
  dfs(node=3)." / "left child is None — returning." / "swap: nums[i] and nums[j]."
- **Tier 2 (stretch):** one cached LLM pass over (source + compact trace) producing richer
  notes, keyed by source hash, always behind the rule-based fallback. Never a runtime
  dependency.

---

## 8. Security & trust (not optional — a localhost code-runner is a target)
- Server binds **loopback only**. Never `0.0.0.0`, never a LAN interface.
- **Session token:** random, written to `~/.leettrace/session.json` (user-readable only,
  `0600`). Every request needs it as a bearer token. The extension obtains it via a one-time
  handshake: on first connect the daemon shows/returns the token through a local
  confirmation step the user approves; the extension stores it. No token ⇒ 401.
- **Origin allowlist:** only `https://leetcode.com` and the local UI origin. Reject the rest.
- **Executes only user-provided code**, in a subprocess with the §4.1 caps. Document clearly
  that the tool runs your code locally, like any debugger.
- Threat the design rejects: a random web page silently POSTing code to your machine. The
  token + origin allowlist + loopback binding close that off.

---

## 9. Phased implementation plan
Each phase is a gate: demo it, tests green, PR, then proceed.

**Phase 0 — Monorepo scaffold.** pnpm workspaces + Turborepo. `packages/schema` (TS),
`packages/engine` (Python, uv/hatch), `packages/viz` (React lib), `apps/web` (Vite React),
`apps/extension` (MV3, CRXJS). Lint/format/test/CI for both toolchains.
*Done when:* every workspace builds, lints, and runs its empty test suite; CI is green.

**Phase 1 — Schema + Python tracer (headless, tested).** `schema.ts` + mirrored Pydantic.
Native `sys.settrace` tracer: serialization, heap reachability, stable ids, caps, error
capture. Golden-trace tests (§4.7).
*Done when:* all golden tests pass; the sample programs produce correct `stdout` and heaps;
a syntax error yields `trace.error`, never a throw.

**Phase 2 — Local server + thin CLI.** `engine/server` (loopback, `/health`, `/trace`,
token, origin allowlist) + `leettrace run <file> --input` that calls it and prints the
`Trace`. Server security tests.
*Done when:* `leettrace run` prints a correct trace; a request without the token is 401; a
disallowed origin is rejected.

**Phase 3 — Shared viz library.** `packages/viz`: stack/heap panels, arrows, narration,
controls — built against recorded sample traces in a harness.
*Done when:* the linked-list-reverse arrow acceptance passes by eye; scrubbing + step-back
are exact in the harness.

**Phase 4 — Local web UI + watch mode.** `apps/web` served by the engine using
`packages/viz`; `leettrace run` opens it; `leettrace watch` live-updates it over `WS /watch`.
*Done when:* editing and saving a file updates the open visualization within ~1s.

**Phase 5 — LeetCode adapter.** `engine/leetcode`: parse signatures + example inputs
(incl. `ListNode`/`TreeNode` encodings), synthesize the `Solution()` harness, filter harness
frames, compare to expected → `TestResult`, one `Trace` per case.
*Done when:* two-sum and a tree problem trace correctly from `{code, cases}` input and report
pass/fail; the viz shows only the user's frames.

**Phase 6 — Browser extension.** MV3 content script on `leetcode.com/problems/*`: read
Monaco code + language + slug, scrape example cases (isolated, guarded), handshake with the
daemon, `POST /leetcode/trace`, inject the `packages/viz` side panel + a Trace button.
Daemon-missing UX.
*Done when:* on a real LeetCode problem page, with the daemon running, clicking Trace shows
the live stack/heap/arrows for your current code against an example case; with the daemon
off, a clear start-the-app prompt appears.

**Phase 7 — Terminal TUI (optional/stretch).** `--tui` Textual view: line, stack, locals,
compact heap, ←/→ stepping.
*Done when:* `leettrace run file.py --tui` steps through a recursion in the terminal.

**Phase 8 — Narration + samples + onboarding.** Tier-1 rule-based notes; a few bundled
practice problems for the web UI; first-run onboarding for both clients.

**Phase 9 — Packaging & distribution + security hardening.** `pipx install leettrace`;
`leettrace start`; PyInstaller standalone binary; extension production build for the Chrome
Web Store (+ Firefox). Token/origin/subprocess hardening pass. One-command install path:
install extension → prompted to install engine → `leettrace start` → extension lights up.
*Done when:* a clean machine can go from zero to a working trace on LeetCode following only
the README.

**Phase 10 — Polish, a11y, docs, launch.** Both themes, keyboard/ARIA, error/empty states,
Lighthouse ≥90 on the web UI. README with architecture diagram + the trace-contract story,
demo GIFs (linked-list reverse, recursive fib tree, LeetCode overlay in action), Chrome Web
Store listing, LinkedIn post.
*Done when:* repo public, extension listed (or unlisted-shareable while in review), engine
installable, clips ready.

**Post-v1:** JavaScript tracer (CDP) as a new schema producer; LLM narration tier; then the
hard roadmap (C++ via gdb/lldb, Java via JDWP).

---

## 10. Risks & mitigations
| Risk | Mitigation |
|---|---|
| LeetCode DOM scraping breaks on site changes | Isolate in one adapter module; version guard; visible fallback; let the user paste a test case manually. |
| C++/Java expectation | v1 is Python; roadmap is explicit and labeled hard. Don't overpromise in the UI. |
| Localhost security | Loopback-only + session token + origin allowlist + subprocess caps (§8). |
| Chrome Web Store review latency/rejection | Start the listing early; ship dev/unpacked + a signed zip for sideload meanwhile. |
| "Download and run a daemon" friction | `pipx` one-liner + standalone binary; extension detects and guides. |
| Trace snapshots large | Reachability-only heap; caps; trimmed strings. |
| Building the viz twice | One `packages/viz`, consumed by web UI and extension. |
| Scope creep | Phases are gates; Phase 7+ is optional/polish; multi-language is post-v1. |

## 11. Anti-goals (v1)
No accounts, no cloud backend, no hosted execution (it runs on the user's machine), no
multi-language, no hand-written interpreter, no scraping of LeetCode behind auth / premium
content, no auto-submitting answers, no collaboration features.

## 12. Non-negotiables (also in CLAUDE.md)
- Everything downstream of the engine reads **only** the Trace Schema. No language branching
  in viz/UI/extension.
- Tracer/adapter changes update golden tests; snapshot diffs are reviewed, not blind-updated.
- TypeScript strict (no `any` in `schema`/`viz`/store); Python typed + Pydantic-validated at
  the engine boundary.
- The viz is a pure function of the current step.
- The server binds loopback only and requires the session token; the extension's origin
  allowlist is never widened for convenience.
- Pyodide is **not** used — this is a native local engine. (That was the old web project.)
- Accessibility and both themes are acceptance criteria.

## 13. Definition of done (v1)
On a clean machine, a user installs the engine (one command) and the extension, runs
`leettrace start`, opens a LeetCode problem, writes Python, and sees — in the LeetCode tab
**and** optionally in their terminal — their solution execute against the real example
cases: live call stack, heap with pointer arrows for linked lists/trees, variable state, a
reason per step, and per-case pass/fail. Backed by a documented trace contract, a
golden-test suite, and a locked-down localhost bridge.

## 14. Resume / interview talking points
- Shipped a **multi-surface developer tool** (local engine + CLI + MV3 extension) unified by
  a single trace contract that doubles as the localhost wire protocol.
- Instrumented a **real CPython runtime** (`sys.settrace`) to reconstruct the live object
  graph with stable identity across time; rendered it as an animated pointer graph.
- Designed and secured a **loopback code-execution bridge** (session token + origin
  allowlist + subprocess sandboxing) between a browser extension and a local daemon.
- Built a **LeetCode harness** that parses problem signatures and `ListNode`/`TreeNode`
  encodings and runs user solutions against real example cases.
- Packaged and distributed it (pipx + standalone binary + Chrome Web Store).
