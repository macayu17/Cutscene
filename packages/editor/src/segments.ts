import { deriveZoomSegments, type BoundingBox, type MediaClockFit, type TraceEvent, type Viewport } from '@cutscene/trace';

export type EditableSegment = {
  id: string;
  eventId: string | null;
  startMs: number;
  clickMs: number;
  endMs: number;
  focus: BoundingBox;
  scale: number;
};

export function automaticSegments(events: readonly TraceEvent[], clock: MediaClockFit, viewport: Viewport): EditableSegment[] {
  const clicks = events.filter((event) => event.type === 'interaction.click' && event.target).map((event) => ({
    id: event.id, t: clock.toMediaTime(event.t), box: event.target?.boundingBox as BoundingBox, scroll: event.scroll,
  }));
  return deriveZoomSegments(clicks, viewport).map((segment, index) => ({ ...segment, id: `zoom_${index + 1}`, eventId: clicks[index]?.id ?? null }));
}

export function addSegment(segments: readonly EditableSegment[], playheadMs: number, viewport: Pick<Viewport, 'width' | 'height'>): EditableSegment[] {
  const width = Math.max(320, viewport.width / 2);
  const height = width * viewport.height / viewport.width;
  return [...segments, { id: `zoom_${crypto.randomUUID()}`, eventId: null, startMs: Math.max(0, playheadMs - 400),
    clickMs: playheadMs, endMs: playheadMs + 900, focus: { x: (viewport.width - width) / 2, y: (viewport.height - height) / 2, width, height },
    scale: Math.min(2.5, viewport.width / width) }];
}

export function deleteSegment(segments: readonly EditableSegment[], id: string): EditableSegment[] {
  return segments.filter((segment) => segment.id !== id);
}

export function retimeSegment(segments: readonly EditableSegment[], id: string, startMs: number, endMs: number): EditableSegment[] {
  return segments.map((segment) => segment.id === id ? { ...segment, startMs, endMs } : segment);
}

export function retargetSegment(segments: readonly EditableSegment[], id: string, eventId: string, focus: BoundingBox): EditableSegment[] {
  return segments.map((segment) => segment.id === id ? { ...segment, eventId, focus } : segment);
}

function smoothstep(value: number): number { return value * value * (3 - 2 * value); }

export function segmentStrength(segment: EditableSegment, playheadMs: number): number {
  if (playheadMs < segment.startMs || playheadMs > segment.endMs) return 0;
  const transition = Math.min(400, (segment.endMs - segment.startMs) / 2);
  if (playheadMs < segment.startMs + transition) return smoothstep((playheadMs - segment.startMs) / transition);
  if (playheadMs > segment.endMs - transition) return smoothstep((segment.endMs - playheadMs) / transition);
  return 1;
}
