#!/usr/bin/env bash
# LeetTrace — Phase 0 scaffold. Lays down the polyglot monorepo and confirms both toolchains.
# Run from an empty directory you've already `git init`'d. Review each step; don't run blind.
set -euo pipefail

# --- 0. Toolchain checks -------------------------------------------------------
node -v            # Node 20 LTS recommended
corepack enable    # provides pnpm
pnpm -v
python3 --version  # 3.11+ recommended for the engine
# uv manages the Python engine (fast, reproducible). Install if missing:
command -v uv >/dev/null || curl -LsSf https://astral.sh/uv/install.sh | sh

# --- 1. Workspace root ---------------------------------------------------------
pnpm init
cat > pnpm-workspace.yaml <<'YAML'
packages:
  - "packages/*"
  - "apps/*"
YAML
pnpm add -D -w turbo typescript @types/node prettier eslint

# --- 2. TypeScript workspaces --------------------------------------------------
# packages/schema — the contract (TS types, zero deps)
mkdir -p packages/schema/src && touch packages/schema/src/index.ts
# packages/viz — shared React visualization components
mkdir -p packages/viz/src/{StackPanel,HeapPanel,ArrowLayer,NarrationBar,Controls} packages/viz/src/lib
# apps/web — local web UI (Vite + React + TS)
pnpm create vite@latest apps/web -- --template react-ts
# apps/extension — MV3 extension (CRXJS + React). Scaffold the dir; wire CRXJS in Phase 6.
mkdir -p apps/extension/src/{content,background,panel}

pnpm install
# Add React + viz tooling where needed (web + viz + extension):
pnpm --filter ./packages/viz add react react-dom
pnpm --filter ./packages/viz add -D vitest @testing-library/react jsdom typescript
pnpm --filter ./apps/web add -D vitest jsdom @testing-library/react

# --- 3. Python engine (packages/engine) ---------------------------------------
mkdir -p packages/engine
pushd packages/engine >/dev/null
uv init --package --name leettrace
uv add pydantic fastapi "uvicorn[standard]" websockets watchfiles typer textual
uv add --dev pytest ruff mypy
mkdir -p src/leettrace/{tracer,server,leetcode,cli} tests
touch src/leettrace/tracer/__init__.py \
      src/leettrace/server/__init__.py \
      src/leettrace/leetcode/__init__.py \
      src/leettrace/cli/__init__.py \
      tests/test_tracer.py
# Expose the `leettrace` CLI entrypoint in pyproject (edit [project.scripts]):
#   leettrace = "leettrace.cli:app"
popd >/dev/null

# --- 4. Turborepo pipeline -----------------------------------------------------
cat > turbo.json <<'JSON'
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "test":  { "dependsOn": ["^build"] },
    "lint":  {}
  }
}
JSON

# --- 5. Root scripts -----------------------------------------------------------
npm pkg set scripts.build="turbo build"
npm pkg set scripts.test="turbo test"
npm pkg set scripts.lint="turbo lint && prettier --check ."
npm pkg set scripts.format="prettier --write ."
npm pkg set scripts.engine:test="cd packages/engine && uv run pytest"
npm pkg set scripts.engine:dev="cd packages/engine && uv run leettrace start"

# --- 6. Drop the project docs in ----------------------------------------------
# Place SPEC.md, CLAUDE.md, ARCHITECTURE.md, PROMPTS.md at the repo root (you have these).

# --- 7. Verify -----------------------------------------------------------------
pnpm install
pnpm build || echo "Stubs may not build until Phase 1 — that's expected on an empty repo."
( cd packages/engine && uv run pytest -q ) || echo "No engine tests yet — expected before Phase 1."

echo
echo "Phase 0 scaffold complete."
echo "Monorepo: packages/{schema,viz,engine}  apps/{web,extension}"
echo "Next: confirm 'cd packages/engine && uv run python -c \"import sys; print(sys.version)\"' runs,"
echo "then start Phase 1 with the kickoff prompt in PROMPTS.md."
