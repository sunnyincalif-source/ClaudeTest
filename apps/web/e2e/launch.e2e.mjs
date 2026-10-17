// Friendly launch (SPEC-PRODUCT §5/§6): `leettrace` with no subcommand — what opening the
// installed app does — starts the engine (desktop app) and, on first launch, opens the welcome
// page leading with "Add the extension" and turns on start-at-login. The extension connects
// automatically; a one-time code is only a hidden fallback. A second launch just reopens the
// page. No terminal steps needed.
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
const env = {
  ...process.env,
  LEETTRACE_HOME: home,
  BROWSER: fakeBrowser,
  XDG_CONFIG_HOME: join(home, 'config'), // start-at-login entry lands here, not in ~/.config
  HOME: home, // (macOS LaunchAgent path)
};
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
  !!welcome && /#t=.+&view=welcome&first=1/.test(welcome),
  `first launch opened the welcome page (${welcome?.replace(/t=[^&]+/, 't=…')})`,
);
check(
  existsSync(join(home, 'config', 'autostart', 'leettrace.desktop')) ||
    existsSync(join(home, 'Library', 'LaunchAgents', 'dev.leettrace.agent.plist')) ||
    process.platform === 'win32',
  'first launch turned on start-at-login',
);
check(!/pairing code/i.test(out), 'no pairing-code talk on launch');

// 2) The welcome page: status, "add the extension" first, no code in sight.
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1100, height: 1000 } });
await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(welcome);
await page.getByText('is running on this computer').waitFor({ timeout: 10000 });
check(
  await page.getByText('Welcome! One step left: add the browser extension').isVisible(),
  'first run leads with adding the extension',
);
check(!(await page.locator('.pair-code').isVisible()), 'no pairing code shown by default');
const zip = page.getByRole('link', { name: /Download the extension/ });
check((await zip.count()) === 1, 'extension zip offered for download');
const [download] = await Promise.all([page.waitForEvent('download'), zip.click()]);
check(download.suggestedFilename() === 'leettrace-chrome-extension.zip', 'extension zip downloads');
check(!page.url().includes('t='), 'token not left in the address bar');
if (shotDir) await page.screenshot({ path: join(shotDir, 'welcome.png'), fullPage: true });

// 3) The hidden fallback still works (e.g. Firefox): the one-time code pairs, page notices.
await page.getByText('Trouble connecting?').click();
await page
  .locator('.pair-code')
  .filter({ hasText: /\d{3}-\d{3}/ })
  .waitFor({ timeout: 8000 });
await page.getByRole('button', { name: 'Copy code' }).click();
const clip = await page.evaluate(() => navigator.clipboard.readText());
check(/^\d{6}$/.test(clip), 'fallback code copies');
const session = JSON.parse(readFileSync(join(home, 'session.json'), 'utf8'));
const r = await fetch(`http://127.0.0.1:${session.port}/pair/confirm`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: 'https://leetcode.com' },
  body: JSON.stringify({ code: clip }),
});
check(r.status === 200, 'the fallback code pairs');
await page.getByText('Extension connected automatically').waitFor({ timeout: 8000 });
check(true, 'welcome page shows the extension as connected');

// 3b) Opened without a token (e.g. by the extension): the page bootstraps it from the engine.
const bare = await ctx.newPage();
await bare.goto(`http://127.0.0.1:${session.port}/#view=connect`);
await bare.getByText('LeetTrace extension not found').waitFor({ timeout: 10000 });
check(true, 'token-less engine page bootstraps its token (connect view)');

// 4) Launch again while running: reopens the page, exits cleanly, no second engine.
const again = spawn('uv', ['run', '--project', engineDir, 'leettrace'], { env });
const code = await new Promise((res) => again.on('exit', res));
check(code === 0 && urls().length === 2, 'second launch reopens the welcome page and exits');

check(errors.length === 0, `no page errors ${errors.length ? JSON.stringify(errors) : ''}`);
await browser.close();
app.kill('SIGINT');
await new Promise((res) => app.on('exit', res));
check(!existsSync(join(home, 'session.json')), 'Ctrl+C stops the app cleanly');
process.exit(failures ? 1 : 0);
