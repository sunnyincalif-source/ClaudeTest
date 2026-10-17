// Capture demo frames from the viz harness (serve it with `pnpm --filter @leettrace/viz harness`).
//   node scripts/demo/capture.mjs <outDir> <fixture> <fromStep> <toStep> [theme]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [, , out, fixture, from, to, theme = 'light'] = process.argv;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 820 },
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
});
await page.goto(`http://127.0.0.1:5175/?fixture=${fixture}&step=${from}&theme=${theme}`);
await page.waitForSelector('.lt-viz');
await page.addStyleTag({ content: '.lt-viz{max-width:1240px}' });
let n = 0;
for (let i = Number(from); i <= Number(to); i++) {
  await page.getByLabel('Timeline').fill(String(i));
  await page.waitForTimeout(120);
  await page
    .locator('.lt-viz')
    .screenshot({ path: join(out, `${String(n++).padStart(4, '0')}.png`) });
}
await browser.close();
console.log(`${n} frames → ${out}`);
