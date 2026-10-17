import { defineManifest } from '@crxjs/vite-plugin';
import { EXTENSION_PUBLIC_KEY } from '@leettrace/schema';
import pkg from './package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  name: 'LeetTrace',
  description:
    'See your Python solution execute on the problem page: call stack, heap, pointer arrows, and a reason per step. Runs locally.',
  version: pkg.version,
  // Pins the extension ID (unpacked == Web Store) so the engine's page can reach it.
  key: EXTENSION_PUBLIC_KEY,
  icons: { '16': 'icons/icon16.png', '48': 'icons/icon48.png', '128': 'icons/icon128.png' },
  action: { default_title: 'LeetTrace', default_popup: 'src/popup/index.html' },
  background: { service_worker: 'src/background/index.ts', type: 'module' },
  content_scripts: [
    {
      // All of leetcode.com: LeetCode navigates client-side (list → problem) without a page
      // load, so the script must already be present and activate on /problems/ URLs.
      matches: ['https://leetcode.com/*'],
      js: ['src/content/index.tsx'],
      run_at: 'document_idle',
    },
  ],
  // The panel's bundled fonts, loaded by the content script via @font-face on leetcode.com.
  web_accessible_resources: [
    { resources: ['assets/*.woff2'], matches: ['https://leetcode.com/*'] },
  ],
  // Automatic pairing (SPEC-PRODUCT §6): only the engine's own page on this computer may
  // message the extension, to hand over the session token. No code shown or typed.
  externally_connectable: { matches: ['http://127.0.0.1:*/*', 'http://localhost:*/*'] },
  permissions: ['storage', 'scripting'],
  host_permissions: ['https://leetcode.com/*', 'http://127.0.0.1/*'],
});
