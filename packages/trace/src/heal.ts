import type { DriftReport } from './regeneration.ts';
import type { Locator, TraceEvent } from './schema.ts';

// Healing promotes the locator that actually resolved during replay to the
// front of a step's ranked list. It never invents a locator: if replay could
// not resolve the element at all, the step stays orphaned and the demo stays
// broken, which is the honest outcome.

export type HealedStep = {
  stepId: string;
  eventId: string;
  from: Locator['type'];
  to: Locator['type'];
};

export type HealResult = {
  events: TraceEvent[];
  healed: HealedStep[];
};

export function healTrace(events: readonly TraceEvent[], report: DriftReport): HealResult {
  // eventId -> the ranked index that replay fell back to.
  const recovered = new Map<string, number>();
  for (const step of report.steps) {
    for (const action of step.actions) {
      if (action.status !== 'drifted') continue;
      if (action.locatorIndex === null || action.locatorIndex <= 0) continue;
      recovered.set(action.eventId, action.locatorIndex);
    }
  }

  const healed: HealedStep[] = [];
  const next = events.map((event) => {
    const index = recovered.get(event.id);
    const target = event.target;
    if (index === undefined || !target) return event;
    const promoted = target.locators[index];
    const previous = target.locators[0];
    if (!promoted || !previous) return event;
    healed.push({ stepId: event.stepId, eventId: event.id, from: previous.type, to: promoted.type });
    const locators = [promoted, ...target.locators.filter((_, at) => at !== index)];
    return { ...event, target: { ...target, locators } };
  });

  return { events: next, healed };
}

export function serializeTrace(events: readonly TraceEvent[]): string {
  return `${events.map((event) => JSON.stringify(event)).join('\n')}\n`;
}
