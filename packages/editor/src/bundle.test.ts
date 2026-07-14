import { expect, it } from 'vitest';
import { parseBundle } from './bundle';

const meta = JSON.stringify({ schemaVersion: 1, recordingId: 'rec_1', createdAt: '2026-07-14T09:00:00.000Z', sessionEpoch: 1,
  url: 'https://example.com', origin: 'https://example.com', viewport: { width: 1280, height: 800, dpr: 1 },
  capture: { width: 1920, height: 1080, fps: 30 }, media: { mimeType: 'video/webm', hasAudio: false, durationMs: 5_000 },
  privacy: { maskInputValues: true, captureNetwork: false, maskedSelectors: [] }, app: { commit: null, version: null, environment: null } });
const base = { v: 1, id: 'e1', stepId: 's1', route: '/', viewport: { width: 1280, height: 800, dpr: 1 }, scroll: { x: 0, y: 0 } };
const trace = [
  { ...base, t: 100, type: 'system.clockSync', contentClockMs: 100, workerClockMs: 101, mediaTimeMs: 0 },
  { ...base, id: 'e2', t: 1_100, type: 'system.clockSync', contentClockMs: 1_100, workerClockMs: 1_101, mediaTimeMs: 1_000 },
  { ...base, id: 'e3', t: 600, type: 'interaction.click' },
].map((event) => JSON.stringify(event)).join('\n');

it('parses metadata, JSONL, and a usable clock fit', () => {
  const result = parseBundle(meta, trace);
  expect(result.ok && result.value.events).toHaveLength(3);
  expect(result.ok && result.value.clock.toMediaTime(600)).toBeCloseTo(500);
});

it('reports a malformed JSONL line', () => {
  expect(parseBundle(meta, `${trace}\n{`)).toEqual({ ok: false, error: 'trace line 4 is invalid JSON' });
});

it('rejects a bundle without a usable clock fit', () => {
  expect(parseBundle(meta, JSON.stringify({ ...base, t: 100, type: 'interaction.click' }))).toEqual({
    ok: false, error: 'at least two distinct clock markers are required',
  });
});
