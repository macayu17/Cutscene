import { describe, expect, it } from 'vitest';
import { cameraAt, cameraMatrix, cameraTiming, portraitCropAt } from './camera';
import type { EditableSegment } from './segments';

const viewport = { width: 1_280, height: 800 };
const segment: EditableSegment = {
  id: 'zoom_1', eventId: 'event_1', startMs: 1_350, clickMs: 2_000, endMs: 3_800,
  focus: { x: 720, y: 120, width: 320, height: 200 }, scale: 1.8, viewport,
};

describe('cameraAt', () => {
  it('derives shared entry, hold, and exit boundaries', () => {
    expect(cameraTiming(segment)).toEqual({ startMs: 1_350, peakMs: 2_000, exitStartMs: 2_900, endMs: 3_800 });
  });

  it('uses one smooth cubic trajectory with a slower exit', () => {
    expect(cameraAt(1_350, [segment], viewport)).toEqual({ scale: 1, centerX: 640, centerY: 400, strength: 0 });
    expect(cameraAt(1_675, [segment], viewport)).toEqual({ scale: 1.4, centerX: 760, centerY: 310, strength: 0.5 });
    expect(cameraAt(2_000, [segment], viewport)).toEqual({ scale: 1.8, centerX: 880, centerY: 800 / 3.6, strength: 1 });
    expect(cameraAt(2_900, [segment], viewport)).toEqual({ scale: 1.8, centerX: 880, centerY: 800 / 3.6, strength: 1 });
    expect(cameraAt(3_350, [segment], viewport)).toEqual({ scale: 1.4, centerX: 760, centerY: 310, strength: 0.5 });
    expect(cameraAt(3_800, [segment], viewport)).toEqual({ scale: 1, centerX: 640, centerY: 400, strength: 0 });
  });

  it('is deterministic when seeking in either direction', () => {
    const forward = cameraAt(1_800, [segment], viewport);
    cameraAt(3_400, [segment], viewport);
    expect(cameraAt(1_800, [segment], viewport)).toEqual(forward);
  });

  it('maps viewport focus through the encoded capture coordinates', () => {
    expect(cameraAt(2_000, [segment], viewport, { width: 1_920, height: 1_080 }))
      .toEqual({ scale: 1.8, centerX: 1_284, centerY: 300, strength: 1 });
  });

  it('maps the camera center to the rendered viewport center', () => {
    const matrix = cameraMatrix({ scale: 1.8, centerX: 880, centerY: 220, strength: 1 }, viewport, { width: 640, height: 400 });
    expect(matrix.scale).toBe(1.8);
    expect(matrix.translateX).toBeCloseTo(-472);
    expect(matrix.translateY).toBeCloseTo(2);
  });

  it('clamps near-edge targets so the transformed video always covers the stage', () => {
    const edge = { ...segment, focus: { x: 0, y: 0, width: 320, height: 200 } };
    const camera = cameraAt(2_000, [edge], viewport);
    expect(camera.centerX).toBeCloseTo(viewport.width / (2 * camera.scale));
    expect(camera.centerY).toBeCloseTo(viewport.height / (2 * camera.scale));
  });
});

describe('portraitCropAt', () => {
  const capture = { width: 1_920, height: 1_080 };

  it('uses the largest centered exact 9:16 crop at rest', () => {
    expect(portraitCropAt(0, [segment], capture)).toEqual({ x: 663, y: 12, width: 594, height: 1_056 });
  });

  it('follows the existing cubic camera timing', () => {
    expect(portraitCropAt(1_675, [segment], capture)).toEqual({ x: 825, y: 0, width: 594, height: 1_056 });
  });

  it('centers the active element at peak strength without using segment scale', () => {
    const expected = { x: 987, y: 0, width: 594, height: 1_056 };
    expect(portraitCropAt(2_000, [segment], capture)).toEqual(expected);
    expect(portraitCropAt(2_000, [{ ...segment, scale: 99 }], capture)).toEqual(expected);
  });

  it('clamps the crop to both capture edges', () => {
    const edge = { ...segment, focus: { x: 0, y: 700, width: 100, height: 100 } };
    expect(portraitCropAt(2_000, [edge], capture)).toEqual({ x: 0, y: 24, width: 594, height: 1_056 });
  });

  it('is deterministic when seeking in either direction', () => {
    const forward = portraitCropAt(1_800, [segment], capture);
    portraitCropAt(3_400, [segment], capture);
    expect(portraitCropAt(1_800, [segment], capture)).toEqual(forward);
  });

  it('rejects captures too small for an even 9:16 crop', () => {
    expect(() => portraitCropAt(0, [], { width: 17, height: 31 }))
      .toThrow('Capture is too small for 9:16 export.');
  });
});
