import { describe, expect, it } from 'vitest';
import { cameraAt, cameraMatrix, cameraTiming } from './camera';
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
