import { expect, it } from 'vitest';
import { createEditorStore } from './store';
import { seekForKey, tickRow } from './timeline';

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
