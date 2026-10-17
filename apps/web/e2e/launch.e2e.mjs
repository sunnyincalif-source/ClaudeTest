// Friendly launch (SPEC-LAUNCH A3/A4): `leettrace` with no subcommand — what double-clicking
// the app does — starts the engine and opens the welcome page with a copyable pairing code.
// A second launch while it's running just reopens the page. No terminal steps needed.
//   node e2e/launch.e2e.mjs
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const engineDir = resolve(import.meta.dirname, '../../../packages/engine');
const home = mkdtempSync(join(tmpdir(), 'lt-launch-'));
const opened = join(home, 'opened.txt');
// Python's webbrowser honours $BROWSER: record the URL instead of opening a real browser.
const fakeBrowser = join(home, 'browser.sh');
writeFileSync(fakeBrowser, `#!/bin/sh\necho "$1" >> "${opened}"\n`);
chmodSync(fakeBrowser, 0o755);
const env = { ...process.env, LEETTRACE_HOME: home, BROWSER: fakeBrowser };
const shotDir = process.env.SHOT_DIR;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (c, m) => {
  console.log(`${c ? 'PASS' : 'FAIL'} ${m}`);
  if (!c) failures++;
};
const urls = () => (existsSync(opened) ? readFileSync(opened, 'utf8').trim().split('\n') : []);

// 1) "Double-click": no subcommand.
const app = spawn('uv', ['run', '--project', engineDir, 'leettrace'], { env });
let out = '';
app.stdout.on('data', (d) => (out += d));
app.stderr.on('data', (d) => (out += d));
for (let i = 0; i < 150 && urls().length === 0; i++) await sleep(150);
const welcome = urls()[0];
check(
  !!welcome && /#t=.+&view=welcome/.test(welcome),
  `opened the welcome page (${welcome?.replace(/t=[^&]+/, 't=…')})`,
);
check(
  /Pairing code for the extension: .*\d{3}-\d{3}/.test(out),
  'terminal also shows the pairing code',
);

// 2) The welcome page: status, copyable code, extension download.
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1100, height: 1000 } });
await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(welcome);
await page.getByText('is running on this computer').waitFor({ timeout: 10000 });
const shown = (await page.locator('.pair-code').innerText()).trim();
check(/^\d{3}-\d{3}$/.test(shown), `pairing code shown on the page: ${shown}`);
await page.getByRole('button', { name: 'Copy code' }).click();
const clip = await page.evaluate(() => navigator.clipboard.readText());
check(clip === shown.replace('-', ''), 'Copy code puts the code on the clipboard');
const zip = page.getByRole('link', { name: /Download the extension/ });
check((await zip.count()) === 1, 'extension zip offered for download');
const [download] = await Promise.all([page.waitForEvent('download'), zip.click()]);
check(download.suggestedFilename() === 'leettrace-chrome-extension.zip', 'extension zip downloads');
check(!page.url().includes('t='), 'token not left in the address bar');
if (shotDir) await page.screenshot({ path: join(shotDir, 'welcome.png'), fullPage: true });

// 3) Pair the way the extension does (from leetcode.com) using the copied code → page notices.
const session = JSON.parse(readFileSync(join(home, 'session.json'), 'utf8'));
const r = await fetch(`http://127.0.0.1:${session.port}/pair/confirm`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: 'https://leetcode.com' },
  body: JSON.stringify({ code: clip }),
});
check(r.status === 200, 'the copied code pairs the extension');
await page.getByText('Extension connected').waitFor({ timeout: 8000 });
check(true, 'welcome page shows "Extension connected"');

// 4) Launch again while running: reopens the page, exits cleanly, no second engine.
const again = spawn('uv', ['run', '--project', engineDir, 'leettrace'], { env });
const code = await new Promise((res) => again.on('exit', res));
check(code === 0 && urls().length === 2, 'second launch reopens the welcome page and exits');

check(errors.length === 0, `no page errors ${errors.length ? JSON.stringify(errors) : ''}`);
await browser.close();
app.kill('SIGINT');
await new Promise((res) => app.on('exit', res));
process.exit(failures ? 1 : 0);
