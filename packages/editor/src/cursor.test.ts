import { describe, expect, it } from 'vitest';
import type { MediaClockFit, TraceEvent } from '@cutscene/trace';
import { createEditorStore } from './store';
import { DEFAULT_CURSOR_SETTINGS, cursorAt, cursorVisibleRanges, deriveCursorSamples,
  mapCursorToOutput, prepareCursorTrack, rippleAt, smoothCursorSamples, type CursorSample } from './cursor';
import { cameraAt } from './camera';
import type { EditableSegment } from './segments';

const viewport = { width: 600, height: 400, dpr: 1 };
const capture = { width: 1_200, height: 800 };
const clock: MediaClockFit = { slope: 1, intercept: 0, toMediaTime: (time) => time };
const event = (id: string, t: number, type: 'interaction.hover' | 'interaction.click', x?: number, y?: number): TraceEvent => ({
  v: 1, id, t, type, stepId: id, route: '/', viewport, scroll: { x: 0, y: 0 },
  ...(x === undefined || y === undefined ? {} : { pointer: { x, y } }),
} as TraceEvent);
const track = (samples: readonly CursorSample[], settings = DEFAULT_CURSOR_SETTINGS) => prepareCursorTrack(samples, settings);

describe('cursor model', () => {
  it('uses the specified defaults', () => {
    expect(DEFAULT_CURSOR_SETTINGS).toEqual({ enabled: true, smoothing: .7, size: 24, ripple: true, idleMs: 1_200 });
  });

  it('derives ordered capture-space samples through the media clock and shared coordinate map', () => {
    expect(deriveCursorSamples([
      event('old-click', 50, 'interaction.click'),
      event('click', 200, 'interaction.click', 225, 125),
      event('hover', 100, 'interaction.hover', 150, 100),
    ], clock, capture)).toEqual([
      { timeMs: 100, x: 300, y: 200, click: false },
      { timeMs: 200, x: 450, y: 250, click: true },
    ]);
  });

  it('keeps equal-time samples deterministic and ignores out-of-range media times', () => {
    const boundedClock = { ...clock, toMediaTime: (time: number) => time === 1 ? Number.NaN : time };
    expect(deriveCursorSamples([
      event('bad', 1, 'interaction.hover', 1, 1),
      event('click', 100, 'interaction.click', 20, 20),
      event('hover', 100, 'interaction.hover', 10, 10),
    ], boundedClock, capture)).toEqual([
      { timeMs: 100, x: 20, y: 20, click: false },
      { timeMs: 100, x: 40, y: 40, click: true },
    ]);
  });

  it('smooths forward while resetting clicks to their exact point', () => {
    const path = [
      { timeMs: 0, x: 0, y: 0, click: false },
      { timeMs: 100, x: 100, y: 100, click: false },
      { timeMs: 200, x: 450, y: 250, click: true },
      { timeMs: 300, x: 550, y: 350, click: false },
    ];
    expect(smoothCursorSamples(path, 1)).toEqual([
      path[0],
      { ...path[1], x: 0, y: 0 },
      path[2],
      { ...path[3], x: 450, y: 250 },
    ]);
  });

  it('linearly interpolates an already-smoothed path', () => {
    const path = [
      { timeMs: 100, x: 300, y: 200, click: false },
      { timeMs: 200, x: 450, y: 250, click: true },
      { timeMs: 400, x: 550, y: 350, click: false },
    ];
    expect(cursorAt(track(path, { ...DEFAULT_CURSOR_SETTINGS, smoothing: 0 }), 150)).toMatchObject({ x: 375, y: 225, visible: true });
  });

  it('anchors the full ripple to the exact click while later pointer motion continues', () => {
    const path = [
      { timeMs: 100, x: 300, y: 200, click: false },
      { timeMs: 200, x: 450, y: 250, click: true },
      { timeMs: 300, x: 900, y: 700, click: false },
    ];
    expect(rippleAt(track(path, { ...DEFAULT_CURSOR_SETTINGS, idleMs: 20 }), 350))
      .toEqual({ x: 450, y: 250, progress: .375 });
    expect(rippleAt(track(path, { ...DEFAULT_CURSOR_SETTINGS, idleMs: 0 }), 600))
      .toEqual({ x: 450, y: 250, progress: 1 });
    expect(rippleAt(track(path), 601)).toBeNull();
    expect(rippleAt(track(path, { ...DEFAULT_CURSOR_SETTINGS, enabled: false }), 300)).toBeNull();
    expect(rippleAt(track(path, { ...DEFAULT_CURSOR_SETTINGS, ripple: false }), 300)).toBeNull();
  });

  it('merges idle windows and hides before, between, and after them', () => {
    const path = [
      { timeMs: 100, x: 10, y: 10, click: false },
      { timeMs: 500, x: 20, y: 20, click: false },
      { timeMs: 1_500, x: 30, y: 30, click: false },
    ];
    expect(cursorVisibleRanges(path, 500)).toEqual([{ startMs: 100, endMs: 1_000 }, { startMs: 1_500, endMs: 2_000 }]);
    const prepared = track(path, { ...DEFAULT_CURSOR_SETTINGS, idleMs: 500 });
    expect(cursorAt(prepared, 50)?.visible).toBe(false);
    expect(cursorAt(prepared, 1_200)?.visible).toBe(false);
    expect(cursorAt(prepared, 2_001)?.visible).toBe(false);
  });

  it('looks up long prepared paths with logarithmic indexed access', () => {
    const samples = Array.from({ length: 65_536 }, (_, index) =>
      ({ timeMs: index * 10, x: index, y: index, click: index % 1_000 === 0 }));
    const prepared = track(samples, { ...DEFAULT_CURSOR_SETTINGS, smoothing: 0 });
    let reads = 0;
    const proxied = new Proxy(prepared.samples, { get(target, property, receiver) {
      if (typeof property === 'string' && /^\d+$/.test(property)) reads += 1;
      return Reflect.get(target, property, receiver);
    } });
    expect(cursorAt({ ...prepared, samples: proxied }, 327_685)).toMatchObject({ x: 32_768.5, y: 32_768.5, visible: true });
    expect(reads).toBeLessThan(50);
  });

  it('maps the pointer tip with the existing camera at rest and peak zoom', () => {
    const segment: EditableSegment = { id: 'zoom', eventId: 'click', startMs: 0, clickMs: 100, endMs: 1_000,
      focus: { x: 300, y: 100, width: 200, height: 200 }, scale: 2, viewport };
    expect(mapCursorToOutput({ x: 600, y: 400 }, cameraAt(0, [segment], viewport, capture), capture, { width: 600, height: 400 }))
      .toEqual({ x: 300, y: 200 });
    expect(mapCursorToOutput({ x: 800, y: 400 }, cameraAt(100, [segment], viewport, capture), capture, { width: 600, height: 400 }))
      .toEqual({ x: 300, y: 200 });
  });

  it('clamps settings at the store boundary and rejects non-finite values', () => {
    const store = createEditorStore();
    store.getState().updateCursorSettings({ smoothing: 2, size: 2, idleMs: 8_000 });
    expect(store.getState().cursorSettings).toMatchObject({ smoothing: 1, size: 12, idleMs: 5_000 });
    store.getState().updateCursorSettings({ smoothing: Number.NaN, size: Number.POSITIVE_INFINITY, idleMs: -2 });
    expect(store.getState().cursorSettings).toMatchObject({ smoothing: 1, size: 12, idleMs: 0 });
  });
});
