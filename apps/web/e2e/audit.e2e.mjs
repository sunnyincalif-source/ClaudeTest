// Accessibility + layout audit of the local web UI against a real engine.
//   node e2e/audit.e2e.mjs   → axe-core (WCAG 2.1 AA) in light + dark, and a 380px layout check
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const engineDir = resolve(import.meta.dirname, '../../../packages/engine');
const home = mkdtempSync(join(tmpdir(), 'lt-audit-'));
const env = { ...process.env, LEETTRACE_HOME: home };
const port = 48131;
const shotDir = process.env.SHOT_DIR;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (c, m) => {
  console.log(`${c ? 'PASS' : 'FAIL'} ${m}`);
  if (!c) failures++;
};

const daemon = spawn(
  'uv',
  ['run', '--project', engineDir, 'leettrace', 'start', '--port', String(port), '--no-open'],
  { env },
);
let session;
for (let i = 0; i < 100 && !session; i++) {
  await sleep(150);
  try {
    session = JSON.parse(readFileSync(join(home, 'session.json'), 'utf8'));
  } catch {}
}
execFileSync(
  'uv',
  [
    'run',
    '--project',
    engineDir,
    'leettrace',
    'run',
    join(engineDir, 'tests/programs/bst_insert_inorder.py'),
    '--no-open',
  ],
  { env },
);
const base = `http://127.0.0.1:${port}/`;
const browser = await chromium.launch();

async function audit(name, { width = 1360, theme = 'light', setup } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme });
  const page = await ctx.newPage();
  await page.goto(`${base}#t=${session.token}`);
  await page.getByText('Engine connected').waitFor();
  if (setup) await setup(page);
  await sleep(400);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const v = results.violations.map((x) => `${x.id} (${x.nodes.length}): ${x.nodes[0]?.target}`);
  check(v.length === 0, `axe ${name}${v.length ? ' → ' + v.join(' | ') : ''}`);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  check(overflow <= 0, `${name}: no horizontal page scroll (overflow ${overflow}px)`);
  if (shotDir) await page.screenshot({ path: join(shotDir, `audit-${name}.png`), fullPage: true });
  await ctx.close();
}

await audit('live-light', { setup: (p) => p.getByLabel('Timeline').fill('40') });
await audit('live-dark', { theme: 'dark', setup: (p) => p.getByLabel('Timeline').fill('40') });
await audit('practice', { setup: (p) => p.getByRole('button', { name: 'Practice' }).click() });
await audit('mobile-380', { width: 380, setup: (p) => p.getByLabel('Timeline').fill('40') });
{
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(base);
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  check(r.violations.length === 0, `axe onboarding ${r.violations.map((x) => x.id).join(',')}`);
  await ctx.close();
}
await browser.close();
execFileSync('uv', ['run', '--project', engineDir, 'leettrace', 'stop'], { env });
daemon.kill();
console.log(`session=${home}`);
process.exit(failures ? 1 : 0);
