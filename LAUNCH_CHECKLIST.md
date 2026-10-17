# Launch checklist (v1.1.0)

These are the owner steps, in order. Everything else is built and checked by CI.

The flow your users get: **visit the site → download → run the installer → one-time OS
warning click-through → add the extension → open LeetCode → it's already there.** No terminal,
no pairing code, no re-pairing.

Your repo is `sunny925bay-jpg/leettrace`. The site is `https://leettrace.vercel.app` (if Vercel
gives you a different URL, use that everywhere below).

## 1. Bring the v1.1.0 code into your repo

The work happened on the `leettrace` branch of `sunnyincalif-source/ClaudeTest`. In your local
clone (VS Code terminal, in the `leettrace` folder):

```bash
git pull https://github.com/sunnyincalif-source/ClaudeTest.git leettrace
git push
```

GitHub runs **CI** (Actions tab). It should go green: lint, build, tests, browser end-to-end
tests, and on Linux, macOS and Windows it builds the installer, installs it, starts it the way
the OS does at login, and smoke-tests it.

## 2. Make sure the site is live on Vercel

1. If you haven't yet: [vercel.com/new](https://vercel.com/new) → import
   `sunny925bay-jpg/leettrace` → **Root Directory** `apps/site` → Deploy. (`vercel.json` sets
   the install/build commands; leave "Include source files outside of the Root Directory" on.)
2. Every push to `main` redeploys. Open the site: the new dark design should be there.
3. If the URL isn't `https://leettrace.vercel.app`, set `VITE_LEETTRACE_SITE_URL` in the
   repo-root `.env` (one file for the site, the app and the extension), commit and push.

## 3. Release v1.1.0

The code is already at version 1.1.0, so just tag it:

```bash
git tag v1.1.0
git push --tags
```

The **Release** workflow (about 20 minutes) builds, installs and checks every installer, then
publishes the GitHub Release with:

- `LeetTrace-Setup-windows-x64.exe`, `LeetTrace-macos-arm64.dmg`, `LeetTrace-macos-x64.dmg`,
  `LeetTrace-linux-x86_64.AppImage`, `leettrace-linux-x64` (CLI);
- `leettrace-chrome-extension.zip` (store upload), `leettrace-firefox-extension.zip`;
- `SHA256SUMS`.

Check: the site's **Download** button shows `v1.1.0 · <size>` for your OS.

## 4. Chrome Web Store (one-time $5)

1. Create a developer account at the Chrome Web Store Developer Dashboard.
2. **Add new item** → upload `leettrace-chrome-extension.zip` from the release.
3. Fill the listing from `docs/store-listing.md` (copy, permission justifications, data-use
   answers); screenshots and the icon are in `docs/store/`; privacy policy URL:
   `https://leettrace.vercel.app/privacy/`.
4. Compare the store's **Item ID** with `EXTENSION_ID` in `packages/schema/src/pairing.ts`.
   If they differ, put the store ID in `VITE_EXTRA_EXTENSION_IDS` in `.env` (see
   `docs/RELEASING.md`) and cut a patch release.
5. Submit for review. Until it's approved, people use the zip (Load unpacked) — the site and
   the app's welcome page say how.
6. **After approval:** set `VITE_CHROME_STORE_URL=<listing URL>` in the repo-root `.env` (or as
   a Vercel environment variable) and push. Every "Add to Chrome" button switches to the store.

Firefox (optional): upload `leettrace-firefox-extension.zip` at addons.mozilla.org. Firefox
users connect once with the code under "Other ways to connect".

## 5. Dress rehearsal

Run `docs/DRESS_REHEARSAL.md` on a clean machine (or a fresh user account) using only the live
site, and report anything that doesn't match. One short fix round, then it's live for anyone
with the link.

## Later: remove the first-launch warnings

Buy an Apple Developer membership ($99/yr) and a Windows code-signing certificate, add the
secrets listed in `docs/RELEASING.md` → "Signing", and re-release. No code changes.

## Known gaps

- **Unsigned** (above): one click-through on first launch, explained on the site, in the FAQ,
  in the dmg window and in the Windows installer.
- **Python only.** JavaScript is next; C++ and Java are on the roadmap.
- **Memory cap:** enforced on Linux (`RLIMIT_AS`) and Windows (Job Object); best effort on
  macOS. Step, time and depth caps apply everywhere.
- **Live leetcode.com** isn't reachable from CI; the extension is tested against saved problem
  pages. The dress rehearsal covers the real site.
- **Tray icon on Linux** needs a desktop with a system tray (most do; GNOME needs the
  AppIndicator extension). Without one, LeetTrace still runs in the background.
