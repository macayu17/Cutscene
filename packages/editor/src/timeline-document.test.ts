import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { createTimelineDocument, type TimelineState } from './timeline-document';

const state: TimelineState = {
  segments: [{
    id: 'zoom_1', eventId: 'event_1', startMs: 1_000, clickMs: 1_400, endMs: 2_200,
    focus: { x: 100, y: 120, width: 400, height: 240 }, scale: 1.8,
    viewport: { width: 1280, height: 800 },
  }],
  callouts: [{
    id: 'callout_1', sourceEventId: 'event_1',
    anchor: { stepId: 'step_1', locators: [{ type: 'testId', value: 'export-pdf', confidence: 1 }] },
    text: 'Export PDF', placement: 'auto',
  }],
  redactions: [{ selector: '.customer-email', enabled: true }],
};

describe('timeline document', () => {
  it('round-trips zooms, callouts, and redactions through Y.Array<Y.Map>', () => {
    const timeline = createTimelineDocument();
    timeline.initialize(state);

    expect(timeline.read()).toEqual(state);
    expect(timeline.document.getArray<Y.Map<unknown>>('timeline').toArray().every((item) => item instanceof Y.Map)).toBe(true);
  });

  it('observes item-level changes and removes only the addressed item', () => {
    const timeline = createTimelineDocument();
    timeline.initialize(state);
    const listener = vi.fn();
    const stop = timeline.observe(listener);

    timeline.upsert({ kind: 'zoom', order: 0, value: { ...state.segments[0]!, endMs: 2_800 } });
    timeline.remove('callout', 'callout_1');
    stop();

    expect(listener).toHaveBeenCalled();
    expect(timeline.read()).toMatchObject({ segments: [{ endMs: 2_800 }], callouts: [], redactions: state.redactions });
  });

  it('converges concurrent item changes regardless of update order', () => {
    const seed = createTimelineDocument();
    seed.initialize({ ...state, callouts: [], redactions: [] });
    const left = createTimelineDocument();
    const right = createTimelineDocument();
    left.applyRemote(seed.encode());
    right.applyRemote(seed.encode());

    left.upsert({ kind: 'callout', order: 0, value: state.callouts[0]! });
    right.upsert({ kind: 'redaction', order: 0, value: state.redactions[0]! });
    const leftUpdate = left.encode();
    const rightUpdate = right.encode();
    left.applyRemote(rightUpdate);
    right.applyRemote(leftUpdate);
    left.applyRemote(rightUpdate);

    expect(left.read()).toEqual(state);
    expect(right.read()).toEqual(state);
  });
});
