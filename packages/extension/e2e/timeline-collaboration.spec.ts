import { createServer as createProbe } from 'node:http';
import { once } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, expect, test } from '@playwright/test';
import { createServer as createViteServer } from 'vite';
import * as Y from 'yjs';

type CreatedRecording = { id: string; ownerToken: string };

async function freePort(): Promise<number> {
  const probe = createProbe();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const address = probe.address();
  if (!address || typeof address === 'string') throw new Error('port probe did not bind to TCP');
  await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function waitForServer(base: string, process: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (process.exitCode !== null) throw new Error(`share server exited with code ${process.exitCode}`);
    try { await fetch(base); return; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  throw new Error('share server did not start');
}

async function stop(process: ChildProcess): Promise<void> {
  process.kill();
  if (process.exitCode === null) await once(process, 'exit');
}

const envelope = (id: string, t: number, type: string, stepId: string) => ({
  v: 1, id, t, type, stepId, route: '/reports',
  viewport: { width: 1280, height: 800, dpr: 1 }, scroll: { x: 0, y: 0 },
});

const trace = [
  { ...envelope('clock_1', 0, 'system.clockSync', 'step_0'), contentClockMs: 0, workerClockMs: 0, mediaTimeMs: 0 },
  { ...envelope('export_event', 4_200, 'interaction.click', 'step_3'), target: {
    role: 'button', accessibleName: 'Export PDF', text: 'Export PDF', tagName: 'BUTTON',
    boundingBox: { x: 400, y: 300, width: 120, height: 40 },
    locators: [{ type: 'testId', value: 'export-pdf', confidence: 1 }],
  } },
  { ...envelope('clock_2', 9_000, 'system.clockSync', 'step_3'),
    contentClockMs: 9_000, workerClockMs: 9_000, mediaTimeMs: 9_000 },
].map((event) => JSON.stringify(event)).join('\n');

const meta = JSON.stringify({
  schemaVersion: 1, recordingId: 'rec_timeline_e2e', createdAt: '2026-07-16T10:00:00.000Z', sessionEpoch: 1,
  url: 'https://app.example.com/reports', origin: 'https://app.example.com',
  viewport: { width: 1280, height: 800, dpr: 1 }, capture: { width: 1920, height: 1080, fps: 30 },
  media: { mimeType: 'video/webm', hasAudio: false, durationMs: 9_000 },
  privacy: { maskInputValues: true, captureNetwork: false, maskedSelectors: [], visualRedactionSelectors: ['.secret'] },
  app: { commit: null, version: null, environment: null },
});

test('two editors converge concurrent timeline edits and retain versions', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cutscene-timeline-e2e-'));
  const bundle = path.join(root, 'bundle');
  await mkdir(bundle);
  const sharePort = await freePort();
  const shareProcess = spawn(process.execPath, ['../server/src/index.ts'], {
    cwd: process.cwd(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(sharePort), CUTSCENE_DATA: root },
  });
  const shareBase = `http://127.0.0.1:${sharePort}`;
  await waitForServer(shareBase, shareProcess);
  const editorPort = await freePort();
  const vite = await createViteServer({
    root: path.resolve('../editor'), logLevel: 'silent',
    server: { host: '127.0.0.1', port: editorPort, strictPort: true },
  });
  await vite.listen();
  const browser = await chromium.launch({ headless: true });
  const leftContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const rightContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const leftErrors: string[] = [];
  const rightErrors: string[] = [];

  try {
    const mediaPage = await leftContext.newPage();
    const media = Buffer.from(await mediaPage.evaluate(async () => {
      const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('canvas unavailable');
      context.fillStyle = '#16181C'; context.fillRect(0, 0, canvas.width, canvas.height);
      const recorder = new MediaRecorder(canvas.captureStream(5), { mimeType: 'video/webm;codecs=vp8' });
      const chunks: Blob[] = [];
      recorder.addEventListener('dataavailable', (event) => chunks.push(event.data));
      const stopped = new Promise<void>((resolve) => recorder.addEventListener('stop', () => resolve(), { once: true }));
      recorder.start(); await new Promise((resolve) => setTimeout(resolve, 300)); recorder.stop(); await stopped;
      return Array.from(new Uint8Array(await new Blob(chunks, { type: recorder.mimeType }).arrayBuffer()));
    }));
    await mediaPage.close();
    await Promise.all([
      writeFile(path.join(bundle, 'media.webm'), media),
      writeFile(path.join(bundle, 'trace.jsonl'), trace),
      writeFile(path.join(bundle, 'meta.json'), meta),
    ]);

    const created = await (await fetch(`${shareBase}/api/recordings`, { method: 'POST' })).json() as CreatedRecording;
    const ownerUrl = `${shareBase}/r/${created.id}#token=${created.ownerToken}`;
    const left = await leftContext.newPage();
    const right = await rightContext.newPage();
    left.on('pageerror', (error) => leftErrors.push(error.message));
    right.on('pageerror', (error) => rightErrors.push(error.message));
    for (const page of [left, right]) {
      await page.goto(`http://127.0.0.1:${editorPort}`);
      await page.locator('input[webkitdirectory]').setInputFiles(bundle);
      await expect(page.locator('.topbar')).toContainText('rec_timeline_e2e');
      page.once('dialog', (dialog) => dialog.accept(ownerUrl));
      await page.getByRole('button', { name: 'Update shared demo' }).click();
      await expect(page.locator('.timeline-sync')).toHaveText('timeline synced');
    }

    await left.getByRole('button', { name: 'Add zoom' }).click();
    await right.getByRole('checkbox', { name: '.secret' }).uncheck();
    const headers = { authorization: `Bearer ${created.ownerToken}` };
    await expect.poll(async () => {
      const response = await fetch(`${shareBase}/api/recordings/${created.id}/versions`, { headers });
      return (await response.json() as unknown[]).length;
    }).toBe(3);
    await expect(left.getByRole('button', { name: /^Zoom from/ })).toHaveCount(2);
    await expect(right.getByRole('button', { name: /^Zoom from/ })).toHaveCount(2);
    await expect(left.getByRole('checkbox', { name: '.secret' })).not.toBeChecked();
    await expect(right.getByRole('checkbox', { name: '.secret' })).not.toBeChecked();

    const first = new Uint8Array(await (await fetch(`${shareBase}/api/recordings/${created.id}/versions/1`, { headers })).arrayBuffer());
    const restored = new Y.Doc();
    Y.applyUpdate(restored, first);
    expect(restored.getArray('timeline').length).toBe(2);
    restored.destroy();
    expect(leftErrors).toEqual([]);
    expect(rightErrors).toEqual([]);
  } finally {
    await leftContext.close();
    await rightContext.close();
    await browser.close();
    await vite.close();
    await stop(shareProcess);
    await rm(root, { recursive: true, force: true });
  }
});
