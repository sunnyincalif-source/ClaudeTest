// Zip the built extension (cross-platform, no `zip` binary needed):
//   release/leettrace-chrome-extension.zip   (Chrome / Edge / Brave, "Load unpacked" or store)
//   release/leettrace-firefox-extension.zip  (Firefox)
// Asset names carry no version so https://github.com/<repo>/releases/latest/download/<name>
// always resolves. The Chrome zip is also copied into the engine, whose welcome page serves it.
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';
import { zipSync } from 'fflate';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'release');
const engineDist = join(
  root,
  '..',
  '..',
  'packages',
  'engine',
  'src',
  'leettrace',
  'extension_dist',
);
mkdirSync(out, { recursive: true });
mkdirSync(engineDist, { recursive: true });

function files(dir) {
  const result = {};
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else
        result[relative(dir, p).split(sep).join('/')] = [
          readFileSync(p),
          { mtime: new Date('2020-01-01') },
        ];
    }
  };
  walk(dir);
  return result;
}

for (const [target, dir] of [
  ['chrome', 'dist'],
  ['firefox', 'dist-firefox'],
]) {
  const zip = join(out, `leettrace-${target}-extension.zip`);
  writeFileSync(zip, zipSync(files(join(root, dir)), { level: 9 }));
  console.log('packaged', relative(root, zip));
}
copyFileSync(
  join(out, 'leettrace-chrome-extension.zip'),
  join(engineDist, 'leettrace-chrome-extension.zip'),
);
console.log('copied Chrome zip into the engine (served on the welcome page)');
