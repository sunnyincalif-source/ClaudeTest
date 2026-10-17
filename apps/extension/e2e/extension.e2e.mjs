// Extension e2e: unpacked MV3 extension in Chromium + the real engine. The LeetCode problem
// URL is served from a local mock page (this environment can't reach leetcode.com), so the
// content script, background worker, CORS/origin checks, automatic pairing (engine page →
// externally_connectable → extension) and tracing all run for real. Also covers surviving an
// app restart, a browser restart and a token rotation with no re-pairing, and the corrected
// "Apps on device" message when Chrome blocks the connection.
//   node e2e/extension.e2e.mjs
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
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

const profile = mkdtempSync(join(tmpdir(), 'lt-prof-'));
// Problem URLs are served from the reconstructed problem-page fixtures (e2e/fixtures).
const fixture = (slug) => readFileSync(join(here, 'fixtures', `${slug}.html`), 'utf8');
async function launchBrowser() {
  const c = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1400, height: 950 },
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
  });
  // Chrome asks the user before leetcode.com may reach 127.0.0.1 ("Apps on device"); a real
  // user clicks "Allow" once. Headless can't click the bubble, so grant it here.
  await c.grantPermissions(['local-network-access'], { origin: 'https://leetcode.com' });
  await c.route('https://leetcode.com/**', (route) => {
    const slug = /\/problems\/([a-z0-9-]+)/.exec(new URL(route.request().url()).pathname)?.[1];
    const body = slug
      ? fixture(slug)
      : '<!doctype html><html><body><div id="__next">Problem list</div></body></html>';
    return route.fulfill({ status: 200, contentType: 'text/html', body });
  });
  return c;
}
let ctx = await launchBrowser();
let page = ctx.pages()[0] ?? (await ctx.newPage());
const engineTabs = () => ctx.pages().filter((p) => p.url().startsWith('http://127.0.0.1')).length;
async function spaNavigate(slug) {
  // What LeetCode does on "next problem": pushState + re-render, no page load.
  await page.evaluate(
    ({ slug, html }) => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      history.pushState(null, '', `/problems/${slug}/`);
      document.body.innerHTML = doc.body.innerHTML;
      for (const s of doc.querySelectorAll('script')) (0, eval)(s.textContent);
    },
    { slug, html: fixture(slug) },
  );
}
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
await spaNavigate('two-sum');
await page.locator('#leettrace-trace-button').waitFor({ timeout: 5000 });
check(true, 'Trace button appears after in-app navigation to a problem');

// 1) Engine OFF → a clear start-the-app prompt (no terminal language), never a silent failure.
await page.goto(PROBLEM);
await page.locator('#leettrace-trace-button').waitFor({ timeout: 10000 });
check(true, 'Trace button injected beside Run');
await page.locator('#leettrace-trace-button').click();
let panel = page.locator('#leettrace-root');
await panel.getByText('Start the LeetTrace app').waitFor({ timeout: 15000 });
check(
  !(await panel.locator('.ltx-body').innerText()).includes('leettrace start'),
  'app off → "Start the LeetTrace app" (no terminal command)',
);
if (shotDir) await page.screenshot({ path: join(shotDir, 'ext-offline.png') });

// 2) Start the desktop app (as the login item does). The panel's auto-retry finds it and the
//    extension connects automatically: the engine's page hands over the token. No code.
const env = { ...process.env, LEETTRACE_HOME: home };
let out = '';
function startApp() {
  const p = spawn('uv', ['run', '--project', engineDir, 'leettrace', 'app', '--background'], {
    env,
  });
  p.stdout.on('data', (d) => (out += d));
  p.stderr.on('data', (d) => (out += d));
  return p;
}
async function stopApp(p) {
  await new Promise((res) =>
    spawn('uv', ['run', '--project', engineDir, 'leettrace', 'stop'], { env }).on('exit', res),
  );
  await new Promise((res) => (p.exitCode !== null ? res() : p.on('exit', res)));
}
let daemon = startApp();
await panel.getByText('Test cases', { exact: true }).waitFor({ timeout: 40000 });
if (process.env.DEBUG) console.log('[app]', out);
check(true, 'app started → panel connected automatically (auto-retry + handshake)');
check(
  await panel.locator('.ltx-conn').isVisible(),
  'header shows the "connected" status — no code was typed',
);
await sleep(1500);
check(engineTabs() === 0, 'the background connect tab closed itself');
const cases = await panel.locator('.ltx-case').allInnerTexts();
check(
  cases.length === 3 &&
    cases[0].includes('nums = [2,7,11,15], target = 9') &&
    cases[1].includes('[1,2]'),
  `examples scraped: ${JSON.stringify(cases)}`,
);

// 4) Trace: live stack/heap/arrows for the editor's code against the examples.
await panel.getByRole('button', { name: 'Trace my code' }).click();
await panel.locator('.lt-viz').waitFor({ timeout: 20000 });
check((await panel.locator('.lt-test').innerText()).includes('Passed'), 'case 1 passes');
check((await panel.getByRole('tab').count()) === 3, 'one result tab per example case');
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

// 4b) Problem → problem with no page load: button re-attaches, panel re-reads, trace works.
await spaNavigate('reverse-linked-list');
await page.locator('#leettrace-trace-button').waitFor({ timeout: 5000 });
await panel.getByText('head = [1,2,3,4,5]').waitFor({ timeout: 5000 });
check(
  (await panel.locator('.lt-viz').count()) === 0,
  'SPA navigation: old results cleared, new examples read',
);
await page.locator('#leettrace-trace-button').click();
await panel.locator('.lt-test').first().waitFor({ timeout: 20000 });
check(
  (await panel.locator('.lt-test').innerText()).includes('Passed'),
  'SPA navigation: tracing the next problem passes',
);
await panel.getByLabel('Timeline').fill('12');
await sleep(300);
check(
  Number(await panel.locator('.lt-arrows').getAttribute('data-edge-count')) >= 3,
  'SPA navigation: linked-list arrows drawn',
);
if (shotDir) await page.screenshot({ path: join(shotDir, 'ext-spa.png') });

// 5) App restart: the token persists, so the open tab just keeps working — no re-pairing.
await stopApp(daemon);
daemon = startApp();
for (let i = 0; i < 100 && !existsSync(join(home, 'session.json')); i++) await sleep(150);
await sleep(500);
await page.locator('#leettrace-trace-button').click();
await panel.locator('.lt-test').first().waitFor({ timeout: 20000 });
check(
  (await panel.locator('.lt-test').innerText()).includes('Passed') && engineTabs() === 0,
  'app restart → Trace works again with no re-pairing (no connect tab needed)',
);

// 6) Browser restart: the connection is remembered.
await ctx.close();
ctx = await launchBrowser();
page = ctx.pages()[0] ?? (await ctx.newPage());
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(PROBLEM);
await page.locator('#leettrace-trace-button').waitFor({ timeout: 10000 });
panel = page.locator('#leettrace-root');
await page.locator('#leettrace-trace-button').click();
await panel.locator('.lt-test').first().waitFor({ timeout: 20000 });
check(
  (await panel.locator('.lt-test').innerText()).includes('Passed'),
  'browser restart → still connected, traces immediately',
);

// 7) A rotated token re-handshakes silently through the engine's page.
await stopApp(daemon);
await new Promise((res) =>
  spawn('uv', ['run', '--project', engineDir, 'leettrace', 'token', '--rotate'], { env }).on(
    'exit',
    res,
  ),
);
daemon = startApp();
for (let i = 0; i < 100 && !existsSync(join(home, 'session.json')); i++) await sleep(150);
await sleep(500);
await page.locator('#leettrace-trace-button').click();
await panel.getByText('Test cases', { exact: true }).waitFor({ timeout: 30000 });
await panel.getByRole('button', { name: 'Trace my code' }).click();
await panel.locator('.lt-test').first().waitFor({ timeout: 20000 });
check(
  (await panel.locator('.lt-test').innerText()).includes('Passed'),
  'rotated token → reconnected automatically, no code',
);

// 8) The page's own scripts can't see the token (it lives in extension storage).
// 5) The page's own scripts can't see the token (it lives in extension storage).
const leaked = await page.evaluate(() => JSON.stringify(localStorage) + document.cookie);
check(!leaked.includes('token'), 'token not exposed to the page');

// 9) Chrome blocks the connection ("Apps on device" denied): say so, and name the setting.
await ctx.clearPermissions();
const blocked = await ctx.newPage();
const cdp = await ctx.newCDPSession(blocked);
await cdp.send('Browser.setPermission', {
  permission: { name: 'local-network-access' },
  setting: 'denied',
  origin: 'https://leetcode.com',
});
await blocked.goto('https://leetcode.com/problems/two-sum/');
await blocked.locator('#leettrace-trace-button').waitFor({ timeout: 10000 });
await blocked.locator('#leettrace-trace-button').click();
const bp = blocked.locator('#leettrace-root');
await bp.getByText('Chrome is blocking the connection').waitFor({ timeout: 20000 });
check(
  (await bp.locator('.ltx-body').innerText()).includes('Apps on device'),
  'blocked → names the current Chrome setting ("Apps on device") with steps',
);
if (shotDir) await blocked.screenshot({ path: join(shotDir, 'ext-blocked.png') });

check(errors.length === 0, `no page errors ${errors.length ? JSON.stringify(errors) : ''}`);
await ctx.close();
await stopApp(daemon);
process.exit(failures ? 1 : 0);
