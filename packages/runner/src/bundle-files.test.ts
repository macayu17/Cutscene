import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { chromium } from '@playwright/test';
import { parseRecordingMeta, parseTraceEvent, type RecordingMeta, type TraceEvent } from '@cutscene/trace';
import { probeWebm, writeFreshBundle } from './bundle-files.ts';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixture(): Promise<{ directory: string; mediaPath: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'cutscene-bundle-'));
  directories.push(directory);
  const mediaPath = join(directory, 'capture.webm');
  await writeFile(mediaPath, new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]));
  return { directory, mediaPath };
}

const event: TraceEvent = {
  v: 1,
  id: 'fresh:click',
  t: 10,
  type: 'interaction.click',
  stepId: 'step_1',
  route: '/',
  viewport: { width: 800, height: 600, dpr: 1 },
  scroll: { x: 0, y: 0 },
  target: {
    role: 'button',
    accessibleName: 'Save',
    text: 'Save',
    tagName: 'BUTTON',
    boundingBox: { x: 1, y: 2, width: 30, height: 20 },
    locators: [{ type: 'testId', value: 'save', confidence: 1 }],
  },
};

const meta: RecordingMeta = {
  schemaVersion: 1,
  recordingId: 'fresh-demo',
  createdAt: '2026-07-17T00:00:00.000Z',
  sessionEpoch: 1,
  url: 'https://example.test/',
  origin: 'https://example.test',
  viewport: { width: 800, height: 600, dpr: 1 },
  capture: { width: 800, height: 600, fps: 30 },
  media: { mimeType: 'video/webm', hasAudio: false, durationMs: 1000 },
  privacy: { maskInputValues: true, captureNetwork: false, maskedSelectors: [] },
  app: { commit: null, version: null, environment: null },
};

it('writes a complete parseable fresh bundle through staging', async () => {
  const { directory, mediaPath } = await fixture();
  const result = await writeFreshBundle({
    configDir: directory,
    demoId: 'todo',
    mediaPath,
    events: [event],
    meta,
  });

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  await expect(stat(result.value.mediaPath)).resolves.toMatchObject({ size: 4 });
  const lines = (await readFile(result.value.tracePath, 'utf8')).trim().split('\n');
  expect(lines.map((line) => parseTraceEvent(JSON.parse(line)).ok)).toEqual([true]);
  expect(parseRecordingMeta(JSON.parse(await readFile(result.value.metaPath, 'utf8'))).ok).toBe(true);
  expect(result.value.directory).toBe(join(directory, '.cutscene', 'runs', 'todo'));
});

it('does not publish a valid-looking bundle when staging fails', async () => {
  const { directory } = await fixture();
  const result = await writeFreshBundle({
    configDir: directory,
    demoId: 'broken',
    mediaPath: join(directory, 'missing.webm'),
    events: [event],
    meta,
  });

  expect(result.ok).toBe(false);
  await expect(stat(join(directory, '.cutscene', 'runs', 'broken', 'meta.json'))).rejects.toThrow();
});

it('measures a real Playwright WebM in Chromium', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cutscene-video-'));
  directories.push(directory);
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 320, height: 240 },
      recordVideo: { dir: directory, size: { width: 320, height: 240 } },
    });
    const page = await context.newPage();
    const video = page.video();
    await page.setContent('<button>Recorded</button>');
    await page.waitForTimeout(500);
    await context.close();
    if (video === null) throw new Error('Playwright did not create a video');
    const result = await probeWebm(browser, await video.path());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({ width: 320, height: 240 });
      expect(result.value.durationMs).toBeGreaterThan(0);
    }
  } finally {
    await browser.close();
  }
});
