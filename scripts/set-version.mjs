// Set the product version everywhere it lives, so the engine, the extension, the web UI and
// the trace schema agree (clients compare major.minor and show an "update" banner otherwise).
//   node scripts/set-version.mjs 1.0.0
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const v = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(v ?? '')) {
  console.error('usage: node scripts/set-version.mjs <major.minor.patch>');
  process.exit(1);
}
const edit = (rel, fn) => {
  const p = join(root, rel);
  const before = readFileSync(p, 'utf8');
  const after = fn(before);
  if (after === before) throw new Error(`no version found in ${rel}`);
  writeFileSync(p, after);
  console.log('updated', rel);
};

edit('packages/engine/pyproject.toml', (s) => s.replace(/^version = "[^"]+"/m, `version = "${v}"`));
edit('packages/engine/src/leettrace/__init__.py', (s) =>
  s.replace(/__version__ = "[^"]+"/, `__version__ = "${v}"`),
);
edit('packages/schema/src/index.ts', (s) =>
  s.replace(/export const SCHEMA_VERSION = '[^']+';/, `export const SCHEMA_VERSION = '${v}';`),
);
for (const pkg of [
  'package.json',
  'packages/schema',
  'packages/viz',
  'packages/engine',
  'apps/web',
  'apps/extension',
  'apps/site',
]) {
  const rel = pkg.endsWith('.json') ? pkg : `${pkg}/package.json`;
  edit(rel, (s) => s.replace(/"version": "[^"]+"/, `"version": "${v}"`));
}
// Golden traces + viz fixtures record which engine produced them.
for (const dir of ['packages/engine/tests/snapshots', 'packages/viz/fixtures']) {
  for (const f of readdirSync(join(root, dir)).filter((n) => n.endsWith('.json'))) {
    edit(`${dir}/${f}`, (s) => s.replace(/"engineVersion": "[^"]+"/, `"engineVersion": "${v}"`));
  }
}
console.log(
  `\nversion ${v} set. Next: cd packages/engine && uv lock, run the tests, commit, then tag v${v}.`,
);
