# Releasing

1. Bump the version in `packages/engine/pyproject.toml`, `packages/engine/src/leettrace/__init__.py`,
   `packages/schema/src/index.ts` (`SCHEMA_VERSION`, but only if the wire format changed),
   and `apps/extension/package.json`. Engine and extension must agree on `major.minor`.
2. Tag the release (`git tag v0.1.0 && git push --tags`). The `Release` workflow builds:
   - the wheel and sdist, with the web UI bundled (`pipx install leettrace`)
   - standalone binaries for Linux, macOS, and Windows (PyInstaller)
   - `leettrace-chrome-<v>.zip` and `leettrace-firefox-<v>.zip`
3. Publish by hand from the workflow's artifacts:
   - PyPI: `uv publish packages/engine/dist/*` (or set up PyPI trusted publishing).
   - Chrome Web Store: upload the Chrome zip. The listing copy is in `docs/store-listing.md`.
   - Firefox Add-ons: upload the Firefox zip.
   - GitHub release: attach the binaries.
4. While store review is pending, users can sideload the extension. Unzip it, open
   `chrome://extensions`, turn on Developer mode, and choose "Load unpacked".
