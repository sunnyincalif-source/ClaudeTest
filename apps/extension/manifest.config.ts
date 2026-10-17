import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  name: 'LeetTrace',
  description:
    'See your Python solution execute on the problem page: call stack, heap, pointer arrows, and a reason per step. Runs locally.',
  version: pkg.version,
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
  permissions: ['storage', 'scripting'],
  host_permissions: ['https://leetcode.com/*', 'http://127.0.0.1/*'],
});
