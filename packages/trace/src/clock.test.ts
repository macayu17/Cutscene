import { describe, expect, it } from 'vitest';
import { fitMediaClock } from './clock';

describe('fitMediaClock', () => {
  it('maps clock offset and drift with a linear fit', () => {
    const fit = fitMediaClock([
      { t: 1_000, mediaTimeMs: 100 }, { t: 3_000, mediaTimeMs: 2_102 }, { t: 5_000, mediaTimeMs: 4_104 },
    ]);
    expect(fit.ok && fit.value.toMediaTime(4_000)).toBeCloseTo(3_103, 6);
  });

  it('rejects fewer than two distinct markers', () => {
    expect(fitMediaClock([{ t: 1, mediaTimeMs: 1 }])).toEqual({ ok: false, error: 'at least two distinct clock markers are required' });
  });
});
