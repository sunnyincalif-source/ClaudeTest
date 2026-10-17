# Claude Code kickoff prompts — one per phase (LeetTrace)

Paste in order. Each assumes `SPEC.md` + `CLAUDE.md` are in the repo. Don't advance until
the current phase's "Done when" (SPEC §9) passes. Review each PR yourself — you're the
senior engineer, and the shortcuts to catch are skipped tests, widened security, and
language branching leaking into the UI.

---

### Phase 0 — Monorepo scaffold
```
Read SPEC.md and CLAUDE.md. Execute Phase 0 only.
Set up a pnpm + Turborepo monorepo with: packages/schema (TypeScript), packages/engine
(Python, managed with uv + hatch), packages/viz (React component library), apps/web (Vite
+ React + TS strict), apps/extension (MV3 via CRXJS + React). Add lint/format/test for both
toolchains (ESLint+Prettier+Vitest for TS, ruff+pytest for Python) and a CI workflow that
runs them. Everything as empty, building stubs.
Done when every workspace builds, lints, and runs an empty test suite, and CI is green.
Open a PR.
```

### Phase 1 — Schema + Python tracer (headless, tested)
```
Execute Phase 1 only (SPEC §3, §4, §9).
1. packages/schema: implement the Trace Schema in TypeScript exactly as SPEC §3.
2. packages/engine: mirror it as Pydantic models. Implement the native sys.settrace tracer
   (SPEC §4.1, §4.4): value serialization, heap reachability BFS with stable ids, subprocess
   + step/time/memory caps, exception capture into trace.error (never throw).
3. Golden-trace tests (SPEC §4.7) for all sample programs incl. the exception case.
No server, no UI yet. Done when all golden tests pass and a syntax error yields trace.error.
```

### Phase 2 — Local server + thin CLI
```
Execute Phase 2 only (SPEC §4.6, §5.1, §8).
engine/server: a loopback-only (127.0.0.1) HTTP server with GET /health and POST /trace,
a random session token written to ~/.leettrace/session.json (0600), bearer-token auth on
every request, and an origin allowlist (https://leetcode.com + local UI origin). Add the
`leettrace run <file.py> --input "..."` CLI that calls the server and prints the Trace.
Write security tests: missing token -> 401, disallowed origin -> rejected, runaway program
-> truncated. Done when run prints a correct trace and the security tests pass.
```

### Phase 3 — Shared viz library
```
Execute Phase 3 only (SPEC §6).
packages/viz: StackPanel, HeapPanel (deterministic layout), ArrowLayer (measure DOM rects ->
animated SVG bezier pointers; stable ids keep nodes still while arrows rewire; cycles loop),
NarrationBar, Controls (play/pause/step/back/speed + scrubber, keyboard, prefers-reduced-
motion), TestResultBadge. Build against recorded sample traces in a Storybook/harness.
Acceptance: 4-node linked-list reverse flips arrows one at a time with nodes staying put;
a binary tree renders readably; scrubbing + step-back are exact. Show me both.
```

### Phase 4 — Local web UI + watch mode
```
Execute Phase 4 only (SPEC §5.2, §5.1 watch).
apps/web: a single-page visualizer built from packages/viz, served by the engine at the
local URL. Wire `leettrace run` to open it focused on the run, and `leettrace watch <file>`
to re-trace on save and push updates over WS /watch.
Done when saving the watched file updates the open visualization within ~1s.
```

### Phase 5 — LeetCode adapter
```
Execute Phase 5 only (SPEC §4.5).
engine/leetcode: given {code, functionName, cases:[{input, expected?}]}, parse LeetCode
example inputs (including ListNode/TreeNode encodings like [1,2,3,null,4]) into real args,
synthesize a Solution() harness, trace ONLY the user's frames (filter harness frames),
compare to expected -> TestResult, emit one Trace per case. Add POST /leetcode/trace.
Done when two-sum and a tree problem trace correctly and report pass/fail, and the viz shows
only the user's frames.
```

### Phase 6 — Browser extension
```
Execute Phase 6 only (SPEC §5.3, §8 handshake).
apps/extension (MV3): content script on https://leetcode.com/problems/*. Read the Monaco
code, language, problem slug, and scrape example test cases (isolate DOM-reading in one
guarded adapter module with a visible fallback). Handshake with the daemon for port+token,
call POST /leetcode/trace, and inject a collapsible side panel rendering packages/viz plus a
Trace button near Run. If the daemon is off, show a clear "run `leettrace start`" panel.
Done when, on a real problem page with the daemon running, Trace shows live stack/heap/arrows
for the current code against an example case, and the daemon-off prompt appears otherwise.
```

### Phase 7 — Terminal TUI (optional / stretch)
```
Execute Phase 7 only (SPEC §5.1 TUI).
Add `leettrace run <file> --tui`: a Textual terminal UI showing current line, call stack,
locals, a compact heap view, and left/right stepping. Reuse the engine; do not reimplement
tracing. Done when stepping through a recursion works in the terminal.
```

### Phase 8 — Narration + samples + onboarding
```
Execute Phase 8 only (SPEC §7).
Tier-1 rule-based notes per step derived from the AST node + event, attached to Step.note in
the engine and shown in NarrationBar. Bundle a few practice problems for the web UI and add
first-run onboarding for CLI + extension. Do NOT add the LLM tier.
Done when recursion and a loop produce correct per-step sentences that never contradict the
visual.
```

### Phase 9 — Packaging & distribution + security hardening
```
Execute Phase 9 only (SPEC §9 Phase 9, §8).
Make the engine `pipx install leettrace`-able with a `leettrace start` entrypoint; add a
PyInstaller standalone binary build. Produce a Chrome Web Store production build of the
extension (+ a Firefox build). Do a security hardening pass: token file perms, origin
allowlist, subprocess caps, no 0.0.0.0 binding anywhere. Write the zero-to-trace install
path in the README.
Done when a clean machine can follow the README from zero to a working LeetCode trace.
```

### Phase 10 — Polish, a11y, docs, launch
```
Execute Phase 10 only.
Both themes, keyboard + ARIA across controls, error/empty states, Lighthouse >=90 on the web
UI, 380px layout. Write README.md with the architecture diagram (trace contract front and
center), export 3 demo GIFs (linked-list reverse, recursive fib tree, LeetCode overlay live),
finalize the Chrome Web Store listing, draft a LinkedIn post.
Done when the repo is public, the extension is listed (or shareable while in review), the
engine is installable, and the clips are ready.
```

---

### Post-v1 (after v1 ships)
- JavaScript tracer via Node's inspector protocol (CDP) — a new producer of the same schema.
- LLM narration tier (cached by source hash, behind the rule-based fallback).
- Hard roadmap: C++ (gdb/lldb MI) and Java (JDWP/JDI) tracers. Each is a project-sized effort.
