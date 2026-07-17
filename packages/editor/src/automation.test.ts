import { afterEach, expect, it, vi } from 'vitest';

const exportRecording = vi.hoisted(() => vi.fn(async () => new Blob([new Uint8Array([7])], { type: 'image/gif' })));
const renderStepShots = vi.hoisted(() => vi.fn(async () => ({
  steps: [{ index: 1, stepId: 'step_1', eventId: 'click', t: 600, route: '/', action: 'Click **Save**.',
    box: { x: 10, y: 20, width: 100, height: 40 }, screenshot: 'screenshots/step-01.png' }],
  shots: [{ name: 'screenshots/step-01.png', data: new Uint8Array([2, 3]) }],
})));
vi.mock('./export', () => ({ exportRecording }));
vi.mock('./docs-export', () => ({ renderStepShots }));

import { loadAutomationApi } from './automation';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const meta = JSON.stringify({ schemaVersion: 1, recordingId: 'rec_1', createdAt: '2026-07-14T09:00:00.000Z', sessionEpoch: 1,
  url: 'https://example.com', origin: 'https://example.com', viewport: { width: 1280, height: 800, dpr: 1 },
  capture: { width: 1920, height: 1080, fps: 30 }, media: { mimeType: 'video/webm', hasAudio: false, durationMs: 5_000 },
  privacy: { maskInputValues: true, captureNetwork: false, maskedSelectors: [] }, app: { commit: null, version: null, environment: null } });
const base = { v: 1, stepId: 'step_1', route: '/', viewport: { width: 1280, height: 800, dpr: 1 }, scroll: { x: 0, y: 0 } };
const trace = [
  { ...base, id: 'clock_1', t: 100, type: 'system.clockSync', contentClockMs: 100, workerClockMs: 101, mediaTimeMs: 0 },
  { ...base, id: 'click', t: 600, type: 'interaction.click', target: { role: 'button', accessibleName: 'Save', text: 'Save',
    tagName: 'BUTTON', boundingBox: { x: 10, y: 20, width: 100, height: 40 }, locators: [] } },
  { ...base, id: 'clock_2', t: 1_100, type: 'system.clockSync', contentClockMs: 1_100, workerClockMs: 1_101, mediaTimeMs: 1_000 },
].map((event) => JSON.stringify(event)).join('\n');

it('loads the fixed bundle endpoints and exposes probe, video export, and documentation bytes', async () => {
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const path = String(input);
    if (path.endsWith('meta.json')) return new Response(meta);
    if (path.endsWith('trace.jsonl')) return new Response(trace);
    return new Response(new Uint8Array([1]), { headers: { 'content-type': 'video/webm' } });
  });
  const click = vi.fn();
  const video = { readyState: 1, videoWidth: 1920, videoHeight: 1080, duration: 5, currentTime: 0, src: '' };
  const anchor = { href: '', download: '', click };
  vi.stubGlobal('document', { createElement: (tag: string) => tag === 'video' ? video : anchor });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:media');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

  const api = await loadAutomationApi(fetcher as typeof fetch);

  expect(fetcher.mock.calls.map(([path]) => path)).toEqual(['/bundle/media.webm', '/bundle/trace.jsonl', '/bundle/meta.json']);
  await expect(api.probe()).resolves.toEqual({ width: 1920, height: 1080, durationMs: 5_000 });
  await api.exportVideo('gif', 640);
  expect(exportRecording).toHaveBeenCalledWith(expect.any(Blob), 'gif', expect.any(Array), expect.any(Object), [],
    expect.any(Array), expect.any(Object), expect.any(Array), expect.any(Array), null, expect.any(Object),
    expect.any(Function), undefined, 640);
  expect(anchor.download).toBe('rec_1.gif');
  expect(click).toHaveBeenCalledOnce();
  await expect(api.exportDocs()).resolves.toEqual({
    markdown: expect.stringContaining('Click **Save**.'),
    shots: [{ name: 'screenshots/step-01.png', bytes: [2, 3] }],
  });
  expect(renderStepShots).toHaveBeenCalledOnce();
});
