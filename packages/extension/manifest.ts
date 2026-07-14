import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Cutscene',
  version: '0.1.0',
  minimum_chrome_version: '116',
  permissions: ['activeTab', 'audioCapture', 'tabCapture', 'tabs', 'offscreen', 'storage', 'downloads'],
  host_permissions: ['<all_urls>'],
  action: { default_title: 'Cutscene', default_popup: 'control.html' },
  background: { service_worker: 'src/background.ts', type: 'module' },
  content_scripts: [{ matches: ['http://*/*', 'https://*/*'], js: ['src/content.ts'], run_at: 'document_start' }],
});
