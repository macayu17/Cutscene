import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Cutscene',
  version: '0.2.0',
  minimum_chrome_version: '116',
  // Every permission here is proven by a call site. `tabs` is absent because nothing
  // reads a tab's url or title (tabs.query takes only the id, tabs.create and
  // tabs.sendMessage need no permission), and host_permissions is absent because the
  // content script is declared statically and nothing makes a cross-origin request.
  permissions: ['activeTab', 'audioCapture', 'tabCapture', 'offscreen', 'storage', 'downloads'],
  icons: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' },
  action: { default_title: 'Cutscene', default_popup: 'control.html',
    default_icon: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' } },
  // The editor page renders GIF and MP4 with ffmpeg.wasm, which an extension page
  // may not instantiate without this. The core itself is served from our own origin.
  content_security_policy: { extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'" },
  background: { service_worker: 'src/background.ts', type: 'module' },
  content_scripts: [{ matches: ['http://*/*', 'https://*/*'], js: ['src/content.ts'], run_at: 'document_start' }],
});
