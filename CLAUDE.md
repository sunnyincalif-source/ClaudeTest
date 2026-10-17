# CLAUDE.md — LeetTrace

You are the implementer on **LeetTrace**, a downloadable developer tool that visualizes how
a LeetCode solution executes — in the **terminal** and in the **LeetCode browser tab** —
with a live call stack, heap/memory, pointer arrows, variable state, and a reason per step,
run against the problem's real example cases.
**`SPEC.md` at the repo root is the source of truth. Read it before writing code.**

## Shape (SPEC §1)
Three components, one contract:
- **Trace Engine** (`packages/engine`, Python): `sys.settrace` tracer + loopback server +
  LeetCode adapter. Ships the `leettrace` CLI.
- **Clients:** the `leettrace` terminal CLI (`run`/`watch`/`--tui`), a local web UI
  (`apps/web`) served by the engine, and a browser extension (`apps/extension`) that overlays
  LeetCode.
- **Contract:** the **Trace Schema** (`packages/schema`) — the engine's output, the localhost
  wire format, and the only thing the viz reads.

## How we work
- One phase at a time (SPEC §9). Don't start a phase until the prior phase's "Done when"
  passes. One PR per phase, conventional commits, tests green before merge.
- Ambiguous? Check `SPEC.md` first. Genuinely unspecified? Ask — don't invent scope.

## Non-negotiables (SPEC §12)
- Everything downstream of the engine reads **only** the Trace Schema. **No language-specific
  branching** in `packages/viz`, `apps/web`, or `apps/extension`. If you're about to write
  `if (language === 'python')` there, push it into the engine.
- Tracer/adapter changes update **golden-trace tests**; review snapshot diffs, never blind
  `-u`.
- TypeScript strict; no `any` in `schema`/`viz`/store. Python is typed and **Pydantic-
  validated at the engine boundary** against the same schema.
- The viz is a **pure function of the current step**. No imperative animation state that can
  desync from `stepIndex`.
- The server **binds `127.0.0.1` only** and **requires the session token** on every request;
  origin allowlist is `https://leetcode.com` + the local UI origin and is never widened for
  convenience (SPEC §8).
- This is a **native local engine. Do NOT use Pyodide/WASM** — that was a different, earlier
  project.
- Accessibility and light/dark are acceptance criteria.

## Anti-goals (v1, SPEC §11)
No accounts, no cloud backend, no hosted execution, no multi-language, no hand-written
interpreter, no scraping premium/auth-gated LeetCode content, no auto-submitting answers,
no collaboration features.

## Language scope
v1 is **Python only**. JavaScript is post-v1 (Node CDP). C++/Java are hard roadmap (real
debugger integration) — never a v1 line item. Don't let the UI imply languages the engine
can't trace.

## Commands (per workspace; exact scripts set in Phase 0)
- Repo: `pnpm build` · `pnpm test` · `pnpm lint` (Turborepo fan-out)
- Engine: `uv run pytest` · `uv run leettrace ...`
- Extension/web: `pnpm --filter @leettrace/extension build` · `... dev`

## Definition of done per phase
Each phase in SPEC §9 lists its "Done when." That's the gate: demo it, prove tests green,
open the PR.
