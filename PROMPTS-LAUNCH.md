# Claude Code kickoff prompts — Launch & Distribution (Phases 11–15)

Paste in order. Assumes the repo has the built v1 plus `SPEC-LAUNCH.md` and the updated
`CLAUDE.md` (append the two new non-negotiables from SPEC-LAUNCH §11). Don't advance until the
phase's "Done when" (SPEC-LAUNCH §9) passes. Keep the four original CLAUDE.md rules intact:
UI reads only the trace format; tracer changes update golden tests; server stays loopback + token
and the allowlist is never widened; no Pyodide.

First, once: **append** the two new non-negotiables from SPEC-LAUNCH §11 to CLAUDE.md, and add
`apps/site` to the workspace list. Don't rewrite the existing rules.

---

### Phase 11 — Real-world extension hardening
```
Read SPEC-LAUNCH.md. Execute Phase 11 only (Track A1 + the A3 link fix).
Harden the LeetCode extension for the real site: read the Monaco editor model robustly and
handle leetcode.com SPA navigation (problem-to-problem with no full reload) so the Trace button
and side panel reliably re-attach — use a MutationObserver and history/navigation hooks. Keep
ALL DOM reading inside the single guarded adapter module (CLAUDE.md rule) and add a visible
"couldn't read the page — paste a test case" fallback. Add tests against a saved real-problem
DOM fixture covering: button attaches, survives simulated SPA navigation, trace runs, and the
two previously-fixed issues (local-network permission prompt, button-missing-after-navigation)
stay fixed. Make the extension's "install guide" link a configurable base URL pointing at the
site's install page.
Done when those tests pass. Note in the PR that live leetcode.com confirmation is an owner step.
```

### Phase 12 — Cross-platform + friendly launch
```
Execute Phase 12 only (Track A2 + A4).
1. Windows: implement a working resource cap (Job Objects) for the tracer subprocess, or if
   that's out of scope, degrade gracefully — enforce step/time/depth caps and clearly document
   the memory-cap gap on Windows. No silent "no limit".
2. Cross-OS: a smoke test (start engine -> /health -> trace one program -> shutdown) that runs
   in CI on macOS, Windows, and Linux runners.
3. Friendly launch: double-clicking the binary (or `leettrace` with no subcommand) starts the
   engine and opens the local welcome page showing status, a copyable pairing code, and a link
   to the extension install step. Handle "already running" cleanly.
Done when CI builds + smoke-tests binaries on all three OSes and the friendly-launch flow reaches
a copyable pairing code without terminal steps.
```

### Phase 13 — Release pipeline
```
Execute Phase 13 only (Track B1).
Add .github/workflows/release.yml: on a tag matching v*, build standalone binaries for macOS
(arm64 + x64), Windows (x64), and Linux (x64); build the Chrome zip and the Firefox zip;
generate SHA256SUMS; publish a GitHub Release for the tag with all assets and auto notes.
Include signing steps for macOS notarization and Windows signing but leave them commented/stubbed
reading secrets that are absent, so the unsigned workflow runs green. Also ensure ci.yml runs
lint + the full test suite on PRs.
Done when a v* tag (test via a dry run / act or a documented manual run) yields a Release with all
downloadable assets and checksums, and ci.yml is green.
```

### Phase 14 — Landing site
```
Execute Phase 14 only (Track B2; design per SPEC-LAUNCH §6–§8).
Create apps/site: a high-quality static marketing + install site in LeetTrace's identity (ink +
amber, IBM Plex Mono for code), matching the structure and quality in §6 but NOT Cluely's
purple/pink. Build the sections in §6 with the copy in §8 verbatim (hero, 3-step how-it-works,
payoff demo using the existing demo GIFs, feature bento, local/privacy, full per-OS install +
extension + pairing instructions, FAQ accordion, closing CTA, footer with the "not affiliated
with LeetCode" line). Primary CTA = OS-detected Download that resolves the latest GitHub Release
asset via the API with a build-time hardcoded fallback, showing version/size/SHA; secondary CTA =
Add to Chrome (Web Store URL when a config value is set, else the on-page unpacked instructions).
Static only: no backend, no telemetry. Both themes, responsive to 380px, AA contrast, keyboard +
screen-reader support, Lighthouse >=95 perf/a11y. Add Vercel deploy config.
Done when the site is deployed to a *.vercel.app URL, the Download button serves the correct OS
asset, and all instructions + FAQ are present and accurate.
```

### Phase 15 — End-to-end dress rehearsal + launch kit
```
Execute Phase 15 only.
Write LAUNCH_CHECKLIST.md with the exact owner steps in order (create public repo + enable
Actions; push a v1.0.0 tag to cut the release; import the repo on Vercel; optional: domain,
Chrome Web Store $5 + upload the store zip + swap the Add-to-Chrome config to the store URL;
optional: signing secrets). Add a "known gaps" note (unsigned binaries + bypass; Python-only;
Windows memory-cap status). Finalize README links to the site and releases.
Then STOP and hand me a numbered dress-rehearsal script to run myself on a clean machine:
visit the site -> download -> run -> add extension -> pair -> trace a real leetcode.com problem,
with the exact thing to check at each step and where to report what breaks.
Done when the checklist reproduces a release and the rehearsal script is ready for me to run.
```

---

### Owner actions (you, not Claude Code) — after Phase 15
1. `git push` the repo public; enable GitHub Actions.
2. `git tag v1.0.0 && git push --tags` → CI builds the Release.
3. Import the repo on Vercel → site goes live.
4. Run the dress-rehearsal script. Report anything that breaks for a quick fix round.
5. *(Optional)* Buy a domain; Chrome Web Store ($5) + upload; signing certs.
