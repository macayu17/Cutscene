import { describe, expect, test } from 'vitest';

import { clockExchangeMidpoint, fitClock, mapBoxToVideo } from './measurement';

describe('clockExchangeMidpoint', () => {
  test('removes symmetric message round-trip latency from the media sample', () => {
    expect(clockExchangeMidpoint(920, 1_080)).toBe(1_000);
  });
});

describe('fitClock', () => {
  test('maps content time to drifting media time with a linear fit', () => {
    const map = fitClock([
      { contentClockMs: 0, mediaTimeMs: 12 },
      { contentClockMs: 2_000, mediaTimeMs: 2_014 },
      { contentClockMs: 4_000, mediaTimeMs: 4_016 },
    ]);

    expect(map(3_000)).toBeCloseTo(3_015, 6);
  });

  test('uses the observed offset when only one sync marker exists', () => {
    const map = fitClock([{ contentClockMs: 500, mediaTimeMs: 540 }]);

    expect(map(1_000)).toBe(1_040);
  });
});

describe('mapBoxToVideo', () => {
  test('accounts for contain letterboxing and capture scaling', () => {
    const mapped = mapBoxToVideo(
      { x: 100, y: 50, width: 200, height: 80 },
      { width: 1_000, height: 500 },
      { width: 800, height: 600 },
    );

    expect(mapped).toEqual({ x: 80, y: 140, width: 160, height: 64 });
  });
});
