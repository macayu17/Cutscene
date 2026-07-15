import { describe, expect, it } from 'vitest';
import type { MediaClockFit, TraceEvent } from '@cutscene/trace';
import type { EditableSegment } from './segments';
import { activeCallout, addCallout, calloutLayout, calloutSize, calloutWindow, deleteCallout, placeCallout, updateCallout } from './callouts';

const clock: MediaClockFit = { slope: 1, intercept: 0, toMediaTime: (value) => value };

const event: TraceEvent = {
  v: 1, id: 'event_1', t: 2_000, type: 'interaction.click', stepId: 'step_1', route: '/',
  viewport: { width: 1_280, height: 800, dpr: 1 }, scroll: { x: 0, y: 0 },
  target: { role: 'button', accessibleName: 'Create report', text: 'Create report', tagName: 'BUTTON',
    boundingBox: { x: 400, y: 300, width: 100, height: 40 },
    locators: [{ type: 'testId', value: 'create-report', confidence: 1 }] },
};
const segment: EditableSegment = {
  id: 'zoom_1', eventId: event.id, startMs: 1_350, clickMs: 2_000, endMs: 3_800,
  focus: { x: 290, y: 150, width: 640, height: 400 }, scale: 1.8,
  viewport: { width: 1_280, height: 800 },
};

describe('callout edits', () => {
  it('anchors one callout per targeted step', () => {
    const untargeted: TraceEvent = { v: 1, id: 'event_2', t: 2_000, type: 'interaction.click', stepId: 'step_2', route: '/',
      viewport: event.viewport, scroll: event.scroll };
    const added = addCallout([], event, segment);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ sourceEventId: event.id, anchor: { stepId: event.stepId, locators: event.target?.locators },
      text: 'Create report', placement: 'auto' });
    expect(addCallout(added, event, segment)).toEqual(added);
    expect(addCallout([], untargeted, segment)).toEqual([]);
    expect(addCallout([], event, { ...segment, eventId: 'other' })).toEqual([]);
  });

  it('updates and deletes only the selected callout', () => {
    const added = addCallout([], event, segment);
    const id = added[0]?.id ?? '';
    expect(updateCallout(added, id, 'Exports a PDF')[0]?.text).toBe('Exports a PDF');
    expect(deleteCallout(added, id)).toEqual([]);
  });

  it('uses the stable zoom hold as its visibility window', () => {
    const callout = addCallout([], event, segment)[0];
    expect(callout && calloutWindow(callout, [segment], [event], clock)).toEqual({ startMs: 1_950, endMs: 2_900 });
    expect(activeCallout(callout ? [callout] : [], [segment], [event], clock, 2_500)).toEqual(callout);
    expect(activeCallout(callout ? [callout] : [], [segment], [event], clock, 1_950)).toEqual(callout);
    expect(activeCallout(callout ? [callout] : [], [segment], [event], clock, 1_949)).toBeNull();
    expect(activeCallout(callout ? [callout] : [], [segment], [event], clock, 2_901)).toBeNull();
  });

  it('stops before a later scroll makes the recorded box stale', () => {
    const callout = addCallout([], event, segment)[0];
    const scroll: TraceEvent = { v: 1, id: 'scroll_1', t: 2_500, type: 'interaction.scroll', stepId: 'step_2',
      route: event.route, viewport: event.viewport, scroll: { x: 0, y: 240 } };
    expect(callout && calloutWindow(callout, [segment], [event, scroll], clock)).toEqual({ startMs: 1_950, endMs: 2_499 });
    expect(activeCallout(callout ? [callout] : [], [segment], [event, scroll], clock, 2_499)).toEqual(callout);
    expect(activeCallout(callout ? [callout] : [], [segment], [event, scroll], clock, 2_500)).toBeNull();
  });
});

describe('placeCallout', () => {
  it('prefers a centered position above the target', () => {
    expect(placeCallout({ x: 400, y: 300, width: 100, height: 40 }, { width: 1_000, height: 560 },
      { width: 240, height: 72 })).toEqual({ x: 330, y: expect.closeTo(216.0533), width: 240, height: 72 });
  });

  it('moves below a target near the top edge and stays in frame', () => {
    const placed = placeCallout({ x: 400, y: 10, width: 100, height: 40 }, { width: 1_000, height: 560 },
      { width: 240, height: 72 });
    expect(placed).toEqual({ x: 330, y: expect.closeTo(61.9467), width: 240, height: 72 });
  });

  it('maps the target through capture and the stable click camera', () => {
    const layout = calloutLayout(event, segment, { width: 1_920, height: 1_080 }, { width: 1_000, height: 562.5 },
      calloutSize({ width: 1_000, height: 562.5 }));
    expect(layout?.target).toEqual({ x: 234.21875, y: 217.96875, width: 126.5625, height: 50.625 });
    expect(layout?.card).toEqual({ x: 172.5, y: 130.96875, width: 250, height: 75 });
  });

  it('keeps card geometry proportional across preview, GIF, and MP4 frames', () => {
    const frames = [{ width: 1_000, height: 562.5 }, { width: 800, height: 450 }, { width: 1_920, height: 1_080 },
      { width: 1_000, height: 800 }];
    const layouts = frames.map((frame) => calloutLayout(event, segment, { width: 1_920, height: 1_080 }, frame,
      calloutSize(frame)));
    expect(frames.map((frame) => calloutSize(frame))).toEqual([
      { width: 250, height: 75 }, { width: 200, height: 60 }, { width: 480, height: 144 },
      { width: 250, height: 106.66666666666667 },
    ]);
    layouts.forEach((layout, index) => {
      expect((layout?.card.x ?? 0) / frames[index]!.width).toBeCloseTo(0.1725);
      expect((layout?.card.y ?? 0) / frames[index]!.height).toBeCloseTo(0.23283333333333334);
    });
  });

  it('places a portrait callout around the target mapped through its crop', () => {
    const frame = { width: 1_080, height: 1_920 };
    const layout = calloutLayout(event, segment, { width: 1_920, height: 1_080 }, frame, calloutSize(frame),
      { x: 300, y: 0, width: 607.5, height: 1_080 });

    expect(layout?.target).toEqual({ x: expect.closeTo(597.3333), y: 720, width: 240, height: 96 });
    expect(layout?.card).toEqual({ x: expect.closeTo(582.3333), y: 423.04, width: 270, height: 256 });
    expect(layout?.card.x).toBeGreaterThanOrEqual(0);
    expect((layout?.card.x ?? 0) + (layout?.card.width ?? 0)).toBeLessThanOrEqual(frame.width);
    expect(layout?.card.y).toBeGreaterThanOrEqual(0);
    expect((layout?.card.y ?? 0) + (layout?.card.height ?? 0)).toBeLessThanOrEqual(frame.height);
    expect((layout?.card.y ?? 0) + (layout?.card.height ?? 0)).toBeLessThanOrEqual(layout?.target.y ?? 0);
  });
});
