import { describe, expect, it, vi } from 'vitest';
import type { TraceEvent } from '@cutscene/trace';
import { orderTraceEvents, rollbackCapture } from './recording-lifecycle';

const event = (id: string, t: number, type: TraceEvent['type']): TraceEvent => ({
  v: 1, id, t, type, stepId: 'step_0000', route: '/', viewport: { width: 100, height: 100, dpr: 1 },
  scroll: { x: 0, y: 0 },
} as TraceEvent);

describe('orderTraceEvents', () => {
  it('sorts chronologically, stably, with recording boundaries at tied timestamps', () => {
    const ordered = orderTraceEvents([
      event('click', 10, 'interaction.click'), event('stop', 10, 'system.recordingStop'),
      event('redaction', 0, 'annotation.redaction'), event('start', 0, 'system.recordingStart'),
      event('navigation', 0, 'navigation'),
    ]);
    expect(ordered.map(({ id }) => id)).toEqual(['start', 'redaction', 'navigation', 'click', 'stop']);
  });
});

describe('rollbackCapture', () => {
  it('stops acquired tracks and clears recorder state after startup failure', () => {
    const stopRecorder = vi.fn();
    const stopTab = vi.fn();
    const stopMic = vi.fn();
    const clearState = vi.fn();
    rollbackCapture({ state: 'recording', stop: stopRecorder } as Pick<MediaRecorder, 'state' | 'stop'>,
      [{ getTracks: () => [{ stop: stopTab }] } as unknown as MediaStream,
       { getTracks: () => [{ stop: stopMic }] } as unknown as MediaStream], clearState);
    expect(stopRecorder).toHaveBeenCalledOnce();
    expect(stopTab).toHaveBeenCalledOnce();
    expect(stopMic).toHaveBeenCalledOnce();
    expect(clearState).toHaveBeenCalledOnce();
  });
});
