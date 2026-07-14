import { describe, expect, it } from 'vitest';
import { deriveZoomSegments } from './zoom';

const click = (t: number, x: number, scrollY = 0) => ({
  t, box: { x, y: 100, width: 100, height: 40 }, scroll: { x: 0, y: scrollY },
});

describe('deriveZoomSegments', () => {
  it('pads, times, and caps a click zoom', () => {
    const [segment] = deriveZoomSegments([click(2_000, 600)], { width: 1280, height: 800 });
    expect(segment).toMatchObject({ startMs: 1_350, clickMs: 2_000, endMs: 3_550 });
    expect(segment?.scale).toBeLessThanOrEqual(1.8);
    expect(segment?.focus.width).toBeGreaterThanOrEqual(320);
  });

  it('merges nearby overlapping targets', () => {
    expect(deriveZoomSegments([click(2_000, 600), click(2_800, 620)], { width: 1280, height: 800 })).toHaveLength(1);
  });

  it('suppresses a zoom across a scroll change', () => {
    expect(deriveZoomSegments([click(2_000, 600, 0), click(2_500, 600, 100)], { width: 1280, height: 800 })).toHaveLength(0);
  });

  it('uses the click viewport and suppresses an explicitly recorded scroll', () => {
    const resized = { ...click(2_000, 600), viewport: { width: 1_200, height: 760 } };
    expect(deriveZoomSegments([resized], { width: 1_280, height: 800 })[0]?.viewport).toEqual(resized.viewport);
    expect(deriveZoomSegments([resized], { width: 1_280, height: 800 }, [2_300])).toHaveLength(0);
  });
});
