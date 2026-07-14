import { mapBoxToCapture, type BoundingBox, type MediaClockFit, type RecordingMeta, type RedactionSampleEvent,
  type TraceEvent, type Viewport } from '@cutscene/trace';

export type EditableRedaction = { selector: string; enabled: boolean };
export type RedactionBox = { selector: string; instanceId: string; startMs: number; endMs: number;
  box: BoundingBox; viewport: Viewport };
export type CompiledRedaction = { x: number; y: number; width: number; height: number; startSeconds: number; endSeconds: number };

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
      const endMs = next ? Math.min(durationMs, clock.toMediaTime(next.t) - 1) : durationMs;
      if (endMs >= startMs) intervals.push({ selector: event.selector, instanceId: event.instanceId,
        startMs, endMs, box: event.box, viewport: event.viewport });
    });
  }
  return intervals;
}

export function redactionBoxesAt(boxes: readonly RedactionBox[], redactions: readonly EditableRedaction[],
  timeMs: number): RedactionBox[] {
  const enabled = new Set(redactions.filter(({ enabled: value }) => value).map(({ selector }) => selector));
  return boxes.filter((box) => enabled.has(box.selector) && timeMs >= box.startMs && timeMs <= box.endMs);
}

export function compileRedactions(boxes: readonly RedactionBox[], redactions: readonly EditableRedaction[],
  capture: { width: number; height: number }): CompiledRedaction[] {
  const enabled = new Set(redactions.filter(({ enabled: value }) => value).map(({ selector }) => selector));
  return boxes.flatMap((sample) => {
    if (!enabled.has(sample.selector)) return [];
    const mapped = mapBoxToCapture(sample.box, sample.viewport, capture);
    const x = Math.max(0, Math.floor(mapped.x));
    const y = Math.max(0, Math.floor(mapped.y));
    const right = Math.min(capture.width, Math.ceil(mapped.x + mapped.width));
    const bottom = Math.min(capture.height, Math.ceil(mapped.y + mapped.height));
    if (right <= x || bottom <= y) return [];
    return [{ x, y, width: right - x, height: bottom - y, startSeconds: sample.startMs / 1_000,
      endSeconds: sample.endMs / 1_000 }];
  });
}
