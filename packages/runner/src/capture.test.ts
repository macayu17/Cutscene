import { expect, it } from 'vitest';
import type { ReplayAction, TargetDescriptor } from '@cutscene/trace';
import { freshActionEvent } from './capture.ts';

const target: TargetDescriptor = {
  role: 'textbox',
  accessibleName: 'Old email',
  text: '',
  tagName: 'INPUT',
  boundingBox: { x: 1, y: 2, width: 3, height: 4 },
  locators: [
    { type: 'testId', value: 'removed', confidence: 1 },
    { type: 'label', value: 'Email', confidence: 0.9 },
    { type: 'css', value: '#email', confidence: 0.5 },
  ],
  value: 'configured-secret',
};

function action(kind: ReplayAction['kind']): ReplayAction {
  if (kind === 'fill') return { eventId: 'input_1', kind, target, value: 'configured-secret' };
  if (kind === 'press') return { eventId: 'key_1', kind, target, key: 'Enter' };
  const { value: _value, ...clickTarget } = target;
  return { eventId: 'click_1', kind, target: clickTarget };
}

function fresh(kind: ReplayAction['kind']) {
  return freshActionEvent({
    action: action(kind),
    stepId: 'step_1',
    locatorIndex: 1,
    t: 125,
    route: '/settings',
    viewport: { width: 1280, height: 720, dpr: 1.25 },
    scroll: { x: 0, y: 200 },
    live: {
      tagName: 'INPUT',
      accessibleName: 'Current email',
      text: '',
      boundingBox: { x: 40, y: 60, width: 300, height: 32 },
    },
  });
}

it('rebuilds a fresh target from the successful locator suffix and live DOM', () => {
  const event = fresh('click');

  expect(event).toMatchObject({
    v: 1,
    type: 'interaction.click',
    stepId: 'step_1',
    t: 125,
    route: '/settings',
    target: {
      role: 'textbox',
      accessibleName: 'Current email',
      tagName: 'INPUT',
      boundingBox: { x: 40, y: 60, width: 300, height: 32 },
      locators: [
        { type: 'label', value: 'Email', confidence: 0.9 },
        { type: 'css', value: '#email', confidence: 0.5 },
      ],
    },
  });
  expect(JSON.stringify(event)).not.toContain('configured-secret');
  expect(JSON.stringify(event)).not.toContain('removed');
});

it('masks fill and keypress events while retaining Enter', () => {
  const input = fresh('fill');
  const keypress = fresh('press');

  expect(input).toMatchObject({ type: 'interaction.input', target: { value: '[MASKED]' } });
  expect(keypress).toMatchObject({
    type: 'interaction.keypress',
    key: 'Enter',
    target: { accessibleName: 'Old email', text: '', value: '[MASKED]' },
  });
  expect(`${JSON.stringify(input)}${JSON.stringify(keypress)}`).not.toContain('configured-secret');
});
