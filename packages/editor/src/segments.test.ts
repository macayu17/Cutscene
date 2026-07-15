import { expect, it } from 'vitest';
import { addSegment, automaticSegments, deleteSegment, retargetSegment, retimeSegment, type EditableSegment } from './segments';
import { segmentStrength } from './camera';
import type { MediaClockFit, TraceEvent, TraceEventType } from '@cutscene/trace';

const segment: EditableSegment = { id: 'z1', eventId: 'e1', startMs: 100, clickMs: 500, endMs: 1_400,
  focus: { x: 10, y: 20, width: 320, height: 200 }, scale: 2, viewport: { width: 1_280, height: 800 } };

it('holds an automatic zoom for 900ms after the click before returning', () => {
  const automatic = { ...segment, startMs: 1_350, clickMs: 2_000, endMs: 3_800 };
  expect(segmentStrength(automatic, 2_900)).toBe(1);
  expect(segmentStrength(automatic, 3_350)).toBeCloseTo(0.5);
  expect(segmentStrength(automatic, 3_800)).toBe(0);
});

it('adds and deletes a manual segment', () => {
  const added = addSegment([], 2_000, { width: 1280, height: 800 });
  expect(added).toHaveLength(1);
  expect(added[0]).toMatchObject({ startMs: 1_350, clickMs: 2_000, endMs: 3_800, scale: 1.8 });
  expect(deleteSegment(added, added[0]?.id ?? '')).toEqual([]);
});

it('retimes only the selected segment', () => {
  expect(retimeSegment([segment], 'z1', 200, 1_600)[0]).toMatchObject({ startMs: 200, endMs: 1_600 });
});

it('keeps the click inside a symmetric retimed segment', () => {
  expect(retimeSegment([segment], 'z1', 600, 700)[0]).toMatchObject({ startMs: 499, endMs: 700 });
  expect(retimeSegment([segment], 'z1', 100, 600)[0]).toMatchObject({ startMs: 100, endMs: 900 });
});

it('retargets to a recorded event box', () => {
  expect(retargetSegment([segment], 'z1', 'e2', { x: 100, y: 120, width: 400, height: 250 })[0])
    .toMatchObject({ eventId: 'e2', focus: { x: 100, y: 120, width: 400, height: 250 } });
});

const clock: MediaClockFit = { slope: 1, intercept: 0, toMediaTime: (value: number) => value };
const traceEvent = (type: Exclude<TraceEventType, 'system.clockSync' | 'annotation.redaction' | 'interaction.hover'>, t: number,
  viewport = { width: 1_280, height: 800, dpr: 1 }): TraceEvent => {
  const event = { v: 1 as const, id: `${type}_${t}`, type, t, stepId: 'step_1', route: '/', viewport, scroll: { x: 0, y: 0 } };
  return type === 'interaction.click' ? { ...event, target: { role: 'button', accessibleName: 'save', text: 'save', tagName: 'BUTTON',
    boundingBox: { x: 1_000, y: 100, width: 100, height: 40 }, locators: [] } } : event;
};

it('uses the viewport recorded with each click', () => {
  const [automatic] = automaticSegments([traceEvent('interaction.click', 2_000, { width: 1_200, height: 760, dpr: 1 })],
    clock, { width: 1_280, height: 800, dpr: 1 });
  expect(automatic).toBeDefined();
  if (!automatic) throw new Error('automatic segment missing');
  expect(automatic.focus.width / automatic.focus.height).toBeCloseTo(1_200 / 760);
});

it('suppresses a zoom whose active window contains a scroll event', () => {
  const events = [traceEvent('interaction.click', 2_000), traceEvent('interaction.scroll', 2_300)];
  expect(automaticSegments(events, clock,
    { width: 1_280, height: 800, dpr: 1 })).toHaveLength(0);
});

it('does not use automatic zoom geometry across a viewport resize', () => {
  expect(automaticSegments([traceEvent('viewport.resize', 1_700), traceEvent('interaction.click', 2_000)], clock,
    { width: 1_280, height: 800, dpr: 1 })).toHaveLength(0);
  expect(automaticSegments([traceEvent('interaction.click', 2_000), traceEvent('viewport.resize', 2_300)], clock,
    { width: 1_280, height: 800, dpr: 1 })[0]?.endMs).toBe(2_299);
});
