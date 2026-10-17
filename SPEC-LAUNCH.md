# LeetTrace — Launch & Distribution Spec (v1.1, addendum to SPEC.md)

> The core app (SPEC.md Phases 0–10) is built and tested. This addendum takes it from
> "runs on my machine" to **"anyone visits a website, downloads it, and is tracing on real
> leetcode.com within ~10 minutes, following on-page instructions."** It adds Phases 11–15.
>
> The four non-negotiables in `CLAUDE.md` still bind, unchanged. Two more are added in §11.

**Owner:** you (engineering lead) · **Implementer:** Claude Code
**Goal in one line:** a high-quality landing page whose primary action is a download, plus
the last-mile hardening and release pipeline that make the download actually usable.

---

## 1. The distribution reality (design around these, don't fight them)

There are two delivery paths. v1.1 **ships the "works now" path** and **documents the
"public polished" path** so the owner can upgrade later without a rebuild.

| Piece | Works-now path (v1.1 ships this) | Public-polished path (documented, owner-gated) |
|---|---|---|
| Desktop app | Standalone binary (PyInstaller) per OS, **unsigned**, with on-page Gatekeeper/SmartScreen bypass instructions | Code-signed + notarized (Apple Developer ID $99/yr; Windows OV/EV cert) |
| Browser extension | **Load Unpacked** zip + step-by-step (Developer Mode) | **Chrome Web Store** / Firefox AMO listing (Google dev acct $5, review) |
| Binary hosting | **GitHub Releases** (free, versioned, direct URLs), published by CI | same |
| Site hosting | **Vercel** on a `*.vercel.app` URL | custom domain the owner buys |
| Code privacy | loopback-only engine + session token (already built) — nothing leaves the machine | same |

**Key truth:** the extension and the desktop app are **two artifacts installed two ways**.
The site's primary CTA downloads the **app**; a second, clearly-sequenced step **adds the
extension**. The instructions must make that sequence obvious, or users stall.

---

## 2. What only the owner can do (external accounts — minimal, explicit)

Claude Code prepares everything so each of these is a copy-paste or ≤5-minute step. **None
of them block using the tool yourself via the works-now path.**

1. **Create a public GitHub repo** and push the monorepo; enable **GitHub Actions**.
2. **Cut a release:** push a version tag (`v1.0.0`) — CI builds and publishes the Release.
3. **Deploy the site:** import the repo on Vercel (framework preset auto-detected). Optional:
   buy a domain and point it at Vercel.
4. *(Optional, public path)* **Chrome Web Store:** pay the one-time $5, upload the store zip
   CI produced, submit for review. Swap the site's "Add to Chrome" link from unpacked-instructions
   to the store URL (one config value).
5. *(Optional, public path)* **Signing:** enroll in Apple Developer / obtain a Windows cert;
   add the secrets to CI (the workflow has the signing steps stubbed and commented).

A `LAUNCH_CHECKLIST.md` at the repo root (Phase 15) lists these in order with exact commands.

---

## 3. Architecture additions
- **`apps/site`** — a new workspace: a static marketing + install site (Vite + React or
  Astro; Astro preferred for a content/marketing site, but match the repo's existing React
  tooling if that lowers friction). Deploys to Vercel. **No backend, no telemetry.** It reads
  **only** public GitHub Release metadata to resolve download URLs.
- **GitHub Releases** — the binary/extension host. The site links to release assets, resolved
  at runtime from the GitHub Releases API (`/releases/latest`) with a **hardcoded fallback**
  baked at build time (so the page still works if the API is rate-limited).
- **CI release workflow** (`.github/workflows/release.yml`) — on a `v*` tag: build per-OS
  standalone binaries + extension zips (Chrome + Firefox) + SHA-256 checksums, and publish them
  as a GitHub Release.
- **First-run/pairing flow** (hardened in Track A): the downloaded binary, on launch, starts
  the engine and **opens a local welcome page** that shows the **pairing code** prominently;
  the extension's one-time pairing uses it. This is the hinge the whole UX turns on.

---

## 4. Track A — Last-mile product hardening (prerequisite for real use)

### A1 — Make the extension work on **real leetcode.com**
Current state: only tested against a mock page; two fixes (Chrome local-network permission
prompt; button missing after in-app navigation) are unverified on the live site.
- Harden the DOM/editor adapter for the **real site**: read the Monaco model via the page's
  own API where possible; handle LeetCode's **SPA navigation** (problem→problem without full
  reload) so the Trace button and panel re-attach reliably (MutationObserver / history hooks).
- Keep all DOM reading in the single guarded adapter module (CLAUDE.md rule); add a visible
  "couldn't read the page — paste a test case" fallback.
- Verify the two prior fixes on the live site. Record a short e2e against a saved copy of a
  real problem's DOM so regressions are caught without a live login.
- *Reality:* final confirmation on a logged-in leetcode.com is an **owner step** in Phase 15.

### A2 — Cross-platform support
- **Windows:** make the engine run correctly, including the resource caps. The memory cap
  currently doesn't apply on Windows — implement a Windows-appropriate cap (Job Objects) or,
  if infeasible in-scope, **degrade gracefully** (enforce step/time/depth caps, document the
  memory-cap gap) rather than silently having no limit.
- Build + smoke-test the binary on **macOS, Windows, Linux** in CI (matrix runners).
- A cross-OS smoke test: start engine → `/health` → trace one program → shutdown, on each OS.

### A3 — Friendly first-run & pairing
- Double-clicking the downloaded binary (or one command) **starts the engine and opens the
  local welcome page** showing: status, the **pairing code** (copyable), and a link to the
  extension install step. No terminal expertise required for the happy path.
- Fix the **placeholder "install guide" link** in the extension to point at the site's
  install page (configurable base URL).
- Pairing is one obvious action on both sides; a wrong/expired code gives a clear message.

### A4 — Launch ergonomics
- `leettrace` with no subcommand (or the binary double-clicked) = `start` + open welcome.
- Clear "already running" handling; `stop`/`status` discoverable from the welcome page.

---

## 5. Track B — Distribution

### B1 — CI release pipeline (`.github/workflows/release.yml`)
- Trigger: push of a tag matching `v*`.
- Jobs (matrix): build standalone binary for macOS (arm64 + x64), Windows (x64), Linux (x64);
  build Chrome zip and Firefox zip; generate `SHA256SUMS`.
- Publish a **GitHub Release** for the tag with all assets attached and auto-generated notes.
- Signing steps are present but **commented/stubbed**, reading secrets that are absent on the
  works-now path (so the workflow runs green unsigned, and the owner flips them on later).
- Also keep a **CI workflow** (`ci.yml`) running lint + the full 144-test suite on PRs.

### B2 — The landing site (`apps/site`)
A single high-quality marketing site with a download-first intent (details in §6–§7).
- **Primary CTA:** "Download LeetTrace" — OS-detected (navigator.userAgentData / UA sniff),
  big button, with the other OSes one click away. Resolves the real asset URL from the latest
  GitHub Release (API + build-time fallback). Shows version + size + SHA.
- **Secondary CTA:** "Add to Chrome" — links to the Web Store when the store-URL config is set,
  otherwise to the on-page **Load-Unpacked** instructions.
- **Get Started / Install** section or page: per-OS install steps, the Gatekeeper/SmartScreen
  bypass, the extension install (both paths), and the pairing walkthrough — each with the demo
  GIFs/screenshots already produced in Phase 10.
- **Troubleshooting/FAQ** accordion (content in §8).
- Static only. **No backend. No analytics/telemetry** unless the owner later opts in with a
  privacy-respecting, consented choice (out of scope for v1.1).
- Deploy config for Vercel; works on the `*.vercel.app` URL with zero owner setup beyond import.

### B3 — Signing & gatekeeper strategy (v1.1)
- Ship unsigned; the site's install steps include the **exact** bypass per OS (§8).
- Document the signing upgrade in `LAUNCH_CHECKLIST.md` and the stubbed CI steps.

---

## 6. Landing page — structure (Cluely quality tier, LeetTrace identity)

Keep LeetTrace's established identity (ink + amber dev-tool brand, IBM Plex pairing, the
bracket-magnifier mark). Match Cluely's **quality, density, and section rhythm**, not its
purple/pink palette. One tasteful warm gradient accent is allowed as a nod to the bento look;
avoid the AI-generic palettes called out in the design guidance.

Section order (top to bottom):
1. **Nav** — wordmark left; "Install" + "Add to Chrome" + GitHub link right; collapses to a
   menu on mobile.
2. **Hero** — big tight headline + one-sentence subhead; **primary Download (OS-detected)** +
   secondary "Add to Chrome"; a product visual in a **browser/mac window frame** showing the
   linked-list-reverse moment (reuse the real demo GIF, autoplay+loop, `prefers-reduced-motion`
   static fallback). Tiny "Python · runs locally · open source" trust line.
3. **How it works** — three steps (Install the app → Add the extension → Hit Trace), each with
   a small visual.
4. **The payoff** — the money shot: an embedded/looping trace of a real problem (stack + heap +
   pointer arrows) with a one-line caption. This is the "whoa."
5. **Feature bento** — call stack, live heap & pointer arrows, step-by-step "why", runs on the
   real test cases, terminal + browser, 100% local/private. Gradient-accent cards, floating UI
   screenshots.
6. **Runs locally / privacy** — short, confident: your code never leaves your machine;
   loopback-only + token. (This is a genuine differentiator — lean on it.)
7. **Get started / Install** — the detailed per-OS instructions + extension + pairing (can be a
   section here and/or a dedicated `/install` route; link to it from the hero too).
8. **FAQ** — accordion (§8 content).
9. **Closing CTA** — repeat the download.
10. **Footer** — Product (Download, How it works, GitHub), Help (Install guide, Troubleshooting,
    Privacy), a "not affiliated with LeetCode" line, version/status, social/GitHub.

Motion: hero visual autoplay/loop; cards reveal on scroll from a visible resting state (never
`opacity:0` stuck); reduced-motion respected. Fully responsive to ~380px; AA contrast; keyboard
+ screen-reader support. Lighthouse ≥95 perf/a11y.

---

## 7. Landing page — design tokens (starting point, refine in build)
- **Base:** cool off-white (`#f4f6f9`) light / near-black ink (`#0b0e13`) dark; both themes.
- **Ink/text:** `#101621` on light; `#e7ebf2` on dark; muted `#5a6475` / `#93a0b4`.
- **Accent:** LeetTrace amber `#e59a2e` (light) / `#f0b254` (dark); one warm gradient
  (amber→rose-gold) permitted for a hero/bento flourish — used once, not everywhere.
- **Semantic (reuse from the app so the site matches the product):** pointer blue `#3f8ddb`,
  prev-green `#22b07a`.
- **Type:** display = a characterful tight grotesque (not Inter/Space Grotesk — e.g. a
  condensed-ish bold like "Clash Display", "Hanken Grotesk", or "Geist"; pick one and commit);
  body = the same or a clean neutral; **code = IBM Plex Mono** to tie to the product.
- **Shape:** medium radius, restrained shadows, generous section spacing, one dense bento grid.

---

## 8. Site copy (use this — don't invent)

**Hero headline** (pick one, A/B later): "See your code actually run." ·
"Watch your solution execute — on the problems you're actually grinding." · "The debugger
LeetCode never gave you."
**Hero subhead:** "LeetTrace rides along with your LeetCode practice — in your browser and your
terminal — and shows the call stack, memory, and pointers step by step, on the real test
cases. Runs entirely on your machine."
**Trust line:** "Python · 100% local · open source"

**How it works (3 steps):**
1. **Install the app.** One download. It runs a small tracer locally — your code never leaves
   your machine.
2. **Add the browser extension.** A **Trace** button appears on every LeetCode problem.
3. **Hit Trace.** Watch your solution execute step by step against the real example cases —
   stack, memory, and pointers, live.

**Install — macOS:** Download → open the `.dmg`/app → the first time, **right-click the app →
Open** (macOS blocks unsigned apps by default; this is a one-time step), then **Allow**. Or in
Terminal: `xattr -dr com.apple.quarantine /Applications/LeetTrace.app`.
**Install — Windows:** Download the `.exe` → if SmartScreen appears, **More info → Run anyway**
(it's unsigned for now). → the app starts and opens a welcome page.
**Install — Linux:** Download → `chmod +x leettrace` → run it.
**Add the extension (now):** Download the extension zip from the app's welcome page → unzip →
`chrome://extensions` → turn on **Developer mode** → **Load unpacked** → select the folder.
**Add the extension (when published):** **Add to Chrome** from the Web Store.
**Pair them:** The app's welcome page shows a **pairing code**. Click the LeetTrace extension,
paste the code once — you'll see **"engine connected."**
**Use it:** Open any LeetCode problem, write Python, click **Trace** (next to Run).

**FAQ:**
- *Is my code sent anywhere?* No. The tracer runs on your machine; the browser talks to it only
  over `127.0.0.1`, locked to a session token and to leetcode.com. Nothing is uploaded.
- *"macOS can't verify the developer."* It's unsigned for now. Right-click the app → Open (one
  time), or run the `xattr` command above.
- *"Windows protected your PC."* SmartScreen on an unsigned app — More info → Run anyway.
- *The extension says the engine is off.* Start the LeetTrace app, then click the extension and
  pair with the code on its welcome page.
- *Which languages?* Python today. JavaScript is next; C++/Java are on the roadmap.
- *Is this affiliated with LeetCode?* No — it's an independent companion tool.

---

## 9. Phases (11–15)
Each is a gate: demo it, tests green, PR. **Owner verification steps are marked.**

**Phase 11 — Real-world extension hardening (Track A1, A3 link-fix).**
*Done when:* on a saved real-problem DOM fixture the extension attaches the Trace button,
survives simulated SPA navigation, and traces; the prior two fixes are covered by tests; the
install-guide link is configurable and correct. *(Owner verifies on live leetcode.com in P15.)*

**Phase 12 — Cross-platform + friendly launch (Track A2, A4).**
*Done when:* CI builds binaries for macOS/Windows/Linux and a smoke test passes on each;
Windows has a working or gracefully-degraded resource cap; double-click/one-command launch
starts the engine and opens the welcome page with a copyable pairing code.

**Phase 13 — Release pipeline (Track B1).**
*Done when:* pushing a `v*` tag produces a GitHub Release with per-OS binaries, both extension
zips, and `SHA256SUMS`; `ci.yml` runs the full test suite on PRs; signing steps are stubbed and
the unsigned workflow is green.

**Phase 14 — Landing site (Track B2).**
*Done when:* `apps/site` is deployed to Vercel; the OS-detected Download button resolves the
latest Release asset (API + fallback) and shows version/size/SHA; the Add-to-Chrome button and
full per-OS install + pairing instructions (with the demo GIFs) are present; FAQ complete;
Lighthouse ≥95 perf/a11y; responsive to 380px; both themes.

**Phase 15 — End-to-end dress rehearsal + launch kit.**
Write `LAUNCH_CHECKLIST.md` (§2). Then the **owner** runs the real test: on a clean machine,
visit the deployed site, download, run, pair, and trace a real leetcode.com problem using only
on-page instructions. Fix whatever the rehearsal surfaces. Finalize README links.
*Done when:* zero-to-trace on real LeetCode succeeds from the site alone, and the checklist
reproduces a release.

---

## 10. Risks & mitigations
| Risk | Mitigation |
|---|---|
| "Download and nothing happens" (Gatekeeper/SmartScreen) | On-page bypass steps per OS; friendly welcome page on launch; eventual signing documented. |
| Extension can't be one-click installed | Unpacked path documented now; Web Store path prepped; site links adapt via one config value. |
| Real leetcode.com differs from mock | Harden adapter + SPA handling; saved-DOM e2e; owner dress rehearsal in P15; fallbacks visible. |
| Claude Code can't test real browser/Windows | Everything testable is tested; P15 is explicit owner-in-the-loop verification. Budget one short fix round. |
| GitHub API rate limits break downloads | Build-time hardcoded fallback asset URLs. |
| Site implies official LeetCode tie | Explicit "not affiliated" line in footer + FAQ; no LeetCode branding/logo. |

## 11. Added non-negotiables (append these two to CLAUDE.md; keep the existing four)
- **The site is static and privacy-clean:** no backend, no telemetry/analytics without an
  explicit consented opt-in; it reads only public GitHub Release metadata. It never ships any
  flow that would require widening the engine's origin allowlist or disabling its session token.
- **Instructions must match the real flow:** the install/pairing steps on the site are kept in
  sync with the actual extension + engine behavior; a change to pairing updates the site copy in
  the same PR.

## 12. Definition of done (v1.1)
On a clean machine, following only the deployed site, the owner downloads LeetTrace, runs it,
adds the extension, pairs, opens a real leetcode.com problem, writes Python, clicks Trace, and
watches it execute against the real example cases — with the app's code never leaving the
machine. A tagged release reproduces all downloadable assets via CI.
