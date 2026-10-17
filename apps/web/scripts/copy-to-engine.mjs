// The engine serves the built web UI. Copy dist/ into the engine's package data dir so
// `leettrace start` (and the pipx wheel) ship the UI.
import { cpSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', 'dist');
const dest = join(here, '..', '..', '..', 'packages', 'engine', 'src', 'leettrace', 'web_dist');
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
writeFileSync(join(dest, '.gitkeep'), '');
console.log(`web UI copied -> ${dest}`);
