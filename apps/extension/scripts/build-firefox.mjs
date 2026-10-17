// Derive a Firefox MV3 build from the Chrome build: Firefox uses `background.scripts`
// (event page) instead of a service worker, and needs a gecko id.
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'dist');
const dest = join(root, 'dist-firefox');
rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
const manifestPath = join(dest, 'manifest.json');
const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (m.background?.service_worker) {
  m.background = { scripts: [m.background.service_worker], type: 'module' };
}
m.browser_specific_settings = {
  gecko: { id: 'leettrace@leettrace.dev', strict_min_version: '128.0' },
};
// Chrome-only: the pinned key and externally_connectable (Firefox pairs with the manual code).
delete m.key;
delete m.externally_connectable;
delete m.use_dynamic_url;
for (const war of m.web_accessible_resources ?? []) delete war.use_dynamic_url;
writeFileSync(manifestPath, JSON.stringify(m, null, 2));
console.log('firefox build ->', dest);
