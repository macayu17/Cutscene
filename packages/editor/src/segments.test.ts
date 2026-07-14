import { expect, it } from 'vitest';
import { addSegment, deleteSegment, retargetSegment, retimeSegment, segmentStrength, type EditableSegment } from './segments';

const segment: EditableSegment = { id: 'z1', eventId: 'e1', startMs: 100, clickMs: 500, endMs: 1_400,
  focus: { x: 10, y: 20, width: 320, height: 200 }, scale: 2 };

it('holds an automatic zoom for 900ms after the click before returning', () => {
  const automatic = { ...segment, startMs: 1_600, clickMs: 2_000, endMs: 3_300 };
  expect(segmentStrength(automatic, 2_900)).toBe(1);
  expect(segmentStrength(automatic, 3_100)).toBeCloseTo(0.5);
  expect(segmentStrength(automatic, 3_300)).toBe(0);
});

it('adds and deletes a manual segment', () => {
  const added = addSegment([], 2_000, { width: 1280, height: 800 });
  expect(added).toHaveLength(1);
  expect(added[0]).toMatchObject({ startMs: 1_600, clickMs: 2_000, endMs: 3_300 });
  expect(deleteSegment(added, added[0]?.id ?? '')).toEqual([]);
});

it('retimes only the selected segment', () => {
  expect(retimeSegment([segment], 'z1', 200, 1_600)[0]).toMatchObject({ startMs: 200, endMs: 1_600 });
});

it('retargets to a recorded event box', () => {
  expect(retargetSegment([segment], 'z1', 'e2', { x: 100, y: 120, width: 400, height: 250 })[0])
    .toMatchObject({ eventId: 'e2', focus: { x: 100, y: 120, width: 400, height: 250 } });
});
