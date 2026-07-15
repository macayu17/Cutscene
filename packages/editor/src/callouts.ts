import { mapBoxToCapture, type Locator, type MediaClockFit, type TraceEvent } from '@cutscene/trace';
import { cameraAt, cameraMatrix, cameraTiming, type CropRect } from './camera';
import type { EditableSegment } from './segments';

export type EditableCallout = {
  id: string;
  sourceEventId: string;
  anchor: { stepId: string; locators: Locator[] };
  text: string;
  placement: 'auto';
};

export type Rect = { x: number; y: number; width: number; height: number };
export type Size = { width: number; height: number };

export function addCallout(callouts: readonly EditableCallout[], event: TraceEvent,
  segment: EditableSegment): EditableCallout[] {
  if (!event.target || segment.eventId !== event.id || callouts.some(({ anchor }) => anchor.stepId === event.stepId)) return [...callouts];
  return [...callouts, { id: `callout_${crypto.randomUUID()}`, sourceEventId: event.id,
    anchor: { stepId: event.stepId, locators: [...event.target.locators] },
    text: event.target.accessibleName || event.target.text || event.target.tagName, placement: 'auto' }];
}

export function updateCallout(callouts: readonly EditableCallout[], id: string, text: string): EditableCallout[] {
  return callouts.map((callout) => callout.id === id ? { ...callout, text } : callout);
}

export function deleteCallout(callouts: readonly EditableCallout[], id: string): EditableCallout[] {
  return callouts.filter((callout) => callout.id !== id);
}

export function calloutWindow(callout: EditableCallout, segments: readonly EditableSegment[], events: readonly TraceEvent[],
  clock: MediaClockFit): { startMs: number; endMs: number } | null {
  const segment = segments.find(({ eventId }) => eventId === callout.sourceEventId);
  const source = events.find(({ id }) => id === callout.sourceEventId);
  if (!segment || !source) return null;
  const startMs = Math.max(segment.startMs, segment.clickMs - 50);
  const firstInvalidationMs = events.filter((event) =>
    (event.type === 'interaction.scroll' || event.type === 'viewport.resize') && event.t > source.t)
    .reduce((first, event) => Math.min(first, clock.toMediaTime(event.t)), Number.POSITIVE_INFINITY);
  const endMs = Math.min(cameraTiming(segment).exitStartMs, firstInvalidationMs - 1);
  return endMs >= startMs ? { startMs, endMs } : null;
}

export function activeCallout(callouts: readonly EditableCallout[], segments: readonly EditableSegment[],
  events: readonly TraceEvent[], clock: MediaClockFit, timeMs: number): EditableCallout | null {
  return callouts.find((callout) => {
    const window = calloutWindow(callout, segments, events, clock);
    return window && timeMs >= window.startMs && timeMs <= window.endMs;
  }) ?? null;
}

export function calloutSize(frame: Size): Size {
  return { width: frame.width / 4, height: frame.height * 2 / 15 };
}

export function placeCallout(target: Rect, frame: Size, card: Size): Rect {
  const gapX = frame.width * 0.012;
  const gapY = frame.height * 0.021333333333333333;
  const candidates = [
    { x: target.x + (target.width - card.width) / 2, y: target.y - card.height - gapY },
    { x: target.x + (target.width - card.width) / 2, y: target.y + target.height + gapY },
    { x: target.x + target.width + gapX, y: target.y + (target.height - card.height) / 2 },
    { x: target.x - card.width - gapX, y: target.y + (target.height - card.height) / 2 },
  ];
  const inside = candidates.find(({ x, y }) => x >= 0 && y >= 0 && x + card.width <= frame.width && y + card.height <= frame.height);
  const fallback = inside ?? candidates[0] ?? { x: 0, y: 0 };
  return { x: Math.min(Math.max(fallback.x, 0), frame.width - card.width),
    y: Math.min(Math.max(fallback.y, 0), frame.height - card.height), ...card };
}

export function calloutLayout(event: TraceEvent, segment: EditableSegment, capture: Size, output: Size,
  cardSize: Size, crop?: CropRect): { target: Rect; card: Rect } | null {
  if (!event.target || segment.eventId !== event.id) return null;
  const captureBox = mapBoxToCapture(event.target.boundingBox, event.viewport, capture);
  if (crop) {
    const target = { x: (captureBox.x - crop.x) / crop.width * output.width,
      y: (captureBox.y - crop.y) / crop.height * output.height,
      width: captureBox.width / crop.width * output.width,
      height: captureBox.height / crop.height * output.height };
    return { target, card: placeCallout(target, output, cardSize) };
  }
  const matrix = cameraMatrix(cameraAt(segment.clickMs, [segment], event.viewport, capture), capture, output);
  const target = { x: matrix.scale * captureBox.x / capture.width * output.width + matrix.translateX,
    y: matrix.scale * captureBox.y / capture.height * output.height + matrix.translateY,
    width: matrix.scale * captureBox.width / capture.width * output.width,
    height: matrix.scale * captureBox.height / capture.height * output.height };
  return { target, card: placeCallout(target, output, cardSize) };
}
