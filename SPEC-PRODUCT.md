# LeetTrace — Product-Grade UX + Design System Spec (v1.3)

> Addendum to SPEC.md + SPEC-LAUNCH.md. v1.0.0 is built, released, and CI-green across OSes.
> This version does two things at once:
> 1. **New visual identity** — a modern dev-tool dark look (Linear × Vercel), electric-blue
>    accent (strictly developer-tool colors — no purple/violet), applied to BOTH the in-LeetCode
>    trace panel and the landing site via one shared design system.
> 2. **Product-grade UX** — remove every avoidable step between "a stranger clicks my link" and
>    "LeetTrace is working on their LeetCode tab": no terminal, no pairing code, no re-pairing.
>
> Target flow (Cluely-like): **visit site → download → run installer → (one-time OS warning
> click-through) → Add to Chrome from the Web Store → open LeetCode → it's already there.**
>
> The four core `CLAUDE.md` rules and the two from SPEC-LAUNCH §11 still bind, unchanged. Adds
> Phases 16–21.

**Owner:** you · **Implementer:** Claude Code
**Decisions locked:** UI = both surfaces · aesthetic = modern dev-tool dark · accent = electric
blue + cyan only (strictly dev colors, NO purple/violet) · references = Linear + Vercel · Chrome
Web Store = **yes** · signing = **unsigned
for now, document the bypass** · domain = **free `leettrace.vercel.app`**.

---

## 1. Two clarifications that shape everything (don't re-architect around them)
1. **The website is already laptop-independent.** `apps/site` deploys to Vercel's edge, on 24/7
   regardless of the owner's machine. Open item = confirming the deploy is live (owner step).
   Do not move site hosting onto the engine.
2. **The engine is per-user and local, and stays that way.** Each downloader runs their own
   engine on their own `127.0.0.1`; the owner's machine is never in anyone else's path. This is
   the privacy + security model. **Do not add a shared/cloud execution backend** (it would break
   loopback-only + no-Pyodide and send users' code off-device).

The one irreducible step: because tracing runs real CPython locally, the user installs a small
desktop app — exactly as Cluely does. That download is the product, not a flaw.

---

## 2. Design system (the new identity — build this FIRST, §Phase 16)

Create a single source of truth consumed by `packages/viz` (the trace panel) and `apps/site`
(the landing page), so both read identical. Put tokens in a shared location (e.g.
`packages/design` exporting CSS custom properties + a TS token map; or a Tailwind preset shared
by both). **No surface hardcodes a hex value outside this system.**

### 2.1 Direction
Modern developer-tool dark, in the lineage of **Linear** (hairline borders, quiet elevation,
precise type, restrained spring motion, subtle accent glow) and **Vercel** (sharp black canvas,
high-contrast type, confident spacing, geometric cleanliness). Not neon, not playful, not busy.
Color is used sparingly — the canvas is near-black, type is crisp, and the electric-blue accent
(with cyan as its only companion) appears only where it earns attention (primary CTA, the "live"
pointer, focus rings, one hero aurora). Strictly developer-tool colors: blue, cyan, green, red on
near-black — **no purple, no violet, no magenta** anywhere. This look is **dark-first**.

### 2.2 Color tokens (starting values — refine in build, keep the structure)
```
/* Canvas & surfaces (near-black, cool) */
--bg:            #08090c   /* page canvas */
--bg-elev:       #0e1014   /* cards, panels */
--bg-elev-2:     #14171c   /* nested / hover */
--border:        #1d2128   /* hairline */
--border-strong: #2a2f38

/* Text */
--fg:            #eceef2   /* primary */
--fg-muted:      #99a0ab   /* secondary */
--fg-faint:      #626a76   /* tertiary / captions */

/* Accent — electric blue + cyan ONLY (dev colors, no purple/violet) */
--accent:        #4d9fff   /* electric blue (primary interactive) */
--accent-2:      #22d3ee   /* cyan (gradient partner — the ONLY second accent) */
--accent-ink:    #06080c   /* text on a solid accent fill */
--accent-glow:   color-mix(in srgb, var(--accent) 45%, transparent)
--grad-accent:   linear-gradient(135deg, var(--accent), var(--accent-2))  /* blue -> cyan */

/* Semantic (distinct from accent) */
--good:          #2dd4a0   /* pass / correct */
--bad:           #f4515b   /* fail / error */
--warn:          #f0b254

/* Code-viz roles (tie panel to product) */
--ptr-curr:      var(--accent)      /* the pointer currently moving = the brand accent */
--ptr-prev:      var(--good)
--ptr-next:      #5aa6e6
--node:          var(--bg-elev-2)
```
Light theme: the **site is dark-only** (a deliberate single-world commit, like Linear/Vercel
landing pages — allowed by the design guidance when chosen on purpose; still set every color
explicitly). The **trace panel keeps both themes** (accessibility acceptance criterion from v1):
provide a light-token set for the panel that inverts canvas/surface/text while keeping the same
accent and semantic hues legible on light.

### 2.3 Typography
- **Display + body:** **Geist Sans** (Vercel's family — a deliberate, characterful grotesk, not
  the Inter/Space-Grotesk default the design guidance warns against). Self-host via fontsource /
  bundled `@font-face` so there's no CDN dependency; real fallback stack
  `"Geist", system-ui, sans-serif`. Tight tracking on large headings, `text-wrap: balance`.
- **Code / data / mono UI (pills, addresses, the editor mirror):** **IBM Plex Mono** (already in
  the product — keep it as the connective tissue to the viz) or **Geist Mono**; pick one and
  commit. Tabular figures where columns of numbers align.
- Type scale: a clear modular scale; oversized tight hero headline (Vercel-like), small precise
  body, uppercase micro-labels with letter-spacing for section eyebrows.

### 2.4 Shape, depth, motion
- **Radius:** small/medium (6–10px); nothing pill-blobby. **Borders:** 1px hairline
  `--border`, the primary structural device (Linear leans on borders, not shadows).
- **Elevation:** very subtle — a faint shadow plus a 1px top highlight on cards; reserve a soft
  **accent glow** for the primary CTA and the "engine connected / live" state only.
- **Motion:** fast and spring-like (Linear feel): 120–220ms, ease-out / subtle spring; hover
  lifts, focus rings in `--accent`, content reveals from a visible resting state on scroll. One
  orchestrated hero moment (a slow blue→cyan **aurora/gradient mesh** behind the hero, very
  low intensity). Everything respects `prefers-reduced-motion`.
- **Texture:** optional 1–2% grain or a faint dotted grid on the canvas for depth (Linear-ish),
  kept subtle.

### 2.5 Component language (shared)
Buttons (primary = accent gradient with glow; secondary = hairline ghost), cards (elevated
surface + hairline), pills/badges (mono, tinted by semantic token), tabs, code block styling,
focus state, the window-frame chrome used to present product shots. Define once; both surfaces
import.

---

## 3. The friction audit — what we remove, and how
| Current friction | Fix | Mechanism |
|---|---|---|
| Start it from a terminal | Real installer; engine auto-starts; starts on login | Phase 17 |
| 6-digit pairing code typed by hand | Automatic pairing, zero codes | Phase 18 (`externally_connectable` token handshake) |
| Re-pair every restart | Token persists; extension auto-reconnects | Phase 18 |
| "Load unpacked" | Chrome Web Store one-click add | Phase 19 |
| Chrome "connection blocked" message is wrong | Fix wording + detect the permission | Phase 18 |
| Scary first-launch warning | Unavoidable while unsigned — make the click-through dead simple, shown in installer + site | Phase 20 |
| Download page maybe not live | Owner confirms Vercel deploy; copy updated to the no-code flow | Phase 19, 21 |

---

## 4. Phase 16 — Design system + trace-panel restyle (the in-LeetCode UI)

> **Visual reference (approved):** `docs/ui-reference.html` in the repo is the signed-off
> mockup — the source of truth for palette, type, spacing, component styling, the hero, and the
> trace panel. Build to match it. Exact locked values: canvas `#08090c`, surfaces `#0e1014` /
> `#15181d` / `#1b1f26`, hairline border `#1d2128` (strong `#2b313a`), text `#eceef2` /
> `#98a0ab` / `#5f6873`, accent **electric blue `#4d9fff`**, companion **cyan `#22d3ee`**
> (blue→cyan gradient `135deg`), pass **green `#2dd4a0`**, fail **red `#f4515b`**. Fonts: **Geist
> Sans** (display/body), **IBM Plex Mono** (code/data). NO purple/violet/magenta. The reference
> is dark-only; the shipped panel adds a light theme (§2.2) while the site stays dark-only.

Build §2 as a shared system, then **restyle `packages/viz`** (stack, heap, pointer arrows,
narration, controls, test badges, side panel chrome) to the new dark electric look. This is the
UI the user sees on LeetCode.
- Apply tokens, Geist + mono, hairline cards, accent-driven "current pointer," subtle spring on
  step transitions and arrow rewiring, accent glow on the "engine connected" state.
- Keep the viz a **pure function of the current step** and reading **only** the trace format (no
  restyle may introduce language branching). Keep light + dark for the panel.
- Update the Storybook/harness so the panel is reviewable against recorded sample traces in the
  new skin.
*Done when:* the panel renders the linked-list-reverse sample in the new identity in both panel
themes, all existing viz tests still pass, and the harness shows the restyle.

## 5. Phase 17 — Real installers + always-on engine (remove the terminal)
- **macOS:** `.dmg` drag-to-`/Applications`, proper `.app`; first open registers a Login Item +
  starts the engine. **Windows:** NSIS/MSI installer (Program Files, Start-menu, run-on-login);
  launching starts the engine. **Linux:** AppImage (and/or `.deb`) with autostart entry.
- **Tray/menu-bar item** (styled to the identity where the OS allows): status, Open LeetTrace,
  Add the extension, Stop/Quit; single-instance guard; clean shutdown. First-install-only
  **welcome window** with a prominent "Add the LeetTrace extension" button.
- Keep the CLI for power users; no normal-user step requires a terminal. Wire installers into the
  release workflow.
*Done when:* on each OS the installer installs the app and opening it (or rebooting) leaves the
engine running with a tray item, zero terminal use. (Live per-OS confirm = owner step.)

## 6. Phase 18 — Automatic pairing (remove the 6-digit code)
Security identical — the token still gates every request; only delivery becomes automatic.
- Pin a `key` in the extension manifest → stable extension ID matching the future Web Store ID.
- Add `"externally_connectable": { "matches": ["http://127.0.0.1:*/*","http://localhost:*/*"] }`.
  The engine-served welcome/status page (holds the token server-side) calls
  `chrome.runtime.sendMessage(EXTENSION_ID, {type:'leettrace-pair', token, port})`; the
  extension stores it in `chrome.storage`. **No code shown or typed.** Safe because only a real
  localhost page served by the engine holds the token, and the fixed ID means only our extension
  is targetable.
- **Persist** the token at `~/.leettrace/` across restarts; extension auto-reconnects with
  retry/backoff; an open LeetCode tab reconnects after an app restart with **no re-pairing**; a
  rotated token re-handshakes silently on the next visit to the engine page.
- Fallback: one-click "Connect" on the welcome page; manual code kept only as a hidden last
  resort. Happy path shows neither.
- **Fix the Chrome local-network block** (v1.0.1 bug): name the current setting ("Apps on
  device"), detect the blocked state reliably, show an inline toggle guide, and prefer an
  approach that avoids triggering the prompt.
*Done when:* install app + add extension → "engine connected" on a LeetCode page with **no code
entered**, surviving app + browser restart with no re-pair, and the blocked-permission message
is correct. Covered by a handshake unit test + the saved-DOM fixture e2e.

## 7. Phase 19 — Chrome Web Store + landing site in the new design
- **Store-ready builds:** pinned-key manifest, icon set in the new identity, screenshots from
  the restyled panel, short+long descriptions (`docs/store-listing.md`), and a `/privacy` page on
  the site (no data collection, loopback-only, not affiliated with LeetCode) for the required
  privacy-policy URL.
- **`STORE_URL` env switch:** one value flips the site's + welcome page's "Add to Chrome" button
  from unpacked instructions to the live Web Store URL; no code change to flip.
- **Build/rewrite `apps/site` in the design system (§2), structure per §8, copy per §9.** The
  site is **dark-only**, Linear/Vercel-grade: aurora hero with the product shot in a window
  frame (reuse the restyled panel demo), three-step how-it-works, the payoff trace clip, feature
  bento with hairline cards + subtle accent, a local/privacy section, full install + (auto)
  connect instructions, FAQ, closing CTA, footer with "not affiliated with LeetCode." OS-detected
  download resolves the latest GitHub Release (API + build-time fallback) showing version/size/SHA.
- Remove ALL pairing-code and terminal language. Prep the Firefox AMO zip (secondary).
- Static only, no telemetry; responsive to ~380px; AA contrast on the dark palette; keyboard +
  screen-reader support; Lighthouse ≥95 perf/a11y.
*Done when:* the submittable store package + `/privacy` exist, the `STORE_URL` switch works, and
the site is deployed to `leettrace.vercel.app` in the new identity with the no-code/no-terminal
copy and a working OS-detected download. (Paying $5, submitting, setting `STORE_URL` = owner.)

## 8. Landing site structure (dark, Linear × Vercel)
1. **Nav** — wordmark (new mark) left; Install · Add to Chrome · GitHub right; sticky, hairline
   bottom border, blur backdrop.
2. **Hero** — oversized tight headline, one-line subhead, primary **Download (OS-detected)** +
   secondary **Add to Chrome**; product shot of the restyled panel in a window frame; low-intensity
   blue→cyan aurora behind; "Python · runs locally · open source" micro-line.
3. **How it works** — 3 steps: Download & install → Add to Chrome → Open LeetCode, it's there.
4. **The payoff** — looping restyled trace of a real problem (stack + heap + arrows); the "whoa."
5. **Feature bento** — hairline cards, one accent per card max: call stack, live heap & pointer
   arrows, step-by-step "why," real test cases, terminal + browser, 100% local.
6. **Runs locally / privacy** — confident and short; loopback + token; nothing uploaded.
7. **Get started / Install** — per-OS steps incl. the one-time unsigned click-through; "add the
   extension" (store when live, else unpacked); "it connects automatically — no code."
8. **FAQ** — accordion (§9).
9. **Closing CTA** — repeat download.
10. **Footer** — Product / Help / GitHub, version + "not affiliated with LeetCode," socials.

Motion: aurora + card reveals from visible rest; reduced-motion respected.

## 9. Site copy (use verbatim; no pairing-code or terminal language)
**Hero headline (pick one):** "See your code actually run." · "Watch your solution execute — on
the problems you're actually grinding." **Subhead:** "LeetTrace rides along with your LeetCode
practice and shows the call stack, memory, and pointers step by step, on the real test cases.
Runs entirely on your machine — nothing is uploaded." **Micro-line:** "Python · 100% local · open
source."
**How it works:** 1) **Download & install.** One file. A small tracer runs locally — your code
never leaves your machine. 2) **Add to Chrome.** One click from the Chrome Web Store. 3) **Open
any LeetCode problem.** A **Trace** button is already there — hit it and watch it run.
**Install — macOS:** Open the `.dmg`, drag to Applications. First launch: **right-click → Open**
once (it's unsigned for now). **Windows:** Run the installer; if SmartScreen appears, **More info
→ Run anyway** (one time). **Linux:** Make it executable and run it. **Connect:** nothing to do —
the app and extension pair **automatically**. **Use it:** open any problem, write Python, click
**Trace**.
**FAQ:** *Is my code sent anywhere?* No — the tracer runs on your machine; the browser talks to
it only over `127.0.0.1`, locked to a token and to leetcode.com. · *"Unverified developer" /
"Windows protected your PC"?* Normal for an unsigned app — one-time right-click→Open / More info→
Run anyway. · *Do I enter a code?* No — it connects automatically. · *Languages?* Python today;
JS next; C++/Java on the roadmap. · *Affiliated with LeetCode?* No, independent companion tool.

## 10. Phase 20 — Unsigned polish + signing drop-in (deferred activation)
Ship unsigned. Make the one-time bypass unmissable (one line + one screenshot per OS) on the site,
FAQ, and in the installer itself (DMG background text; Windows readme panel). Keep CI
notarization/signing steps stubbed on absent secrets; document in `RELEASING.md` exactly which
secrets enable them later. No behavior change now.

## 11. Phase 21 — v1.1.0 release + product dress rehearsal
Fix stale README links (`sunnyincalif-source` → `sunny925bay-jpg`). Update
`LAUNCH_CHECKLIST.md` to the new flow. Prepare the **v1.1.0** release (new UI + installers +
auto-pair + corrected messages) via tag→CI. Then **STOP** and hand the owner a numbered
dress-rehearsal script to run on a clean machine using only the live site: download → install →
one warning click-through → add the extension → open a real leetcode.com problem → confirm the
Trace button auto-appears and traces in the new UI → wrong answer → next problem (SPA nav) →
restart app (confirm NO re-pair). Then one short fix round for whatever the real site surfaces.

## 12. What stays exactly as built (don't touch)
Tracer, schema, safety caps, loopback+token server, origin allowlist, the 144-test suite,
narration logic. The restyle changes presentation only. UI still reads only the trace format; no
language branching; no Pyodide; the allowlist is never widened; auto-pairing delivers the token
but never removes it.

## 13. Risks
| Risk | Mitigation |
|---|---|
| Restyle breaks viz correctness/tests | Presentation-only; keep pure-function-of-step; run the full viz suite; review in the harness. |
| `externally_connectable` needs stable ID / store | Pin manifest `key`; same ID unpacked and on-store. |
| Web Store review delay/rejection | Unpacked path remains; `STORE_URL` flip instant on approval. |
| Unsigned warning still scares users | One-time click-through unmissable in installer + site + FAQ; signing a documented later flip. |
| Real leetcode.com differs from fixtures | SPA-nav hardening; Phase 21 owner rehearsal + one fix round. |
| Dark-only site hurts some users | High-contrast AA dark palette; the product panel keeps light + dark. |

## 14. Definition of done (v1.3)
A stranger with only the `leettrace.vercel.app` link can download, install, click past one
first-launch warning, add the extension from the Chrome Web Store in one click, open any real
leetcode.com problem, and see LeetTrace — in its new dark electric identity — already attached and
tracing, with no terminal, no pairing code, and no re-pairing, their code never leaving their
machine, the site served independently of the owner's computer, and the panel and site sharing one
design system.
