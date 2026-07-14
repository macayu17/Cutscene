import { mapBoxToCapture, type BoundingBox, type MediaClockFit, type RecordingMeta, type RedactionSampleEvent,
  type TraceEvent, type Viewport } from '@cutscene/trace';

export type EditableRedaction = { selector: string; enabled: boolean };
export type RedactionBox = { selector: string; instanceId: string; startMs: number; endMs: number;
  box: BoundingBox; viewport: Viewport };
export type CompiledRedaction = { x: number; y: number; width: number; height: number; blurRadius: number;
  startSeconds: number; endSeconds: number };

function samples(events: readonly TraceEvent[]): RedactionSampleEvent[] {
  return events.filter((event): event is RedactionSampleEvent => event.type === 'annotation.redaction');
}

export function deriveRedactions(meta: RecordingMeta, events: readonly TraceEvent[]): EditableRedaction[] {
  const selectors = meta.privacy.visualRedactionSelectors ?? samples(events).map(({ selector }) => selector);
  return [...new Set(selectors)].map((selector) => ({ selector, enabled: true }));
}

export function toggleRedaction(redactions: readonly EditableRedaction[], selector: string): EditableRedaction[] {
  return redactions.map((redaction) => redaction.selector === selector ? { ...redaction, enabled: !redaction.enabled } : redaction);
}

export function deleteRedaction(redactions: readonly EditableRedaction[], selector: string): EditableRedaction[] {
  return redactions.filter((redaction) => redaction.selector !== selector);
}

export function deriveRedactionIntervals(events: readonly TraceEvent[], clock: MediaClockFit, durationMs: number): RedactionBox[] {
  const grouped = new Map<string, RedactionSampleEvent[]>();
  for (const event of samples(events)) {
    const key = `${event.selector}\0${event.instanceId}`;
    const group = grouped.get(key) ?? [];
    group.push(event);
    grouped.set(key, group);
  }
  const intervals: RedactionBox[] = [];
  for (const group of grouped.values()) {
    const ordered = [...group].sort((left, right) => left.t - right.t);
    ordered.forEach((event, index) => {
      if (!event.visible || !event.box) return;
      const startMs = Math.max(0, clock.toMediaTime(event.t));
      const next = ordered[index + 1];
      const endMs = next ? Math.min(durationMs, clock.toMediaTime(next.t)) : durationMs;
      if (endMs >= startMs) intervals.push({ selector: event.selector, instanceId: event.instanceId,
        startMs, endMs, box: event.box, viewport: event.viewport });
    });
  }
  return intervals;
}

export function redactionBoxesAt(boxes: readonly RedactionBox[], redactions: readonly EditableRedaction[],
  timeMs: number): RedactionBox[] {
  const enabled = new Set(redactions.filter(({ enabled: value }) => value).map(({ selector }) => selector));
  return boxes.filter((box) => enabled.has(box.selector) && timeMs >= box.startMs && timeMs < box.endMs);
}

function evenFloor(value: number): number { return Math.floor(value / 2) * 2; }
function evenCeil(value: number): number { return Math.ceil(value / 2) * 2; }

function cropAxis(start: number, end: number, limit: number): { start: number; size: number } | null {
  if (end <= 0 || start >= limit) return null;
  const ceiling = evenFloor(limit);
  if (ceiling < 4) return null;
  let lower = Math.max(0, evenFloor(start));
  let upper = Math.min(ceiling, evenCeil(end));
  if (upper - lower < 4) {
    if (lower + 4 <= ceiling) upper = lower + 4;
    else lower = upper - 4;
  }
  return { start: lower, size: upper - lower };
}

export function compileRedactions(boxes: readonly RedactionBox[], redactions: readonly EditableRedaction[],
  capture: { width: number; height: number }): CompiledRedaction[] {
  const enabled = new Set(redactions.filter(({ enabled: value }) => value).map(({ selector }) => selector));
  return boxes.flatMap((sample) => {
    if (!enabled.has(sample.selector)) return [];
    const mapped = mapBoxToCapture(sample.box, sample.viewport, capture);
    const horizontal = cropAxis(mapped.x, mapped.x + mapped.width, capture.width);
    const vertical = cropAxis(mapped.y, mapped.y + mapped.height, capture.height);
    if (!horizontal || !vertical) return [];
    const blurRadius = Math.max(1, Math.min(10, Math.floor(Math.min(horizontal.size, vertical.size) / 4)));
    return [{ x: horizontal.start, y: vertical.start, width: horizontal.size, height: vertical.size, blurRadius,
      startSeconds: sample.startMs / 1_000, endSeconds: sample.endMs / 1_000 }];
  });
}
