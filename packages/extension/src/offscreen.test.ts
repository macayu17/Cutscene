import { beforeEach, expect, it, vi } from 'vitest';
import type { TraceEvent } from '@cutscene/trace';

beforeEach(() => { vi.resetModules(); vi.unstubAllGlobals(); });

function state(events: TraceEvent[]) {
  const viewport = { width: 1_280, height: 800, dpr: 1 };
  return {
    recorder: { mimeType: 'video/webm;codecs=vp9' }, stream: { getAudioTracks: () => [] }, mic: null,
    chunks: [new Blob(['pixels'])], events, tabId: 7, sessionEpoch: 1_752_000_000_000, startedAt: 1, mediaStart: 0,
    timer: 0, flush: 0, recordingId: 'rec_1', capture: { width: 1_920, height: 1_080, fps: 30 },
    context: { viewport, scroll: { x: 0, y: 0 }, route: '/', url: 'https://example.com/app',
      origin: 'https://example.com', contentClockMs: 0, visualRedactionSelectors: ['.customer-email'] },
  };
}

const event = (id: string, t: number): TraceEvent => ({ v: 1, id, t, type: 'interaction.click', stepId: 'step_0000',
  route: '/', viewport: { width: 1_280, height: 800, dpr: 1 }, scroll: { x: 0, y: 0 } } as TraceEvent);

// The periodic flush writes the same shape as a finished recording, so an
// interrupted take is openable rather than lost.
it('builds an orderable bundle from a recording that has not stopped', async () => {
  vi.stubGlobal('chrome', { runtime: { onMessage: { addListener: vi.fn() } } });
  const { bundle } = await import('./offscreen');
  const built = bundle(state([event('e2', 900), event('e1', 100)]) as never, 5_000);

  expect(built.meta).toMatchObject({ schemaVersion: 1, recordingId: 'rec_1', url: 'https://example.com/app',
    media: { mimeType: 'video/webm;codecs=vp9', hasAudio: false, durationMs: 5_000 } });
  expect(built.meta.privacy.visualRedactionSelectors).toEqual(['.customer-email']);
  expect((await built.trace.text()).trim().split('\n').map((line) => (JSON.parse(line) as TraceEvent).id)).toEqual(['e1', 'e2']);
  expect(built.media.size).toBe(6);
});
