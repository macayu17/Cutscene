import { expect, it } from 'vitest';
import { planReplay } from './regeneration.ts';
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

it('rejects a recorded keypress because version 1 has no key detail', () => {
  expect(planReplay([event('key', 'step_1', 'interaction.keypress')], {})).toEqual({
    ok: false,
    error: 'step step_1 contains an unsupported keypress event',
  });
});
