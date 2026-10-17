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
      matches: ['https://leetcode.com/problems/*'],
      js: ['src/content/index.tsx'],
      run_at: 'document_idle',
    },
  ],
  permissions: ['storage', 'scripting'],
  host_permissions: ['https://leetcode.com/problems/*', 'http://127.0.0.1/*'],
});
