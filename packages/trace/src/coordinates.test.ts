import { describe, expect, it } from 'vitest';
import { mapBoxToCapture, scrollMatches } from './coordinates';

describe('mapBoxToCapture', () => {
  it('preserves equal-size coordinates', () => {
    expect(mapBoxToCapture({ x: 10, y: 20, width: 30, height: 40 }, { width: 100, height: 100 }, { width: 100, height: 100 }))
      .toEqual({ x: 10, y: 20, width: 30, height: 40 });
  });

  it('scales and centers a letterboxed viewport', () => {
    expect(mapBoxToCapture({ x: 0, y: 0, width: 100, height: 100 }, { width: 1280, height: 800 }, { width: 1920, height: 1080 }))
      .toEqual({ x: 96, y: 0, width: 135, height: 135 });
  });
});

it('marks a box stale after scrolling', () => {
  expect(scrollMatches({ x: 0, y: 10 }, { x: 0, y: 11 })).toBe(false);
});
