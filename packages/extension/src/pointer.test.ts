import { describe, expect, it } from 'vitest';
import { POINTER_SAMPLE_INTERVAL_MS, shouldSamplePointer } from './pointer';

describe('shouldSamplePointer', () => {
  it('limits pointer samples to 30Hz', () => {
    expect(POINTER_SAMPLE_INTERVAL_MS).toBe(1000 / 30);
    expect(shouldSamplePointer(100, 133)).toBe(false);
    expect(shouldSamplePointer(100, 134)).toBe(true);
  });
});
