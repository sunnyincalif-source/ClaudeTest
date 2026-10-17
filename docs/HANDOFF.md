# Handoff: where things stand

This is the state at the end of the first build session (all ten phases in `SPEC.md` §9).
Pick up from here.

## Done, with tests green

| Phase                    | Result                                                                                   | Evidence                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 0 Scaffold               | pnpm + Turborepo monorepo, both toolchains, CI workflow                                  | `pnpm build/lint/test`                                   |
| 1 Tracer                 | Schema (TS and Pydantic), sandboxed `sys.settrace` tracer, caps, golden traces           | `packages/engine/tests/test_tracer.py`                   |
| 2 Server + CLI           | Loopback server, token, origin allowlist, Host check, pairing, `leettrace run`           | `tests/test_server.py`                                   |
| 3 Viz                    | Stack, heap, and arrows with a stable layout, plus a harness                             | `packages/viz/src/viz.test.tsx`, `docs/images/viz-*.png` |
| 4 Web + watch            | Engine-served UI, live WS updates in about 200 ms                                        | `apps/web/e2e/watch.e2e.mjs`                             |
| 5 LeetCode adapter       | Case parsing, ListNode/TreeNode, Solution harness, pass/fail                             | `tests/test_leetcode.py`                                 |
| 6 Extension              | Trace button, side panel, pairing, daemon-off UX, Firefox build                          | `apps/extension/e2e/extension.e2e.mjs`                   |
| 7 TUI                    | `--tui` stepping through recursion                                                       | `tests/test_tui.py`, `docs/images/tui.svg`               |
| 8 Narration + onboarding | Notes checked against the next state, `leettrace demo`, welcome pages                    | `tests/test_narration.py`                                |
| 9 Packaging              | Wheel with the bundled UI (clean venv), PyInstaller binary, store zips, release workflow | `docs/RELEASING.md`                                      |
| 10 Polish + docs         | axe-core clean, 380 px layout, Lighthouse 91/99/100, README, GIFs, store copy, post      | `apps/web/e2e/audit.e2e.mjs`, `docs/`                    |

## Not done: needs you or the real world

- **A real leetcode.com run.** This build environment can't reach leetcode.com, so the
  extension was verified against a mock problem page served at the real URL. The mock lives
  in `apps/extension/e2e/mock-problem.html` and has the same DOM hooks and a fake Monaco.
  Load the unpacked extension and try a real problem. If LeetCode's markup differs, the only
  file to adjust is `apps/extension/src/content/leetcodePage.ts`, and the panel already falls
  back to "paste a test case".
- **Chrome Local Network Access.** Chrome asks the user before leetcode.com may reach
  127.0.0.1. The panel waits for that prompt and explains a denial. Confirm the wording on
  current Chrome.
- **Publishing.** Nothing has been published yet: not on PyPI, the Chrome Web Store, or
  Firefox Add-ons, and there is no public repo. `docs/RELEASING.md` has the steps. Store copy
  is in `docs/store-listing.md`.
- **Install link.** `INSTALL_URL` in `apps/extension/src/content/Panel.tsx` is a placeholder
  (`github.com/leettrace/leettrace`). Point it at the real repo.
- **Deliberate decision to review.** Extension requests come from the content script, so they
  carry `Origin: https://leetcode.com` and the allowlist is not widened. The tradeoff is the
  Chrome LNA prompt. The alternative, fetching from the background worker, would need the
  extension origin on the allowlist. CLAUDE.md forbids widening it, so ask before changing
  this.

## How to resume

```bash
pnpm install && (cd packages/engine && uv sync)
pnpm build && pnpm test && pnpm lint
cd packages/engine && uv run leettrace demo     # see it work
```
