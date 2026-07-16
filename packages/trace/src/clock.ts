import type { Result } from './schema.ts';

export type ClockMarker = { t: number; mediaTimeMs: number };
export type MediaClockFit = { slope: number; intercept: number; toMediaTime: (t: number) => number };

export function fitMediaClock(markers: readonly ClockMarker[]): Result<MediaClockFit> {
  if (markers.length < 2 || new Set(markers.map(({ t }) => t)).size < 2) {
    return { ok: false, error: 'at least two distinct clock markers are required' };
  }
  const meanT = markers.reduce((sum, marker) => sum + marker.t, 0) / markers.length;
  const meanMedia = markers.reduce((sum, marker) => sum + marker.mediaTimeMs, 0) / markers.length;
  const denominator = markers.reduce((sum, marker) => sum + (marker.t - meanT) ** 2, 0);
  const slope = markers.reduce((sum, marker) => sum + (marker.t - meanT) * (marker.mediaTimeMs - meanMedia), 0) / denominator;
  const intercept = meanMedia - slope * meanT;
  return { ok: true, value: { slope, intercept, toMediaTime: (t) => slope * t + intercept } };
}
