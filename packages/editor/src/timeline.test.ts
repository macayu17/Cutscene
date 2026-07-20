import { expect, it } from 'vitest';
import type { TraceEvent } from '@cutscene/trace';
import { createEditorStore } from './store';
import { hasMeaningfulTraceEvents, isHumanEvent, isTimelineShortcutTarget, isTraceEvent, seekForKey,
  semanticSummary, tickRow } from './timeline';

it('selects, seeks, and sets bounds without a second playback clock', () => {
  const store = createEditorStore();
  store.getState().selectEvent('evt_1', 1_200);
  expect(store.getState()).toMatchObject({ selectedEventId: 'evt_1', playheadMs: 1_200 });
  store.getState().setBound('start');
  expect(store.getState().selectionStartMs).toBe(1_200);
});

it('places coincident ticks on separate pointer rows', () => {
  expect(tickRow(0)).not.toBe(tickRow(1));
  expect(new Set([0, 1, 2, 3].map(tickRow)).size).toBe(4);
});

it('maps timeline keys to bounded seeks', () => {
  expect(seekForKey('ArrowLeft', 100, 2_000)).toBe(0);
  expect(seekForKey('ArrowRight', 1_900, 2_000)).toBe(2_000);
  expect(seekForKey('x', 500, 2_000)).toBeNull();
});

it('handles timeline shortcuts on the timeline and playhead range only', () => {
  const timeline = new EventTarget();
  expect(isTimelineShortcutTarget(timeline, timeline)).toBe(true);
  expect(isTimelineShortcutTarget({ tagName: 'INPUT', type: 'range' } as unknown as EventTarget, timeline)).toBe(true);
  expect(isTimelineShortcutTarget({ tagName: 'INPUT', type: 'text' } as unknown as EventTarget, timeline)).toBe(false);
  expect(isTimelineShortcutTarget({ tagName: 'INPUT', type: 'number' } as unknown as EventTarget, timeline)).toBe(false);
  expect(isTimelineShortcutTarget({ tagName: 'SELECT' } as unknown as EventTarget, timeline)).toBe(false);
});

it('detects a playable trace with no meaningful interactions', () => {
  expect(hasMeaningfulTraceEvents([{ type: 'system.recordingStart' }, { type: 'navigation' }])).toBe(false);
  expect(hasMeaningfulTraceEvents([{ type: 'interaction.hover' }])).toBe(false);
  expect(hasMeaningfulTraceEvents([{ type: 'interaction.click' }])).toBe(true);
});

it('keeps pointer samples out of human event lanes', () => {
  expect(isHumanEvent({ type: 'interaction.click' })).toBe(true);
  expect(isHumanEvent({ type: 'navigation' })).toBe(true);
  expect(isHumanEvent({ type: 'interaction.hover' })).toBe(false);
  expect(isTraceEvent({ type: 'system.clockSync' })).toBe(true);
  expect(isTraceEvent({ type: 'interaction.hover' })).toBe(false);
});

it('summarizes human steps, boxed clicks, and generated zooms', () => {
  const events = [
    { type: 'navigation', stepId: 'step_0' },
    { type: 'interaction.click', stepId: 'step_1', target: { boundingBox: {} } },
    { type: 'interaction.input', stepId: 'step_1', target: { boundingBox: {} } },
    { type: 'interaction.hover', stepId: 'step_1', target: { boundingBox: {} } },
  ] as unknown as TraceEvent[];

  expect(semanticSummary(events, 3)).toEqual({ events: 3, steps: 2, targets: 1, zooms: 3 });
});
