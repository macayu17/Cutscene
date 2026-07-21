import { expect, it } from 'vitest';
import { healTrace, serializeTrace } from './heal';
import type { DriftReport } from './regeneration';
import type { Locator, TargetDescriptor, TraceEvent } from './schema';

const ranked: Locator[] = [
  { type: 'testId', value: 'export-csv', confidence: 1 },
  { type: 'role', role: 'button', name: 'Export CSV', confidence: 0.9 },
];

function target(overrides: Partial<TargetDescriptor> = {}): TargetDescriptor {
  return {
    role: 'button', accessibleName: 'Export CSV', text: 'Export CSV', tagName: 'BUTTON',
    boundingBox: { x: 1, y: 2, width: 3, height: 4 }, locators: ranked, ...overrides,
  };
}

function event(overrides: Partial<TraceEvent> = {}): TraceEvent {
  return {
    v: 1, id: 'e4', t: 0, stepId: 'step_3', route: '/',
    viewport: { width: 800, height: 600, dpr: 1 }, scroll: { x: 0, y: 0 },
    type: 'interaction.click', target: target(), ...overrides,
  } as TraceEvent;
}

function report(steps: DriftReport['steps']): DriftReport {
  return {
    v: 1, demoId: 'd', trace: 't', baseUrl: 'http://127.0.0.1', plannedSteps: steps.length,
    evaluatedSteps: steps.length, abortedAfterStepId: null,
    counts: { matched: 0, drifted: 0, orphaned: 0 }, steps,
  };
}

it('promotes the locator that actually resolved', () => {
  const result = healTrace([event()], report([{
    stepId: 'step_3', label: 'Export CSV', status: 'drifted',
    actions: [{ eventId: 'e4', kind: 'click', status: 'drifted', locatorType: 'role', locatorIndex: 1, reason: null }],
  }]));
  expect(result.healed).toEqual([{ stepId: 'step_3', eventId: 'e4', from: 'testId', to: 'role' }]);
  expect(result.events[0]?.target?.locators.map((locator) => locator.type)).toEqual(['role', 'testId']);
});

it('leaves a matched step untouched', () => {
  const events = [event()];
  const result = healTrace(events, report([{
    stepId: 'step_3', label: 'Export CSV', status: 'matched',
    actions: [{ eventId: 'e4', kind: 'click', status: 'matched', locatorType: 'testId', locatorIndex: 0, reason: null }],
  }]));
  expect(result.healed).toEqual([]);
  expect(result.events[0]).toBe(events[0]);
});

it('cannot heal an orphaned step and says so by changing nothing', () => {
  const result = healTrace([event()], report([{
    stepId: 'step_3', label: 'Export CSV', status: 'orphaned',
    actions: [{ eventId: 'e4', kind: 'click', status: 'orphaned', locatorType: null, locatorIndex: null, reason: 'no locator resolved' }],
  }]));
  expect(result.healed).toEqual([]);
  expect(result.events[0]?.target?.locators.map((locator) => locator.type)).toEqual(['testId', 'role']);
});

it('round-trips through JSONL with one event per line', () => {
  const text = serializeTrace([event(), event({ id: 'e5' })]);
  const lines = text.trim().split('\n');
  expect(lines).toHaveLength(2);
  expect(JSON.parse(lines[1] ?? '{}').id).toBe('e5');
});
