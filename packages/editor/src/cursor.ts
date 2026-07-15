import { mapBoxToCapture, type MediaClockFit, type TraceEvent } from '@cutscene/trace';
import { cameraMatrix, type CameraState } from './camera';

type Size = { width: number; height: number };

export type CursorSettings = { enabled: boolean; smoothing: number; size: number; ripple: boolean; idleMs: number };
export type CursorSample = { timeMs: number; x: number; y: number; click: boolean };
export type CursorFrame = { x: number; y: number; visible: boolean };
export type CursorRipple = { x: number; y: number; progress: number };
export type CursorVisibleRange = { startMs: number; endMs: number };

export const DEFAULT_CURSOR_SETTINGS: CursorSettings = { enabled: true, smoothing: .7, size: 24, ripple: true, idleMs: 1_200 };
export const CURSOR_RIPPLE_MS = 400;

export function deriveCursorSamples(events: readonly TraceEvent[], clock: MediaClockFit, capture: Size): CursorSample[] {
  return events.flatMap((event): CursorSample[] => {
    if ((event.type !== 'interaction.hover' && event.type !== 'interaction.click') || !event.pointer) return [];
    const timeMs = clock.toMediaTime(event.t);
    if (!Number.isFinite(timeMs)) return [];
    const point = mapBoxToCapture({ ...event.pointer, width: 0, height: 0 }, event.viewport, capture);
    return [{ timeMs, x: point.x, y: point.y, click: event.type === 'interaction.click' }];
  }).sort((a, b) => a.timeMs - b.timeMs || Number(a.click) - Number(b.click));
}

export function smoothCursorSamples(samples: readonly CursorSample[], smoothing: number): CursorSample[] {
  const amount = clamp(smoothing, 0, 1);
  return samples.reduce<CursorSample[]>((result, sample) => {
    const previous = result.at(-1);
    result.push(!previous || sample.click ? { ...sample } : {
      ...sample,
      x: previous.x * amount + sample.x * (1 - amount),
      y: previous.y * amount + sample.y * (1 - amount),
    });
    return result;
  }, []);
}

export function cursorVisibleRanges(samples: readonly CursorSample[], idleMs: number): CursorVisibleRange[] {
  const duration = clamp(idleMs, 0, 5_000);
  return samples.reduce<CursorVisibleRange[]>((ranges, sample) => {
    const previous = ranges.at(-1);
    if (previous && sample.timeMs <= previous.endMs) previous.endMs = Math.max(previous.endMs, sample.timeMs + duration);
    else ranges.push({ startMs: sample.timeMs, endMs: sample.timeMs + duration });
    return ranges;
  }, []);
}

export function cursorAt(samples: readonly CursorSample[], timeMs: number, settings: CursorSettings): CursorFrame | null {
  const first = samples[0];
  if (!first) return null;
  let current = first;
  let next: CursorSample | undefined;
  for (const sample of samples) {
    if (sample.timeMs <= timeMs) current = sample;
    else { next = sample; break; }
  }
  const span = next ? next.timeMs - current.timeMs : 0;
  const progress = span > 0 ? clamp((timeMs - current.timeMs) / span, 0, 1) : 0;
  return {
    x: current.x + ((next?.x ?? current.x) - current.x) * progress,
    y: current.y + ((next?.y ?? current.y) - current.y) * progress,
    visible: settings.enabled && cursorVisibleRanges(samples, settings.idleMs)
      .some((range) => timeMs >= range.startMs && timeMs <= range.endMs),
  };
}

export function rippleAt(samples: readonly CursorSample[], timeMs: number, settings: CursorSettings): CursorRipple | null {
  if (!settings.enabled || !settings.ripple) return null;
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    const sample = samples[index];
    if (!sample || !sample.click || sample.timeMs > timeMs) continue;
    const elapsed = timeMs - sample.timeMs;
    return elapsed <= CURSOR_RIPPLE_MS ? { x: sample.x, y: sample.y, progress: elapsed / CURSOR_RIPPLE_MS } : null;
  }
  return null;
}

export function mapCursorToOutput(point: Pick<CursorSample, 'x' | 'y'>, camera: CameraState, capture: Size, output: Size): { x: number; y: number } {
  const matrix = cameraMatrix(camera, capture, output);
  return { x: point.x / capture.width * output.width * matrix.scale + matrix.translateX,
    y: point.y / capture.height * output.height * matrix.scale + matrix.translateY };
}

export function updateCursorSettings(current: CursorSettings, patch: Partial<CursorSettings>): CursorSettings {
  return { ...current, ...patch,
    smoothing: finiteClamp(patch.smoothing, current.smoothing, 0, 1),
    size: finiteClamp(patch.size, current.size, 12, 48),
    idleMs: finiteClamp(patch.idleMs, current.idleMs, 0, 5_000) };
}

function finiteClamp(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  return value === undefined || !Number.isFinite(value) ? fallback : clamp(value, minimum, maximum);
}

function clamp(value: number, minimum: number, maximum: number): number { return Math.min(maximum, Math.max(minimum, value)); }
