import { expect, it } from 'vitest';
import { inExtension, recordingFiles, retain, summarize, type RecordingRecord } from './recordings';
import type { RecordingMeta } from '@cutscene/trace';

const meta: RecordingMeta = { schemaVersion: 1, recordingId: 'rec_1', createdAt: '2026-07-14T09:00:00.000Z', sessionEpoch: 1,
  url: 'https://example.com', origin: 'https://example.com', viewport: { width: 1280, height: 800, dpr: 1 },
  capture: { width: 1920, height: 1080, fps: 30 }, media: { mimeType: 'video/webm', hasAudio: false, durationMs: 5_000 },
  privacy: { maskInputValues: true, captureNetwork: false, maskedSelectors: [] }, app: { commit: null, version: null, environment: null } };

function record(id: string, createdAt: string): RecordingRecord {
  return { id, media: new Blob(['0123456789'], { type: 'video/webm' }), trace: new Blob(['{}\n']),
    meta: { ...meta, recordingId: id, createdAt } };
}

it('summarizes a stored recording from its metadata and media size', () => {
  expect(summarize(record('rec_1', meta.createdAt))).toEqual({ id: 'rec_1', url: 'https://example.com',
    createdAt: '2026-07-14T09:00:00.000Z', durationMs: 5_000, bytes: 10 });
});

it('keeps the newest recordings first and evicts past the cap', () => {
  const summaries = ['2026-07-14T09:00:00.000Z', '2026-07-16T09:00:00.000Z', '2026-07-15T09:00:00.000Z']
    .map((createdAt, index) => summarize(record(`rec_${index}`, createdAt)));
  const result = retain(summaries, 2);
  expect(result.keep.map(({ id }) => id)).toEqual(['rec_1', 'rec_2']);
  expect(result.evict).toEqual(['rec_0']);
});

it('rebuilds the three bundle files the editor reader expects', async () => {
  const files = recordingFiles(record('rec_1', meta.createdAt));
  expect(files.map(({ name }) => name)).toEqual(['media.webm', 'trace.jsonl', 'meta.json']);
  expect(JSON.parse(await files[2]!.text())).toEqual(meta);
});

it('reports no extension origin outside the extension', () => {
  expect(inExtension()).toBe(false);
});
