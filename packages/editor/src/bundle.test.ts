import { afterEach, expect, it, vi } from 'vitest';
import { geometryMatches, pageEventAt, parseBundle, readBundleFiles } from './bundle';
import { automaticSegments } from './segments';
import { createEditorStore } from './store';

afterEach(() => vi.unstubAllGlobals());

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

it('names every missing recording file', async () => {
  const result = await readBundleFiles([new File(['video'], 'media.webm')]);
  expect(result).toEqual({ ok: false, error: 'Missing trace.jsonl and meta.json.' });
});

it('ignores clock markers when resolving current page state', () => {
  const parsed = parseBundle(meta, trace);
  expect(parsed.ok && pageEventAt(parsed.value.events, 1_100)?.type).toBe('interaction.click');
});

it('stable-sorts parsed events before chronological consumers use them', () => {
  const target = (x: number) => ({ role: 'button', accessibleName: 'save', text: 'save', tagName: 'BUTTON',
    boundingBox: { x, y: 100, width: 40, height: 40 }, locators: [] });
  const unordered = [
    { ...base, id: 'late-click', t: 900, type: 'interaction.click', target: target(1_000) },
    { ...base, id: 'clock-2', t: 1_100, type: 'system.clockSync', contentClockMs: 1_100, workerClockMs: 1_101, mediaTimeMs: 1_000 },
    { ...base, id: 'tie-a', t: 500, type: 'navigation' },
    { ...base, id: 'early-click', t: 300, type: 'interaction.click', target: target(20) },
    { ...base, id: 'tie-b', t: 500, type: 'navigation' },
    { ...base, id: 'clock-1', t: 100, type: 'system.clockSync', contentClockMs: 100, workerClockMs: 101, mediaTimeMs: 0 },
  ].map((event) => JSON.stringify(event)).join('\n');
  const parsed = parseBundle(meta, unordered);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;

  expect(parsed.value.events.map(({ id }) => id)).toEqual(['clock-1', 'early-click', 'tie-a', 'tie-b', 'late-click', 'clock-2']);
  expect(pageEventAt(parsed.value.events, 700)?.id).toBe('tie-b');
  expect(automaticSegments(parsed.value.events, parsed.value.clock, parsed.value.meta.viewport).map(({ eventId }) => eventId))
    .toEqual(['early-click', 'late-click']);
});

it('matches semantic geometry only in the same viewport and scroll position', () => {
  const recorded = { viewport: base.viewport, scroll: base.scroll };
  expect(geometryMatches(recorded, recorded)).toBe(true);
  expect(geometryMatches(recorded, { ...recorded, viewport: { ...recorded.viewport, width: 1_200 } })).toBe(false);
  expect(geometryMatches(recorded, { ...recorded, viewport: { ...recorded.viewport, height: 700 } })).toBe(false);
  expect(geometryMatches(recorded, { ...recorded, viewport: { ...recorded.viewport, dpr: 2 } })).toBe(false);
  expect(geometryMatches(recorded, { ...recorded, scroll: { x: 0, y: 1 } })).toBe(false);
});

it('keeps the current media URL after a failed load and releases replaced URLs', async () => {
  const parsed = parseBundle(meta, trace);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  const revokeObjectURL = vi.fn();
  vi.stubGlobal('URL', { revokeObjectURL });
  const store = createEditorStore();
  store.getState().load(parsed.value, 'blob:first');

  expect((await readBundleFiles([new File(['video'], 'media.webm')])).ok).toBe(false);
  expect(store.getState().mediaUrl).toBe('blob:first');
  expect(revokeObjectURL).not.toHaveBeenCalled();

  store.getState().load(parsed.value, 'blob:second');
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:first');
  store.getState().releaseMedia();
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:second');
});
