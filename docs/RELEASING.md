# Releasing

## Cut a release

```bash
node scripts/set-version.mjs 1.1.0     # engine, extension, web UI, site, schema, golden traces
(cd packages/engine && uv lock)
pnpm build && pnpm test
git commit -am "release: v1.1.0"
git tag v1.1.0
git push && git push --tags
```

The **Release** workflow (`.github/workflows/release.yml`) then:

1. checks that the tag matches `__version__` in the code;
2. builds the web UI and both extension zips;
3. on each OS, builds the desktop app and its installer, **installs it, starts it the way the
   OS does at login, and smoke-tests it** (`packages/engine/scripts/install_check.py`);
4. writes `SHA256SUMS` and publishes the GitHub Release with these assets:

| Asset                             | What it is                                                    |
| --------------------------------- | ------------------------------------------------------------- |
| `LeetTrace-Setup-windows-x64.exe` | Windows installer (Program Files, Start menu, start at login) |
| `LeetTrace-macos-arm64.dmg`       | macOS, Apple silicon (menu-bar app, drag to Applications)     |
| `LeetTrace-macos-x64.dmg`         | macOS, Intel                                                  |
| `LeetTrace-linux-x86_64.AppImage` | Linux desktop app (registers autostart on first run)          |
| `leettrace-linux-x64`             | Linux command-line binary (no tray app)                       |
| `leettrace-chrome-extension.zip`  | Chrome Web Store upload / Load unpacked                       |
| `leettrace-firefox-extension.zip` | Firefox Add-ons upload                                        |
| `SHA256SUMS`                      | checksums for all of the above                                |

Asset names carry no version, so `…/releases/latest/download/<name>` always points at the
newest release; the site uses that as its fallback.

**Dry run:** push a branch named `release-dry-run/<anything>` (or run the workflow with
`dry_run: true`). Everything is built and checked and attached to the run; nothing is
published.

## Chrome Web Store

1. Upload `leettrace-chrome-extension.zip` and paste the listing from `docs/store-listing.md`
   (screenshots and icon in `docs/store/`, privacy policy at `<site>/privacy/`).
2. Once approved, set **`VITE_CHROME_STORE_URL`** (the one `STORE_URL` switch, in the repo-root
   `.env` or as a Vercel environment variable) to the listing URL and redeploy. The site's and
   the app's "Add to Chrome" buttons then go to the store. No code change.
3. **Extension ID.** The manifest pins a `key`, so unpacked builds have a fixed ID
   (`EXTENSION_ID` in `packages/schema/src/pairing.ts`) and the app's page knows whom to hand
   the token to. Check the item ID the store shows:
   - same as `EXTENSION_ID`: nothing to do;
   - different: add it to `VITE_EXTRA_EXTENSION_IDS` in the repo-root `.env` and cut a patch
     release (the app's page then offers the token to both IDs).

## Signing (deferred — a secrets-only switch)

Releases ship **unsigned** today, so first launch needs one click-through, which the site, the
FAQ, the dmg window and the Windows installer all spell out. To ship signed builds later, add
these **repository secrets** (Settings → Secrets and variables → Actions) and re-release. The
build scripts sign whenever the secrets are present and skip signing when they're empty; no
code or workflow changes are needed.

**macOS** (Apple Developer Program, $99/yr) — used by `packaging/macos/build_dmg.sh`:

| Secret                  | Value                                                                     |
| ----------------------- | ------------------------------------------------------------------------- |
| `APPLE_DEVELOPER_ID`    | the signing identity, e.g. `Developer ID Application: Your Name (TEAMID)` |
| `APPLE_CERT_P12_BASE64` | your Developer ID Application certificate exported as `.p12`, base64      |
| `APPLE_CERT_PASSWORD`   | the `.p12` export password                                                |
| `APPLE_ID`              | the Apple ID email used for notarization                                  |
| `APPLE_TEAM_ID`         | your 10-character team ID                                                 |
| `APPLE_APP_PASSWORD`    | an app-specific password for that Apple ID                                |

With the first three, the app is code-signed (hardened runtime). With all six, the dmg is also
notarized and stapled, and Gatekeeper opens it without the right-click step.

**Windows** (an OV or EV code-signing certificate) — used by
`packaging/windows/build_installer.sh`:

| Secret                    | Value                                       |
| ------------------------- | ------------------------------------------- |
| `WINDOWS_CERT_PFX_BASE64` | the code-signing certificate `.pfx`, base64 |
| `WINDOWS_CERT_PASSWORD`   | the `.pfx` password                         |

`LeetTrace.exe`, `leettrace-cli.exe` and the installer are signed and timestamped. SmartScreen
reputation still builds up over the first downloads (immediately with an EV certificate).

After signing is live, remove the one-time click-through copy from `apps/site/src/App.tsx`
(install section + FAQ), `packages/engine/packaging/macos/` and
`packages/engine/packaging/windows/readme.txt`.
