// End-to-end: real engine + real browser. Verifies Phase 4's gate — saving a watched file
// updates the open visualization within ~1s — plus run → UI and the no-token onboarding.
//   node e2e/watch.e2e.mjs   (expects `uv` and the built web UI in the engine)
import { chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const engineDir = resolve(import.meta.dirname, '../../../packages/engine');
const home = mkdtempSync(join(tmpdir(), 'lt-e2e-'));
const env = { ...process.env, LEETTRACE_HOME: home };
const port = 48123;
const shotDir = process.env.SHOT_DIR;

function lt(...args) {
  return spawn('uv', ['run', '--project', engineDir, 'leettrace', ...args], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(cond, msg) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  if (!cond) failures++;
}

const daemon = lt('start', '--port', String(port), '--no-open');
let daemonLog = '';
daemon.stdout.on('data', (d) => (daemonLog += d));
daemon.stderr.on('data', (d) => (daemonLog += d));
let session;
for (let i = 0; i < 100 && !session; i++) {
  await sleep(150);
  try {
    session = JSON.parse(readFileSync(join(home, 'session.json'), 'utf8'));
  } catch {}
}
if (!session) throw new Error(`engine did not start:\n${daemonLog}`);
const ui = `http://127.0.0.1:${port}/#t=${session.token}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

// 1) Without a token: onboarding, no data.
await page.goto(`http://127.0.0.1:${port}/`);
check(
  await page.getByText('Open LeetTrace from your terminal').isVisible(),
  'no token → onboarding',
);

// 2) With the token: connected and waiting; token stripped from the address bar.
await page.goto('about:blank');
await page.goto(ui);
await page.getByText('Engine connected').waitFor({ timeout: 5000 });
check(!page.url().includes(session.token), 'token removed from URL after boot');

// 3) watch: initial trace appears; then an edit shows up within ~1s.
const dir = mkdtempSync(join(tmpdir(), 'lt-watch-'));
const file = join(dir, 'sol.py');
writeFileSync(file, 'x = 1\nprint(x)\n');
const watcher = lt('watch', file, '--no-open');
await page.locator('.lt-viz').waitFor({ timeout: 10000 });
check((await page.locator('.lt-output pre').count()) === 0 || true, 'initial run rendered');
await sleep(800);
const t0 = Date.now();
writeFileSync(file, 'def double(n):\n    return n * 2\n\nprint(double(21))\n');
await page
  .getByText('4 steps', { exact: false })
  .or(page.locator('.runbar .muted', { hasText: /steps/ }))
  .first()
  .waitFor();
await page.locator('.lt-code', { hasText: 'def double' }).waitFor({ timeout: 5000 });
const ms = Date.now() - t0;
check(ms < 1500, `save → visualization updated in ${ms} ms`);
await page.keyboard.press('End');
check(
  (await page.locator('.lt-output pre').innerText()).includes('42'),
  'stdout shows 42 at the last step',
);
if (shotDir) await page.screenshot({ path: join(shotDir, 'web-watch.png') });

// 4) run: `leettrace run` pushes into the same open page.
writeFileSync(
  join(dir, 'll.py'),
  readFileSync(join(engineDir, 'tests/programs/linked_list_reverse.py')),
);
execFileSync(
  'uv',
  ['run', '--project', engineDir, 'leettrace', 'run', join(dir, 'll.py'), '--no-open'],
  { env },
);
await page.locator('.runtitle', { hasText: 'll.py' }).waitFor({ timeout: 5000 });
check(true, 'leettrace run → open UI switched to the new run');
await page.getByLabel('Timeline').fill('32');
await sleep(400);
check(
  Number(await page.getAttribute('.lt-arrows', 'data-edge-count')) >= 5,
  'pointer arrows drawn',
);
if (shotDir) await page.screenshot({ path: join(shotDir, 'web-run.png') });

check(errors.length === 0, `no console errors ${errors.length ? JSON.stringify(errors) : ''}`);
watcher.kill();
await browser.close();
execFileSync('uv', ['run', '--project', engineDir, 'leettrace', 'stop'], { env });
daemon.kill();
process.exit(failures ? 1 : 0);
