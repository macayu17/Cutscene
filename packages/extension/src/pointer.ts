export const POINTER_SAMPLE_INTERVAL_MS = 1000 / 30;

export function shouldSamplePointer(lastAt: number, now: number): boolean {
  return now - lastAt >= POINTER_SAMPLE_INTERVAL_MS;
}
