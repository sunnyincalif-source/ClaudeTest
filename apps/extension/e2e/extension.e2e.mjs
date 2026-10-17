// Extension e2e: unpacked MV3 extension in Chromium + the real engine. The LeetCode problem
// URL is served from a local mock page (this environment can't reach leetcode.com), so the
// content script, background worker, CORS/origin checks, pairing and tracing all run for real.
//   node e2e/extension.e2e.mjs
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const here = import.meta.dirname;
const extDir = resolve(here, '../dist');
const engineDir = resolve(here, '../../../packages/engine');
const home = mkdtempSync(join(tmpdir(), 'lt-ext-'));
const shotDir = process.env.SHOT_DIR;
const PROBLEM = 'https://leetcode.com/problems/two-sum/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (c, m) => {
  console.log(`${c ? 'PASS' : 'FAIL'} ${m}`);
  if (!c) failures++;
};

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'lt-prof-')), {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1400, height: 950 },
  args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
});
// Chrome asks the user before leetcode.com may reach 127.0.0.1 (Local Network Access);
// a real user clicks "Allow" once. Headless can't click the bubble, so grant it here.
await ctx.grantPermissions(['local-network-access'], { origin: 'https://leetcode.com' });
await ctx.route('https://leetcode.com/**', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: readFileSync(join(here, 'mock-problem.html'), 'utf8'),
  }),
);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
if (process.env.DEBUG) page.on('console', (m) => console.log('[console]', m.type(), m.text()));
if (process.env.DEBUG)
  page.on('requestfailed', (r) => console.log('[reqfail]', r.url(), r.failure()?.errorText));

// 0) Client-side navigation (problem list → problem, no page load) still gets the button.
await page.goto('https://leetcode.com/problemset/');
await sleep(1500);
check(
  (await page.locator('#leettrace-trace-button').count()) === 0,
  'no Trace button off problem pages',
);
await page.evaluate(() => {
  history.pushState(null, '', '/problems/two-sum/');
  document.body.appendChild(document.createElement('div')); // LeetCode re-renders on route change
});
await page.locator('#leettrace-trace-button').waitFor({ timeout: 5000 });
check(true, 'Trace button appears after in-app navigation to a problem');

// 1) Engine OFF → a clear start-the-app prompt, never a silent failure.
await page.goto(PROBLEM);
await page.locator('#leettrace-trace-button').waitFor({ timeout: 10000 });
check(true, 'Trace button injected beside Run');
await page.locator('#leettrace-trace-button').click();
const panel = page.locator('#leettrace-root');
await panel.getByText('Start the LeetTrace app').waitFor({ timeout: 15000 });
check(true, 'daemon off → "Start the LeetTrace app (leettrace start)" prompt');
if (shotDir) await page.screenshot({ path: join(shotDir, 'ext-offline.png') });

// 2) Start the engine; Retry finds it and asks to pair.
const env = { ...process.env, LEETTRACE_HOME: home };
const daemon = spawn('uv', ['run', '--project', engineDir, 'leettrace', 'start', '--no-open'], {
  env,
});
let out = '';
daemon.stdout.on('data', (d) => (out += d));
daemon.stderr.on('data', (d) => (out += d));
for (let i = 0; i < 100 && !out.includes('Listening'); i++) await sleep(150);
await panel.getByRole('button', { name: 'Retry' }).click();
if (process.env.DEBUG) console.log('[daemon]', out);
await panel.getByText('Connect to your engine').waitFor({ timeout: 10000 });
check(true, 'engine found → pairing prompt');

// 3) Pair with the code printed in the terminal.
await panel.getByRole('button', { name: 'Connect' }).click();
for (let i = 0; i < 50 && !/\d{3}-\d{3}/.test(out); i++) await sleep(100);
const code = /(\d{3}-\d{3})/.exec(out)?.[1];
check(!!code, `pairing code shown in terminal (${code})`);
await panel.getByLabel('Pairing code').fill('000-000');
await panel.getByRole('button', { name: 'Pair' }).click();
await panel.getByText('didn’t match').waitFor({ timeout: 5000 });
check(true, 'wrong code rejected');
await panel.getByLabel('Pairing code').fill(code);
await panel.getByRole('button', { name: 'Pair' }).click();
await panel.getByText('Test cases').waitFor({ timeout: 10000 });
check(true, 'paired → scraped example cases shown');
const cases = await panel.locator('.ltx-case').allInnerTexts();
check(
  cases.length === 2 &&
    cases[0].includes('nums = [2,7,11,15], target = 9') &&
    cases[1].includes('[1,2]'),
  `examples scraped: ${JSON.stringify(cases)}`,
);

// 4) Trace: live stack/heap/arrows for the editor's code against the examples.
await panel.getByRole('button', { name: 'Trace my code' }).click();
await panel.locator('.lt-viz').waitFor({ timeout: 20000 });
check((await panel.locator('.lt-test').innerText()).includes('Passed'), 'case 1 passes');
check((await panel.getByRole('tab').count()) === 2, 'one result tab per example case');
await panel.getByLabel('Timeline').fill('8');
await sleep(400);
const frames = await panel.locator('.lt-frame-name').allInnerTexts();
check(
  frames.length === 1 && frames[0] === 'twoSum()',
  `only the user's frames shown: ${JSON.stringify(frames)}`,
);
check(
  Number(await panel.locator('.lt-arrows').getAttribute('data-edge-count')) >= 2,
  'pointer arrows drawn in the panel',
);
if (shotDir) await page.screenshot({ path: join(shotDir, 'ext-trace.png') });
if (process.env.FRAMES_DIR) {
  // Demo clip: step through case 1 inside the LeetCode tab.
  const { mkdirSync } = await import('node:fs');
  mkdirSync(process.env.FRAMES_DIR, { recursive: true });
  await page.mouse.move(5, 5);
  const total = await panel.getByLabel('Timeline').getAttribute('max');
  for (let i = 0; i <= Number(total); i++) {
    await panel.getByLabel('Timeline').fill(String(i));
    await panel.getByLabel('Timeline').evaluate((el) => el.blur());
    await sleep(350);
    await page.screenshot({
      path: join(process.env.FRAMES_DIR, `${String(i).padStart(4, '0')}.png`),
    });
  }
}

// 5) The page's own scripts can't see the token (it lives in extension storage).
const leaked = await page.evaluate(() => JSON.stringify(localStorage) + document.cookie);
check(!leaked.includes('token'), 'token not exposed to the page');

check(errors.length === 0, `no page errors ${errors.length ? JSON.stringify(errors) : ''}`);
await ctx.close();
spawn('uv', ['run', '--project', engineDir, 'leettrace', 'stop'], { env }).on('exit', () => {
  daemon.kill();
  process.exit(failures ? 1 : 0);
});
