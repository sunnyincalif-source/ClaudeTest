// Zip the built extension for store upload: release/leettrace-{chrome,firefox}-<version>.zip
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const out = join(root, 'release');
mkdirSync(out, { recursive: true });
for (const [target, dir] of [
  ['chrome', 'dist'],
  ['firefox', 'dist-firefox'],
]) {
  const zip = join(out, `leettrace-${target}-${version}.zip`);
  rmSync(zip, { force: true });
  execFileSync('zip', ['-qr', '-X', zip, '.'], { cwd: join(root, dir) });
  console.log('packaged', zip);
}
