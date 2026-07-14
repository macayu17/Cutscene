import { describe, expect, it } from 'vitest';
import type { MediaClockFit, RecordingMeta, RedactionSampleEvent, TraceEvent } from '@cutscene/trace';
import { compileRedactions, deleteRedaction, deriveRedactionIntervals, deriveRedactions, redactionBoxesAt, toggleRedaction } from './redactions';

const viewport = { width: 1_280, height: 800, dpr: 1 };
const envelope = { v: 1 as const, route: '/', viewport, scroll: { x: 0, y: 0 }, stepId: 'redaction' };
const sample = (id: string, t: number, instanceId: string, box?: { x: number; y: number; width: number; height: number }): RedactionSampleEvent =>
  ({ ...envelope, id, t, type: 'annotation.redaction', selector: '.secret', instanceId, visible: box !== undefined,
    ...(box ? { box } : {}) });
const events: TraceEvent[] = [
  sample('r1', 100, 'one', { x: 10, y: 20, width: 100, height: 24 }),
  sample('r2', 300, 'one', { x: 10, y: 60, width: 100, height: 24 }),
  sample('r3', 400, 'two', { x: 300, y: 60, width: 120, height: 24 }),
  sample('r4', 500, 'one'),
];
const clock: MediaClockFit = { slope: 0.5, intercept: -50, toMediaTime: (t) => t * 0.5 - 50 };
const meta = { privacy: { visualRedactionSelectors: ['.secret', '.unused'] } } as RecordingMeta;

describe('redaction tracks', () => {
  it('derives configured tracks and supports enable and delete edits', () => {
    const tracks = deriveRedactions(meta, events);
    expect(tracks).toEqual([{ selector: '.secret', enabled: true }, { selector: '.unused', enabled: true }]);
    expect(toggleRedaction(tracks, '.secret')).toEqual([{ selector: '.secret', enabled: false }, { selector: '.unused', enabled: true }]);
    expect(deleteRedaction(tracks, '.unused')).toEqual([{ selector: '.secret', enabled: true }]);
  });

  it('maps appearance, movement, disappearance, and multiple instances through the media clock', () => {
    const intervals = deriveRedactionIntervals(events, clock, 300);
    expect(intervals).toEqual([
      { selector: '.secret', instanceId: 'one', startMs: 0, endMs: 99, box: { x: 10, y: 20, width: 100, height: 24 }, viewport },
      { selector: '.secret', instanceId: 'one', startMs: 100, endMs: 199, box: { x: 10, y: 60, width: 100, height: 24 }, viewport },
      { selector: '.secret', instanceId: 'two', startMs: 150, endMs: 300, box: { x: 300, y: 60, width: 120, height: 24 }, viewport },
    ]);
    const tracks = deriveRedactions(meta, events);
    expect(redactionBoxesAt(intervals, tracks, 50)).toHaveLength(1);
    expect(redactionBoxesAt(intervals, tracks, 150).map(({ instanceId }) => instanceId)).toEqual(['one', 'two']);
    expect(redactionBoxesAt(intervals, tracks, 200).map(({ instanceId }) => instanceId)).toEqual(['two']);
    expect(redactionBoxesAt(intervals, toggleRedaction(tracks, '.secret'), 150)).toEqual([]);
    expect(compileRedactions(intervals, tracks, { width: 1_920, height: 1_080 })[0]).toEqual({
      x: 109, y: 27, width: 136, height: 33, startSeconds: 0, endSeconds: 0.099,
    });
    expect(compileRedactions(intervals, toggleRedaction(tracks, '.secret'), { width: 1_920, height: 1_080 })).toEqual([]);
  });

  it('falls back to captured samples when older metadata has no selector list', () => {
    const { visualRedactionSelectors: _ignored, ...oldPrivacy } = meta.privacy;
    expect(deriveRedactions({ ...meta, privacy: oldPrivacy }, events))
      .toEqual([{ selector: '.secret', enabled: true }]);
  });
});
