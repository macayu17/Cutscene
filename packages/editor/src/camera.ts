import { AUTO_ZOOM_EXIT_MS, mapBoxToCapture } from '@cutscene/trace';
import type { EditableSegment } from './segments';

export type CameraState = { scale: number; centerX: number; centerY: number; strength: number };
export type CameraTiming = { startMs: number; peakMs: number; exitStartMs: number; endMs: number };
export type CropRect = { x: number; y: number; width: number; height: number };
type Size = { width: number; height: number };

function smoothstep(value: number): number { return value * value * (3 - 2 * value); }

export function cameraTiming(segment: EditableSegment): CameraTiming {
  return { startMs: segment.startMs, peakMs: segment.clickMs,
    exitStartMs: Math.max(segment.clickMs, segment.endMs - AUTO_ZOOM_EXIT_MS), endMs: segment.endMs };
}

export function segmentStrength(segment: EditableSegment, timeMs: number): number {
  const timing = cameraTiming(segment);
  if (timeMs <= timing.startMs || timeMs >= timing.endMs) return 0;
  if (timeMs < timing.peakMs) return smoothstep((timeMs - timing.startMs) / (timing.peakMs - timing.startMs));
  if (timeMs <= timing.exitStartMs) return 1;
  return smoothstep((timing.endMs - timeMs) / (timing.endMs - timing.exitStartMs));
}

export function cameraAt(timeMs: number, segments: readonly EditableSegment[], viewport: Size, capture: Size = viewport): CameraState {
  const identity = { scale: 1, centerX: capture.width / 2, centerY: capture.height / 2, strength: 0 };
  const segment = segments.find((candidate) => timeMs >= candidate.startMs && timeMs <= candidate.endMs);
  if (!segment) return identity;
  const strength = segmentStrength(segment, timeMs);
  const focus = mapBoxToCapture(segment.focus, segment.viewport, capture);
  const focusX = focus.x + focus.width / 2;
  const focusY = focus.y + focus.height / 2;
  const scale = 1 + strength * (segment.scale - 1);
  const halfWidth = capture.width / (2 * scale);
  const halfHeight = capture.height / (2 * scale);
  const desiredX = identity.centerX + strength * (focusX - identity.centerX);
  const desiredY = identity.centerY + strength * (focusY - identity.centerY);
  return { scale, centerX: Math.min(Math.max(desiredX, halfWidth), capture.width - halfWidth),
    centerY: Math.min(Math.max(desiredY, halfHeight), capture.height - halfHeight), strength };
}

export function portraitCropAt(timeMs: number, segments: readonly EditableSegment[], capture: Size): CropRect {
  const unit = Math.floor(Math.min(capture.width / 9, capture.height / 16) / 2) * 2;
  if (unit < 2) throw new Error('Capture is too small for 9:16 export.');
  const width = unit * 9;
  const height = unit * 16;
  const restingX = (capture.width - width) / 2;
  const restingY = (capture.height - height) / 2;
  const segment = segments.find((candidate) => timeMs >= candidate.startMs && timeMs <= candidate.endMs);
  if (!segment) return { x: restingX, y: restingY, width, height };
  const focus = mapBoxToCapture(segment.focus, segment.viewport, capture);
  const strength = segmentStrength(segment, timeMs);
  const x = restingX + strength * (focus.x + focus.width / 2 - capture.width / 2);
  const y = restingY + strength * (focus.y + focus.height / 2 - capture.height / 2);
  return { x: Math.min(Math.max(x, 0), capture.width - width),
    y: Math.min(Math.max(y, 0), capture.height - height), width, height };
}

export function cameraMatrix(camera: CameraState, viewport: Size, rendered: Size): { scale: number; translateX: number; translateY: number } {
  const centerX = camera.centerX / viewport.width * rendered.width;
  const centerY = camera.centerY / viewport.height * rendered.height;
  return { scale: camera.scale, translateX: rendered.width / 2 - camera.scale * centerX,
    translateY: rendered.height / 2 - camera.scale * centerY };
}
