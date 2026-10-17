// Inline the server-rendered page into dist/index.html (static prerender, no server needed).
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ssr = join(root, 'dist-ssr');
const { render } = await import(pathToFileURL(join(ssr, 'entry-server.js')).href);
const file = join(root, 'dist', 'index.html');
const html = readFileSync(file, 'utf8');
if (!html.includes('<div id="root"></div>')) throw new Error('prerender: #root not found');
// Preload the two hero faces so the first paint already uses them (no late font swap).
const fonts = readdirSync(join(root, 'dist', 'assets')).filter((f) =>
  /^geist-sans-latin-(400|700)-normal-.*\.woff2$/.test(f),
);
const preload = fonts
  .map((f) => `<link rel="preload" as="font" type="font/woff2" href="/assets/${f}" crossorigin />`)
  .join('\n    ');
writeFileSync(
  file,
  html
    .replace('</title>', `</title>\n    ${preload}`)
    .replace('<div id="root"></div>', `<div id="root">${render()}</div>`),
);
rmSync(ssr, { recursive: true, force: true });
console.log('prerendered dist/index.html');
