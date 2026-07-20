import { expect, it } from 'vitest';
import type { InteractiveManifest } from './interactive';
import { demoKitArchive } from './demo-kit';

function names(zip: Uint8Array): string[] {
  const out: string[] = [];
  let offset = 0;
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  while (offset + 30 <= zip.length && view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    out.push(new TextDecoder().decode(zip.subarray(offset + 30, offset + 30 + nameLength)));
    offset += 30 + nameLength + extraLength + size;
  }
  return out;
}

it('packages publishable artifacts without raw recording data', async () => {
  const manifest: InteractiveManifest = {
    v: 1,
    recordingId: 'rec_kit',
    width: 1_920,
    height: 1_080,
    steps: [{ eventId: 'click', timeMs: 500, label: 'Save',
      box: { x: 10, y: 20, width: 30, height: 40 } }],
  };
  const archive = await demoKitArchive({
    mp4: new Blob([new TextEncoder().encode('ftyp')], { type: 'video/mp4' }),
    gif: new Blob([new TextEncoder().encode('GIF89a')], { type: 'image/gif' }),
    manifest,
    rendered: {
      steps: [{ index: 1, stepId: 'step_1', eventId: 'click', t: 500, route: '/',
        action: 'Click **Save**.', screenshot: 'screenshots/step-01.png',
        box: { x: 10, y: 20, width: 30, height: 40 } }],
      shots: [{ name: 'screenshots/step-01.png', data: new Uint8Array([137, 80, 78, 71]) }],
    },
    meta: { recordingId: 'rec_kit', url: 'https://example.com/' },
    skeleton: "await page.getByRole('button', { name: 'Save' }).click();",
  });

  expect(names(archive)).toEqual([
    'index.html', 'demo.mp4', 'demo.gif', 'docs.md',
    'screenshots/step-01.png', 'playwright.spec.ts',
  ]);
  const text = new TextDecoder().decode(archive);
  expect(text).toContain('GIF89a');
  expect(text).toContain('ftyp');
  expect(text).toContain("getByRole('button'");
  expect(text).not.toContain('raw-secret');
  expect(text).not.toContain('locators');
  expect(text).not.toContain('annotation.comment');
});
