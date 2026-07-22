import { crx } from '@crxjs/vite-plugin';
import { defineConfig, type Plugin } from 'vite';
import manifest from './manifest';

// MV3 forbids remotely hosted code, and the listing says the extension loads none.
// @ffmpeg/ffmpeg's worker carries a CDN default for the case where no coreURL is
// given. We always give one, and the page CSP would block it anyway, but a shipped
// importScripts(<cdn>) is the exact thing a store reviewer greps for. Remove it, then
// refuse to build if any executable remote reference survives anywhere in the bundle.
function noRemoteCode(): Plugin {
  const hosts = /https?:\/\/(unpkg\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)[^"'`\s)]*/g;
  return {
    name: 'cutscene-no-remote-code',
    generateBundle(_options, bundle) {
      for (const [name, output] of Object.entries(bundle)) {
        if (output.type !== 'chunk') continue;
        output.code = output.code.replace(hosts, '');
        const offender = /(?:importScripts|fetch|import)\s*\(\s*["'`]https?:/.exec(output.code) ??
          hosts.exec(output.code);
        if (offender) throw new Error(`${name} still loads remote code: ${offender[0]}`);
      }
    },
  };
}

export default defineConfig({
  plugins: [crx({ manifest }), noRemoteCode()],
  // Workers are a separate rollup build, and the ffmpeg worker is where the CDN default lives.
  worker: { plugins: () => [noRemoteCode()] },
  build: { rollupOptions: { input: { control: 'control.html', offscreen: 'offscreen.html', editor: 'editor.html' } } },
});
