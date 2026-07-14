import { AUTO_ZOOM_HOLD_MS, AUTO_ZOOM_MAX_SCALE, AUTO_ZOOM_TRANSITION_MS, deriveZoomSegments, type BoundingBox, type MediaClockFit, type TraceEvent, type Viewport } from '@cutscene/trace';

export type EditableSegment = {
  id: string;
  eventId: string | null;
  startMs: number;
  clickMs: number;
  endMs: number;
  focus: BoundingBox;
  scale: number;
  viewport: Pick<Viewport, 'width' | 'height'>;
};

export function automaticSegments(events: readonly TraceEvent[], clock: MediaClockFit, viewport: Viewport): EditableSegment[] {
  const clicks = events.filter((event) => event.type === 'interaction.click' && event.target).map((event) => ({
    id: event.id, t: clock.toMediaTime(event.t), box: event.target?.boundingBox as BoundingBox, scroll: event.scroll,
    viewport: event.viewport,
  }));
  const scrollTimes = events.filter((event) => event.type === 'interaction.scroll').map((event) => clock.toMediaTime(event.t));
  return deriveZoomSegments(clicks, viewport, scrollTimes).map((segment, index) => ({ ...segment, id: `zoom_${index + 1}`,
    eventId: clicks.find((click) => click.t === segment.clickMs)?.id ?? null }));
}

export function addSegment(segments: readonly EditableSegment[], playheadMs: number, viewport: Pick<Viewport, 'width' | 'height'>): EditableSegment[] {
  const width = Math.max(320, viewport.width / 2);
  const height = width * viewport.height / viewport.width;
  return [...segments, { id: `zoom_${crypto.randomUUID()}`, eventId: null, startMs: Math.max(0, playheadMs - AUTO_ZOOM_TRANSITION_MS),
    clickMs: playheadMs, endMs: playheadMs + AUTO_ZOOM_HOLD_MS + AUTO_ZOOM_TRANSITION_MS,
    focus: { x: (viewport.width - width) / 2, y: (viewport.height - height) / 2, width, height },
    scale: Math.min(AUTO_ZOOM_MAX_SCALE, viewport.width / width), viewport }];
}

export function deleteSegment(segments: readonly EditableSegment[], id: string): EditableSegment[] {
  return segments.filter((segment) => segment.id !== id);
}

export function retimeSegment(segments: readonly EditableSegment[], id: string, startMs: number, endMs: number): EditableSegment[] {
  return segments.map((segment) => {
    if (segment.id !== id) return segment;
    const start = Math.max(0, Math.min(startMs, segment.clickMs > 0 ? segment.clickMs - 1 : 0));
    return { ...segment, startMs: start, endMs: Math.max(endMs, segment.clickMs + segment.clickMs - start) };
  });
}

export function retargetSegment(segments: readonly EditableSegment[], id: string, eventId: string, focus: BoundingBox,
  viewport?: Pick<Viewport, 'width' | 'height'>): EditableSegment[] {
  return segments.map((segment) => segment.id === id ? { ...segment, eventId, focus, viewport: viewport ?? segment.viewport } : segment);
}
