import { createServer } from 'node:http';
import { expect, test } from '@playwright/test';
import { renderInteractivePlayer, type InteractiveManifest } from '../src/interactive';

const video = Buffer.from('AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAM1bW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAA+gAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAl90cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAA+gAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAPoAAAAAAABAAAAAAHXbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAoAAAAKABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABgm1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAUJzdGJsAAAAtnN0c2QAAAAAAAAAAQAAAKZhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABFUxhdmM2Mi4yOC4xMDEgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAALGF2Y0MBQsAK/+EAFWdCwAraewEQAAADABAAAAMAoPEiagEABGjOD8gAAAAQcGFzcAAAAAEAAAABAAAAFGJ0cnQAAAAAAAAUSAAAAAAAAAAYc3R0cwAAAAAAAAABAAAABQAACAAAAAAUc3RzcwAAAAAAAAABAAAAAQAAABxzdHNjAAAAAAAAAAEAAAABAAAABQAAAAEAAAAoc3RzegAAAAAAAAAAAAAABQAAAmUAAAAJAAAACQAAAAkAAAAJAAAAFHN0Y28AAAAAAAAAAQAAA2UAAABidWR0YQAAAFptZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAAAAAAAAAAAC1pbHN0AAAAJal0b28AAAAdZGF0YQAAAAEAAAAATGF2ZjYyLjEyLjEwMQAAAAhmcmVlAAACkW1kYXQAAAJTBgX//0/cRem95tlIt5Ys2CDZI+7veDI2NCAtIGNvcmUgMTY1IHIzMjIzIDA0ODBjYjAgLSBILjI2NC9NUEVHLTQgQVZDIGNvZGVjIC0gQ29weWxlZnQgMjAwMy0yMDI1IC0gaHR0cDovL3d3dy52aWRlb2xhbi5vcmcveDI2NC5odG1sIC0gb3B0aW9uczogY2FiYWM9MCByZWY9MSBkZWJsb2NrPTA6MDowIGFuYWx5c2U9MDowIG1lPWRpYSBzdWJtZT0wIHBzeT0xIHBzeV9yZD0xLjAwOjAuMDAgbWl4ZWRfcmVmPTAgbWVfcmFuZ2U9MTYgY2hyb21hX21lPTEgdHJlbGxpcz0wIDh4OGRjdD0wIGNxbT0wIGRlYWR6b25lPTIxLDExIGZhc3RfcHNraXA9MSBjaHJvbWFfcXBfb2Zmc2V0PTAgdGhyZWFkcz0xIGxvb2thaGVhZF90aHJlYWRzPTEgc2xpY2VkX3RocmVhZHM9MCBucj0wIGRlY2ltYXRlPTEgaW50ZXJsYWNlZD0wIGJsdXJheV9jb21wYXQ9MCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MCB3ZWlnaHRwPTAga2V5aW50PTI1MCBrZXlpbnRfbWluPTUgc2NlbmVjdXQ9MCBpbnRyYV9yZWZyZXNoPTAgcmM9Y3JmIG1idHJlZT0wIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTAAgAAAAApliIQ6JigACQLgAAAABUGaID6UAAAABUGaQD6UAAAABUGaYBClAAAABUGagBCl', 'base64');

const manifest: InteractiveManifest = {
  v: 1,
  recordingId: 'rec_e2e',
  width: 1_920,
  height: 1_080,
  steps: [
    { eventId: 'one', timeMs: 200, label: 'First target', box: { x: 192, y: 108, width: 384, height: 216 } },
    { eventId: 'two', timeMs: 500, label: 'Second target', box: { x: 960, y: 540, width: 480, height: 270 } },
  ],
};

test('every player control and hotspot completes the linear flow', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });
  const html = renderInteractivePlayer(manifest);
  const server = createServer((request, response) => {
    if (request.url === '/demo.mp4') {
      response.writeHead(200, { 'content-type': 'video/mp4', 'content-length': video.length });
      response.end(video);
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(html);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('fixture server did not expose a port');

  try {
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.getByRole('button', { name: 'Start demo' }).click();
    const hotspot = page.locator('#hotspot');
    await expect(hotspot).toBeVisible();
    await expect(page.locator('#step-heading')).toHaveText('STEP 01 / 02');

    const stage = await page.locator('#stage').boundingBox();
    const videoBox = await page.locator('#video').boundingBox();
    const first = await hotspot.boundingBox();
    if (!stage || !videoBox || !first) throw new Error('player geometry is unavailable');
    await page.mouse.click(stage.x + stage.width - 5, stage.y + 5);
    await expect(page.locator('#step-heading')).toHaveText('STEP 01 / 02');
    const expected = manifest.steps[0]!.box;
    const errors = [
      Math.abs(first.x - (videoBox.x + expected.x / manifest.width * videoBox.width)),
      Math.abs(first.y - (videoBox.y + expected.y / manifest.height * videoBox.height)),
      Math.abs(first.width - expected.width / manifest.width * videoBox.width),
      Math.abs(first.height - expected.height / manifest.height * videoBox.height),
    ];
    expect(Math.max(...errors)).toBeLessThanOrEqual(4);

    await page.getByRole('button', { name: 'Restart' }).click();
    await expect(page.getByRole('button', { name: 'Start demo' })).toBeVisible();
    await page.getByRole('button', { name: 'Start demo' }).click();
    await page.getByRole('button', { name: 'Click First target' }).click();
    await expect(page.getByRole('button', { name: 'Click Second target' })).toBeVisible();
    const second = await hotspot.boundingBox();
    const secondVideoBox = await page.locator('#video').boundingBox();
    if (!second || !secondVideoBox) throw new Error('second hotspot geometry is unavailable');
    const secondExpected = manifest.steps[1]!.box;
    errors.push(
      Math.abs(second.x - (secondVideoBox.x + secondExpected.x / manifest.width * secondVideoBox.width)),
      Math.abs(second.y - (secondVideoBox.y + secondExpected.y / manifest.height * secondVideoBox.height)),
      Math.abs(second.width - secondExpected.width / manifest.width * secondVideoBox.width),
      Math.abs(second.height - secondExpected.height / manifest.height * secondVideoBox.height),
    );
    expect(Math.max(...errors)).toBeLessThanOrEqual(4);
    await page.getByRole('button', { name: 'Click Second target' }).click();
    await expect(page.getByText('DEMO COMPLETE', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Replay' }).click();
    await expect(page.getByRole('button', { name: 'Click First target' })).toBeVisible();
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Click Second target' })).toBeVisible();
    expect(browserErrors).toEqual([]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
