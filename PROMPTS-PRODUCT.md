# Claude Code kickoff prompts — New UI + Product-Grade UX (Phases 16–21)

Paste in order. Assumes the v1.0.0 repo plus `SPEC-PRODUCT.md` (v1.3). Don't advance until each
phase's "Done when" passes. The four core CLAUDE.md rules + the two from SPEC-LAUNCH §11 still
hold: UI reads only the trace format; tracer changes update golden tests; server stays loopback +
token and the allowlist is never widened; no Pyodide; site stays static and private; site copy
stays in sync with the real flow.

Design locked: modern dev-tool dark (Linear × Vercel), electric-blue + cyan accent ONLY —
strictly dev colors, NO purple/violet/magenta — Geist + mono. Chrome Web Store = yes. Unsigned for now (document the bypass). Free leettrace.vercel.app.

---

### Phase 16 — Design system + trace-panel restyle
```
Read SPEC-PRODUCT.md. Execute Phase 16 only (§2, §4).
FIRST open docs/ui-reference.html — the approved, signed-off mockup. It is the source of truth
for palette, type, spacing, component styling, the hero, and the trace panel. Match it.
Create ONE shared design system consumed by both packages/viz and apps/site — a packages/design
module exporting CSS custom properties + a TS token map (and/or a shared Tailwind preset). Use
the §2 tokens: near-black canvas, hairline borders, electric blue (#4d9fff) + cyan (#22d3ee) as
the ONLY accents (blue->cyan gradient, subtle glow) — strictly dev colors, NO purple/violet/
magenta — green (#2dd4a0) for pass and red (#f4515b) for fail, Geist Sans (self-hosted via
fontsource) for display/body and IBM Plex Mono for code/data. No surface may hardcode a hex
outside this system.
Then restyle packages/viz (call stack, heap, pointer arrows, narration, controls, test badges,
side-panel chrome) to this identity: hairline cards, the CURRENT moving pointer uses the accent,
subtle spring (120-220ms) on step transitions and arrow rewiring, accent glow on the "engine
connected" state. Keep the panel a pure function of the current step, reading ONLY the trace
format (no language branching), and keep BOTH light and dark panel themes. Update the
Storybook/harness to show the restyle against recorded sample traces.
Done when the linked-list-reverse sample renders in the new identity in both panel themes, all
existing viz tests pass, and the harness shows it.
```

### Phase 17 — Real installers + always-on engine (remove the terminal)
```
Execute Phase 17 only (§5).
- macOS: .dmg drag-to-/Applications, proper .app; first open registers a Login Item and starts
  the engine. Windows: NSIS or MSI installer (Program Files + Start-menu + run-on-login);
  launching starts the engine. Linux: AppImage (and/or .deb) with autostart .desktop entry.
- Tray / menu-bar item (styled to the new identity where the OS allows): status, Open LeetTrace,
  Add the extension, Stop/Quit; single-instance guard; clean shutdown. First-install-only welcome
  window with a prominent "Add the LeetTrace extension" button.
- Keep the CLI for power users; no normal-user step requires a terminal. Wire installers into the
  release workflow per OS.
Done when, on each OS, the installer installs the app and opening it (or rebooting) leaves the
engine running with a tray item, zero terminal use. Live per-OS confirmation is an owner step.
```

### Phase 18 — Automatic pairing (remove the 6-digit code)
```
Execute Phase 18 only (§6). Security stays identical — the token still gates every request; only
delivery becomes automatic.
- Pin a `key` in the extension manifest so the extension ID is stable and matches the future Web
  Store ID.
- Add externally_connectable for http://127.0.0.1:*/* and http://localhost:*/*. Have the
  engine-served welcome/status page (holds the token server-side) call
  chrome.runtime.sendMessage(EXTENSION_ID, {type:'leettrace-pair', token, port}); the extension
  service worker stores it in chrome.storage. No code shown or typed.
- Persist the engine token across restarts (~/.leettrace/); extension auto-reconnects with
  retry/backoff; an open LeetCode tab reconnects after an app restart with NO re-pairing; a
  rotated token re-handshakes silently.
- Keep a one-click "Connect" fallback and a hidden manual-code last resort; the happy path shows
  neither.
- Fix the Chrome local-network block message to name the current setting ("Apps on device"),
  detect the blocked state reliably, show an inline toggle guide, and avoid triggering the prompt
  where possible.
Add a handshake unit test and extend the saved-DOM fixture e2e: auto-connect with no code,
survival across app + browser restart, corrected blocked-permission UX. Done when those pass.
```

### Phase 19 — Chrome Web Store listing + landing site in the new design
```
Execute Phase 19 only (§7, §8, §9).
- Finalize store-ready extension builds: pinned-key manifest, icon set in the new identity,
  screenshots from the restyled panel, short+long descriptions from docs/store-listing.md.
- Add a static /privacy page to apps/site (no data collection, loopback-only, token, not
  affiliated with LeetCode) as the Web Store privacy-policy URL.
- Make the "Add to Chrome" button on the site AND the app welcome page read a single STORE_URL
  env var: set -> Web Store link; empty -> unpacked instructions. No code change to flip.
- Build/rewrite apps/site using the shared design system from Phase 16 — DARK-ONLY, Linear ×
  Vercel grade. Sections per SPEC §8 with copy per SPEC §9 verbatim: aurora hero with the
  restyled panel in a window frame, 3-step how-it-works, payoff trace clip, feature bento
  (hairline cards, one accent per card), local/privacy, install + automatic-connect instructions,
  FAQ, closing CTA, footer with "not affiliated with LeetCode." Remove ALL pairing-code and
  terminal language. OS-detected Download resolves the latest GitHub Release (API + build-time
  fallback) showing version/size/SHA.
- Static only, no telemetry; responsive to 380px; AA contrast on dark; keyboard + screen-reader
  support; Lighthouse >=95 perf/a11y. Prep the Firefox AMO zip (secondary).
Done when the submittable store package + /privacy exist, the STORE_URL switch works, and the
site is deployed to leettrace.vercel.app in the new identity with no-code/no-terminal copy and a
working OS-detected download. Paying $5, submitting, and setting STORE_URL after approval are
owner steps.
```

### Phase 20 — Unsigned polish + signing drop-in (deferred activation)
```
Execute Phase 20 only (§10). We ship unsigned.
- Make the one-time first-launch bypass unmissable: one line + one screenshot per OS in the site
  install section and FAQ, AND in the installer itself (DMG background text "First time:
  right-click -> Open"; a Windows installer readme panel for "More info -> Run anyway"). One
  sentence each, not buried. Style to the new identity.
- In CI, keep macOS notarization + Windows signing steps stubbed on absent secrets; document in
  RELEASING.md exactly which secrets enable them later. No behavior change now.
Done when the unsigned path has a clear one-time click-through everywhere a user meets it, and
enabling signing later is a documented secrets-only change.
```

### Phase 21 — v1.1.0 release + product dress rehearsal
```
Execute Phase 21 only (§11).
- Fix all stale README links (sunnyincalif-source/leettrace -> sunny925bay-jpg/leettrace).
- Update LAUNCH_CHECKLIST.md for the new flow.
- Prepare the v1.1.0 release (new UI + installers + auto-pair + corrected messages) through the
  tag -> CI release pipeline; confirm it attaches all per-OS installers + store zips + checksums.
Then STOP and hand me a numbered dress-rehearsal script to run on a clean machine using ONLY the
live leettrace.vercel.app site: download -> install -> click past the one first-launch warning ->
add the extension -> open a real leetcode.com problem -> confirm the Trace button auto-appears and
traces in the new UI -> test a wrong answer -> next problem (SPA nav) -> restart the app (confirm
NO re-pairing). For each step say exactly what to check and where to report what breaks.
Done when the checklist reproduces a v1.1.0 release and the rehearsal script is ready for me.
```

---

### Owner actions (you, not Claude Code)
After Phase 19: pay the Chrome Web Store $5, upload the store zip, submit; once approved, set
STORE_URL and redeploy (instant).
After Phase 21:
1. Confirm the Vercel site is live at leettrace.vercel.app (import the repo on Vercel if not);
   check the Download button shows the latest version.
2. `git tag v1.1.0 && git push --tags` -> CI builds installers + publishes the Release.
3. Run the dress-rehearsal script on a clean machine -> report breakage -> one fix round -> live
   for anyone with the link.
Later, to remove the scary warnings: buy Apple ($99/yr) + a Windows cert, add the secrets named
in RELEASING.md, re-release. No code changes.
```
