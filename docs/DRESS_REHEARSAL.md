# Dress rehearsal (v1.1.0): from the site to a trace on real LeetCode

Run this after `LAUNCH_CHECKLIST.md` steps 1–3 (code pushed, site live, v1.1.0 released). Use a
**clean machine**: a computer that never had LeetTrace, or a fresh user account. For the
browser, use a **new Chrome profile** (profile icon → Add → Continue without an account).

Use **only what the site tells you**. If you need anything that isn't on the page, that's a bug
in the page; write it down. Allow about 15 minutes. Mark each step ✅ or ❌ and take a screenshot
of every ❌.

| #   | Do                                                                                               | Check                                                                                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Open `https://leettrace.vercel.app`.                                                             | Dark page, "See your code actually run." Loads fast. The "It shows up inside LeetCode" panel plays a linked-list trace when you scroll to it.                                                                                                                                                                                             |
| 2   | Look at the big **Download** button.                                                             | It names **your OS** and shows **v1.1.0 · size**. "Other platforms & checksums" lists every installer, the Linux CLI, both extension zips and `SHA256SUMS`.                                                                                                                                                                               |
| 3   | Click **Download**.                                                                              | Windows: `LeetTrace-Setup-windows-x64.exe`. Mac: `LeetTrace-macos-arm64.dmg` (or `-x64` on Intel). Linux: `LeetTrace-linux-x86_64.AppImage`.                                                                                                                                                                                              |
| 4   | Install it, following the site's **Install → 1** for your OS.                                    | **Windows:** SmartScreen → **More info → Run anyway** (once), then the installer: a "Before you start" page, then Finish with "Start LeetTrace" ticked. **Mac:** the dmg window says "Drag LeetTrace to Applications" and shows the right-click → Open step; do it. **Linux:** `chmod +x` and run. The dialogs match the site's pictures. |
| 5   | Wait a few seconds.                                                                              | A browser tab opens: "LeetTrace v1.1.0 is running on this computer" and **"Welcome! One step left: add the browser extension"**. A LeetTrace icon is in the **system tray / menu bar**. You never opened a terminal.                                                                                                                      |
| 6   | Click the tray / menu-bar icon.                                                                  | The menu shows "LeetTrace 1.1.0 — running", **Open LeetTrace**, **Add the browser extension**, **Start at login** (ticked), **Quit LeetTrace**.                                                                                                                                                                                           |
| 7   | Add the extension the way the welcome page says (store, or the zip → Load unpacked).             | The extension installs with no red errors. Within a few seconds the welcome page shows **"✓ Extension connected automatically"** (reload it if not). No code anywhere.                                                                                                                                                                    |
| 8   | Open `https://leetcode.com/problems/two-sum/`, sign in if you like, set the language to Python3. | A blue **Trace** button sits left of **Run**, and a LeetTrace tab is on the right edge.                                                                                                                                                                                                                                                   |
| 9   | Click **Trace**.                                                                                 | The panel opens in the dark design with a green **connected** chip and Two Sum's examples. If Chrome asks whether leetcode.com may use **apps on this device**, choose **Allow**. You never enter a code.                                                                                                                                 |
| 10  | Paste a correct solution into the editor and click **Trace my code**.                            | One tab per example, each ✓. The panel shows the `twoSum()` frame, the `seen` dict filling in and arrows; ←/→ and the timeline step through it.                                                                                                                                                                                           |
| 11  | Make it wrong (e.g. `return [i, i]`) and trace again.                                            | Cases show ✗ with Output vs Expected.                                                                                                                                                                                                                                                                                                     |
| 12  | Go to `/problems/reverse-linked-list/` with LeetCode's own **Next** / problem list (no reload).  | The Trace button is still there; the panel shows the new problem's examples and the old results are gone. Tracing a Python solution shows the `next` arrows flipping.                                                                                                                                                                     |
| 13  | Quit LeetTrace from the tray icon, then click Trace.                                             | The panel says **"Start the LeetTrace app"** — no terminal commands in it.                                                                                                                                                                                                                                                                |
| 14  | Open LeetTrace again (Start menu / Applications / launcher). Don't touch the panel.              | Within ~30 s the panel reconnects by itself. Click Trace: it works. **No re-pairing, no code.**                                                                                                                                                                                                                                           |
| 15  | Restart the computer (or sign out and in). Open LeetCode and click Trace.                        | LeetTrace started at login (icon in the tray / menu bar) and tracing works straight away.                                                                                                                                                                                                                                                 |
| 16  | Switch the editor to C++ and click Trace.                                                        | The panel says LeetTrace traces Python 3 for now. Nothing breaks.                                                                                                                                                                                                                                                                         |
| 17  | _(If Chrome blocked it at step 9)_ Follow the panel's "Chrome is blocking the connection" card.  | It names **Apps on device** (or "Local network access" on older Chrome); after allowing it and reloading, tracing works.                                                                                                                                                                                                                  |

## Where to report what breaks

For every ❌, open an issue at `https://github.com/sunny925bay-jpg/leettrace/issues` (or paste
it into this Claude Code session) with:

- the step number, your OS and version, and your Chrome version (`chrome://version`);
- a screenshot;
- for anything on leetcode.com: the problem URL and any red errors from DevTools → Console
  (F12);
- for the app: `~/.leettrace/app.log` and `~/.leettrace/daemon.log`
  (`%USERPROFILE%\.leettrace\…` on Windows).

The most likely fixes are small and local:

- the page reading in `apps/extension/src/content/leetcodePage.ts` (step 9/12);
- the install copy and pictures in `apps/site/src/App.tsx` / `BypassShot.tsx` (step 4);
- the installers in `packages/engine/packaging/` (steps 4–6).

If a problem page isn't read correctly, save it as a regression fixture: DevTools → Console,
run `copy('<!doctype html>' + document.documentElement.outerHTML)`, paste into
`apps/extension/e2e/fixtures/real-<slug>.html`, and commit it.
