import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { editorDistPath, MISSING_EDITOR, runDemo } from './run.ts';

// Rendering resolves the editor as an installed package first and as the sibling
// workspace package second. Getting this wrong only shows up once published.
it('resolves the editor build that carries the render pipeline', () => {
  const dist = editorDistPath();
  expect(dist.replace(/\\/g, '/')).toMatch(/editor\/dist$/);
  expect(existsSync(join(dist, 'automation.html'))).toBe(true);
});

it('names the fix when the editor build is absent', () => {
  expect(MISSING_EDITOR).toContain('@cutscene/editor');
  expect(MISSING_EDITOR).toContain('--dry-run');
});

it('refuses a pixel-only recording with exit 2, before launching a browser', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cutscene-pixelonly-'));
  try {
    const envelope = { v: 1, id: 'evt_1', t: 0, stepId: 'step_1', route: '/',
      viewport: { width: 1280, height: 800, dpr: 1 }, scroll: { x: 0, y: 0 } };
    // A screen recording: system and navigation events only, no interactions to replay.
    const events = [
      { ...envelope, type: 'system.recordingStart' },
      { ...envelope, id: 'evt_2', type: 'system.clockSync', contentClockMs: 0, workerClockMs: 0, mediaTimeMs: 0 },
      { ...envelope, id: 'evt_3', type: 'navigation' },
      { ...envelope, id: 'evt_4', type: 'system.recordingStop' },
    ];
    const tracePath = join(directory, 'trace.jsonl');
    await writeFile(tracePath, `${events.map((event) => JSON.stringify(event)).join('\n')}\n`, 'utf8');
    const exit = await runDemo({ id: 'pixels', tracePath, baseUrl: 'http://127.0.0.1:1', seed: null, inputs: {},
      watch: [], staleAfterCommits: null, outputs: [] }, directory, { dryRun: true });
    expect(exit).toBe(2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
