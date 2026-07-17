import { expect, it } from 'vitest';
import {
  buildDriftReport,
  formatDriftReport,
  planReplay,
  reportExitCode,
} from './regeneration.ts';
import type { TargetDescriptor, TraceEvent } from './schema.ts';

const box = { x: 1, y: 2, width: 30, height: 20 };

function target(name: string, value?: string, role = 'button'): TargetDescriptor {
  return {
    role,
    accessibleName: name,
    text: name,
    tagName: 'BUTTON',
    boundingBox: box,
    locators: [{ type: 'testId', value: name.toLowerCase(), confidence: 1 }],
    ...(value === undefined ? {} : { value }),
  };
}

function event(
  id: string,
  stepId: string,
  type: TraceEvent['type'],
  eventTarget?: TargetDescriptor,
): TraceEvent {
  return {
    v: 1,
    id,
    t: 1,
    type,
    stepId,
    route: '/',
    viewport: { width: 100, height: 100, dpr: 1 },
    scroll: { x: 0, y: 0 },
    ...(eventTarget === undefined ? {} : { target: eventTarget }),
  } as TraceEvent;
}

function keypress(id: string, stepId: string, eventTarget: TargetDescriptor): TraceEvent {
  return {
    v: 1,
    id,
    t: 1,
    type: 'interaction.keypress',
    key: 'Enter',
    stepId,
    route: '/',
    viewport: { width: 100, height: 100, dpr: 1 },
    scroll: { x: 0, y: 0 },
    target: eventTarget,
  } as TraceEvent;
}

it('plans a primary click and ignores non-replay events', () => {
  const result = planReplay([
    event('nav', 'step_0', 'navigation'),
    event('click', 'step_1', 'interaction.click', target('Save')),
  ], {});

  expect(result).toEqual({
    ok: true,
    value: {
      steps: [{
        stepId: 'step_1',
        label: 'Save',
        actions: [{ eventId: 'click', kind: 'click', target: target('Save') }],
      }],
    },
  });
});

it('uses a configured value for a masked input without putting it in labels', () => {
  const result = planReplay([
    event('input', 'step_1', 'interaction.input', target('Email', '[MASKED]')),
  ], { step_1: 'secret@example.com' });

  expect(result).toMatchObject({
    ok: true,
    value: {
      steps: [{
        stepId: 'step_1',
        label: 'Email',
        actions: [{ kind: 'fill', value: 'secret@example.com' }],
      }],
    },
  });
  expect(result.ok && result.value.steps[0]?.label).not.toContain('secret@example.com');
});

it('suppresses the paired input event emitted by a checkbox click', () => {
  const checkbox = target('Complete', 'on', 'checkbox');
  const result = planReplay([
    event('click', 'step_1', 'interaction.click', checkbox),
    event('input', 'step_1', 'interaction.input', checkbox),
  ], {});

  expect(result).toMatchObject({
    ok: true,
    value: { steps: [{ actions: [{ eventId: 'click', kind: 'click' }] }] },
  });
});

it('keeps an input event paired with a textbox click', () => {
  const result = planReplay([
    event('click', 'step_1', 'interaction.click', target('Email', '', 'textbox')),
    event('input', 'step_1', 'interaction.input', target('Email', '[MASKED]', 'textbox')),
  ], { step_1: 'secret@example.com' });

  expect(result).toMatchObject({
    ok: true,
    value: {
      steps: [{
        actions: [
          { eventId: 'click', kind: 'click' },
          { eventId: 'input', kind: 'fill', value: 'secret@example.com' },
        ],
      }],
    },
  });
});

it('fills a distinct input before clicking the step target', () => {
  const result = planReplay([
    event('input', 'step_1', 'interaction.input', target('Title', 'Recorded title')),
    event('click', 'step_1', 'interaction.click', target('Create')),
  ], {});

  expect(result).toMatchObject({
    ok: true,
    value: {
      steps: [{
        label: 'Create',
        actions: [
          { eventId: 'input', kind: 'fill', value: 'Recorded title' },
          { eventId: 'click', kind: 'click' },
        ],
      }],
    },
  });
});

it('requires an override for a masked input', () => {
  expect(planReplay([
    event('input', 'step_1', 'interaction.input', target('Email', '[MASKED]')),
  ], {})).toEqual({ ok: false, error: 'step step_1 requires an input override' });
});

it('rejects two click events assigned to one step', () => {
  expect(planReplay([
    event('first', 'step_1', 'interaction.click', target('First')),
    event('second', 'step_1', 'interaction.click', target('Second')),
  ], {})).toEqual({ ok: false, error: 'step step_1 contains multiple click events' });
});

it('fills the last input sample before pressing Enter', () => {
  const textbox = target('New todo', 'Recorded title', 'textbox');
  expect(planReplay([
    event('input-1', 'step_1', 'interaction.input', target('New todo', 'Recorded', 'textbox')),
    event('input-2', 'step_1', 'interaction.input', textbox),
    keypress('key', 'step_1', textbox),
  ], {})).toMatchObject({
    ok: true,
    value: {
      steps: [{
        label: 'New todo',
        actions: [
          { eventId: 'input-2', kind: 'fill', value: 'Recorded title' },
          { eventId: 'key', kind: 'press', key: 'Enter' },
        ],
      }],
    },
  });
});

it('does not let a later input displace the sample submitted by Enter', () => {
  const before = target('New todo', 'Submitted title', 'textbox');
  const after = target('New todo', 'Later draft', 'textbox');
  expect(planReplay([
    event('input-before', 'step_1', 'interaction.input', before),
    keypress('key', 'step_1', before),
    event('input-after', 'step_1', 'interaction.input', after),
  ], {})).toMatchObject({
    ok: true,
    value: {
      steps: [{
        actions: [
          { eventId: 'input-before', kind: 'fill', value: 'Submitted title' },
          { eventId: 'key', kind: 'press', key: 'Enter' },
        ],
      }],
    },
  });
});

it('rejects two keypress events assigned to one step', () => {
  const textbox = target('New todo', 'Recorded title', 'textbox');
  expect(planReplay([
    keypress('first', 'step_1', textbox),
    keypress('second', 'step_1', textbox),
  ], {})).toEqual({
    ok: false,
    error: 'step step_1 contains multiple keypress events',
  });
});

it('aggregates action outcomes and formats the drift summary', () => {
  const report = buildDriftReport({
    demoId: 'todo-flow',
    trace: '.cutscene/todo.trace.jsonl',
    baseUrl: 'http://127.0.0.1:4173',
    plannedSteps: 3,
    abortedAfterStepId: 'step_3',
    steps: [
      {
        stepId: 'step_1',
        label: 'Save',
        actions: [{ eventId: 'a', kind: 'click', status: 'matched', locatorType: 'testId', locatorIndex: 0, reason: null }],
      },
      {
        stepId: 'step_2',
        label: 'Export',
        actions: [{ eventId: 'b', kind: 'click', status: 'drifted', locatorType: 'role', locatorIndex: 1, reason: null }],
      },
      {
        stepId: 'step_3',
        label: 'Removed',
        actions: [{ eventId: 'c', kind: 'click', status: 'orphaned', locatorType: null, locatorIndex: null,
          reason: 'no locator resolved' }],
      },
    ],
  });

  expect(report).toMatchObject({
    v: 1,
    counts: { matched: 1, drifted: 1, orphaned: 1 },
    plannedSteps: 3,
    evaluatedSteps: 3,
    abortedAfterStepId: 'step_3',
  });
  expect(formatDriftReport(report)).toContain('1 step drifted    Export');
  expect(reportExitCode(report)).toBe(1);
});

it('returns success only when every planned step matched', () => {
  const report = buildDriftReport({
    demoId: 'todo-flow',
    trace: 'trace.jsonl',
    baseUrl: 'http://127.0.0.1:4173',
    plannedSteps: 1,
    abortedAfterStepId: null,
    steps: [{
      stepId: 'step_1',
      label: 'Save',
      actions: [{ eventId: 'a', kind: 'click', status: 'matched', locatorType: 'testId', locatorIndex: 0, reason: null }],
    }],
  });

  expect(reportExitCode(report)).toBe(0);
  expect(formatDriftReport(report)).toBe(
    'todo-flow regenerated against http://127.0.0.1:4173\n\n  1 step matched\n',
  );
});

it('fails an incomplete report even when every evaluated step matched', () => {
  const report = buildDriftReport({
    demoId: 'todo-flow',
    trace: 'trace.jsonl',
    baseUrl: 'http://127.0.0.1:4173',
    plannedSteps: 2,
    abortedAfterStepId: 'step_1',
    steps: [{
      stepId: 'step_1',
      label: 'Save',
      actions: [{ eventId: 'a', kind: 'click', status: 'matched', locatorType: 'testId', locatorIndex: 0, reason: null }],
    }],
  });

  expect(reportExitCode(report)).toBe(1);
});

it('copies only report fields and never an action input value', () => {
  const action = {
    eventId: 'input',
    kind: 'fill' as const,
    status: 'matched' as const,
    locatorType: 'label' as const,
    locatorIndex: 0,
    reason: null,
    value: 'do-not-print-this',
  };
  const report = buildDriftReport({
    demoId: 'todo-flow',
    trace: 'trace.jsonl',
    baseUrl: 'http://127.0.0.1:4173',
    plannedSteps: 1,
    abortedAfterStepId: null,
    steps: [{ stepId: 'step_1', label: 'Email', actions: [action] }],
  });

  expect(JSON.stringify(report)).not.toContain('do-not-print-this');
  expect(formatDriftReport(report)).not.toContain('do-not-print-this');
});
