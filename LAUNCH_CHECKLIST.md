# Launch checklist

These are the owner steps, in order. Everything else is already built and checked by CI.
Steps 1–4 take about 20 minutes, and the optional ones can come later.

Throughout, `<you>` is your GitHub username (for example `sunnyincalif-source`).

## 1. Create the public repo and enable Actions

1. On GitHub, create a new **public**, **empty** repository named `leettrace`. Don't add a
   README or a license; the code already has both.
2. Push the code:

   ```bash
   git clone -b leettrace https://github.com/sunnyincalif-source/ClaudeTest.git leettrace
   cd leettrace
   git remote set-url origin https://github.com/<you>/leettrace.git
   git push -u origin HEAD:main
   ```

3. In the repo, go to **Settings → Actions → General**:
   - Set **Allow all actions**.
   - Under **Workflow permissions**, choose **Read and write**. The release job needs it to
     create the GitHub Release.
4. Open the **Actions** tab. A **CI** run starts on its own and should go green: Linux checks
   plus engine tests, binary builds and smoke tests on Linux, macOS and Windows.

If you named the repo anything other than `<you>/leettrace`, set
`VITE_GITHUB_REPO=<you>/<name>` in `apps/site/.env` and commit it.

## 2. Deploy the site on Vercel

1. Go to [vercel.com/new](https://vercel.com/new), import `<you>/leettrace`, and set:
   - **Root Directory:** `apps/site`
   - **Framework preset:** Vite (auto-detected). `apps/site/vercel.json` already sets the
     install and build commands and the security headers.
   - **Include source files outside of the Root Directory:** leave on (the default).
     The site's install command needs the monorepo's lockfile.
2. Click **Deploy**, then note the URL, for example `https://leettrace.vercel.app` or
   `https://leettrace-<you>.vercel.app`.
3. If the URL is **not** `https://leettrace.vercel.app`, point the app and extension at it.
   They link to the site's install guide:

   ```bash
   sed -i.bak 's#^VITE_LEETTRACE_SITE_URL=.*#VITE_LEETTRACE_SITE_URL=https://YOUR-URL#' apps/extension/.env apps/web/.env
   git commit -am "chore: point install links at the deployed site" && git push
   ```

   (On Windows, edit the two `.env` files by hand.)

Optional: add a custom domain in **Vercel → Project → Domains**, then repeat step 3 with it.

## 3. Cut the release

```bash
node scripts/set-version.mjs 1.0.0     # engine, extension, web UI, schema, golden traces
(cd packages/engine && uv lock)
pnpm build && pnpm test                # everything should be green
git commit -am "release: v1.0.0"
git tag v1.0.0
git push && git push --tags
```

The **Release** workflow then:

- checks that the tag matches the version in the code;
- builds `LeetTrace-macos-arm64.dmg`, `LeetTrace-macos-x64.dmg`, `LeetTrace-windows-x64.exe`,
  `leettrace-linux-x64`, `leettrace-chrome-extension.zip` and
  `leettrace-firefox-extension.zip`;
- smoke-tests every binary on its own OS;
- writes `SHA256SUMS`;
- publishes the **GitHub Release** with generated notes.

It takes roughly 15 minutes.

Check it: the site's Download button should now show `v1.0.0 · <size>`, and **Other
platforms & checksums** should list every file.

**Dry run, at any time:** push a branch named `release-dry-run/<anything>`. It builds and
tests every asset and attaches them to the workflow run, but never publishes.

## 4. Run the dress rehearsal

Follow `docs/DRESS_REHEARSAL.md` on a clean machine and report anything that breaks.

---

## Optional: public-polished path

### Chrome Web Store

1. Create a Chrome Web Store developer account (one-time $5).
2. Upload `leettrace-chrome-extension.zip` from the release.
3. Paste the listing copy from `docs/store-listing.md` and submit for review.
4. Once it's approved, set `VITE_CHROME_STORE_URL=<listing URL>` in `apps/site/.env`, commit,
   and push. Vercel redeploys, and **Add to Chrome** then goes to the store instead of the
   Load-unpacked steps.

### Firefox Add-ons

Upload `leettrace-firefox-extension.zip` at addons.mozilla.org.

### Code signing

The signing steps are written but commented out in `.github/workflows/release.yml`.

**macOS** (Apple Developer Program, $99/yr):

1. Export a "Developer ID Application" certificate as `.p12`.
2. Add these repo secrets: `APPLE_DEVELOPER_ID`, `APPLE_CERT_P12_BASE64`,
   `APPLE_CERT_PASSWORD`, `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_PASSWORD`.
3. Uncomment the "Sign + notarize (macOS)" step.

**Windows** (OV or EV code-signing certificate):

1. Add the secrets `WINDOWS_CERT_PFX_BASE64` and `WINDOWS_CERT_PASSWORD`.
2. Uncomment "Sign (Windows)".

Then remove the bypass steps from the site's install section.

---

## Known gaps (v1.1)

- **Unsigned binaries.** The first launch needs the one-time bypass. On macOS: right-click →
  Open. On macOS 15 or later: System Settings → Privacy & Security → Open Anyway. Or run
  `xattr -dr com.apple.quarantine /Applications/LeetTrace.app`. On Windows:
  SmartScreen → More info → Run anyway. The site, FAQ and app all say so.
- **Python only.** JavaScript is next; C++ and Java are on the roadmap. The site says this.
- **Memory cap by OS.**
  - Linux: enforced with `RLIMIT_AS`.
  - Windows: enforced with a Job Object. It's verified in CI on `windows-latest`; the test
    fails unless the cap attaches.
  - macOS: best effort, because macOS doesn't enforce `RLIMIT_AS`.

  On every OS the step (10,000), time (5 s) and recursion-depth (200) caps are enforced.
  `/health` and the welcome page state which memory mechanism applies.

- **Live leetcode.com not verified by CI.** The extension is tested against reconstructed
  problem pages and simulated in-app navigation, not the live site. Confirming it on the
  live site is the rehearsal's job.
- **Chrome asks once.** Chrome asks you to let leetcode.com reach apps on your device (local
  network access); choose Allow. The panel explains this if access is denied.
- **macOS Intel builds** run on GitHub's `macos-15-intel` runners. If GitHub retires that
  label, change it in `release.yml`.
