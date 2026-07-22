import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Cutscene',
  version: '0.1.0',
  minimum_chrome_version: '116',
  permissions: ['activeTab', 'audioCapture', 'tabCapture', 'tabs', 'offscreen', 'storage', 'downloads'],
  host_permissions: ['<all_urls>'],
  action: { default_title: 'Cutscene', default_popup: 'control.html' },
  // The editor page renders GIF and MP4 with ffmpeg.wasm, which an extension page
  // may not instantiate without this. The core itself is served from our own origin.
  content_security_policy: { extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'" },
  background: { service_worker: 'src/background.ts', type: 'module' },
  content_scripts: [{ matches: ['http://*/*', 'https://*/*'], js: ['src/content.ts'], run_at: 'document_start' }],
});
