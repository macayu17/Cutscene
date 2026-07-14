import type { BoundingBox, MediaClockFit, RecordingMeta, RedactionSampleEvent, TraceEvent, Viewport } from '@cutscene/trace';

export type EditableRedaction = { selector: string; enabled: boolean };
export type RedactionBox = { selector: string; instanceId: string; startMs: number; endMs: number;
  box: BoundingBox; viewport: Viewport };

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
