import { describe, expect, it } from 'vitest';
import type { BoundingBox, Locator, TargetDescriptor, TraceEvent } from './schema.ts';
import { diffTraces, formatTraceDiff } from './trace-diff.ts';

type ActionType = 'interaction.click' | 'interaction.input' | 'interaction.keypress';

const box: BoundingBox = { x: 10, y: 20, width: 100, height: 30 };
const locator: Locator = { type: 'testId', value: 'save', confidence: 1 };

function target(label: string, overrides: Partial<TargetDescriptor> = {}): TargetDescriptor {
  return {
    role: 'button',
    accessibleName: label,
    text: '',
    tagName: 'BUTTON',
    boundingBox: box,
    locators: [locator],
    ...overrides,
  };
}

function action(
  id: string,
  stepId: string,
  type: ActionType,
  actionTarget: TargetDescriptor | undefined = target('Save'),
): TraceEvent {
  const envelope = {
    v: 1 as const,
    id,
    t: 100,
    stepId,
    route: '/reports',
    viewport: { width: 1440, height: 900, dpr: 1 },
    scroll: { x: 0, y: 0 },
    ...(actionTarget === undefined ? {} : { target: actionTarget }),
  };
  return type === 'interaction.keypress'
    ? { ...envelope, type, key: 'Enter' }
    : { ...envelope, type };
}

function navigation(id: string): TraceEvent {
  return {
    v: 1,
    id,
    t: 0,
    type: 'navigation',
    stepId: 'navigation',
    route: '/reports',
    viewport: { width: 1440, height: 900, dpr: 1 },
    scroll: { x: 0, y: 0 },
  };
}

describe('diffTraces', () => {
  it('filters actionable events and pairs repeated step actions by occurrence order', () => {
    const reference = [
      navigation('nav-old'),
      action('old-1', 'step_1', 'interaction.click'),
      action('old-2', 'step_1', 'interaction.click', target('Export')),
    ];
    const fresh = [
      action('new-1', 'step_1', 'interaction.click'),
      navigation('nav-new'),
      action('new-2', 'step_1', 'interaction.click', target('Download')),
    ];

    const diff = diffTraces(reference, fresh);

    expect(diff).toEqual({
      v: 1,
      counts: { unchanged: 1, changed: 1, added: 0, removed: 0 },
      actions: [
        {
          status: 'unchanged', stepId: 'step_1', kind: 'click', occurrence: 1,
          label: 'Save', changes: [],
        },
        {
          status: 'changed', stepId: 'step_1', kind: 'click', occurrence: 2,
          label: 'Download', changes: ['label'],
        },
      ],
    });
    expect(formatTraceDiff(diff)).toBe(
      'Trace diff\n\n' +
      '  1 unchanged\n' +
      '  1 changed\n' +
      '  0 added\n' +
      '  0 removed\n\n' +
      '  changed step_1 click[2] "Download"  label\n',
    );
  });

  it('compares route, safe label, first locator, and geometry with a 0.5 tolerance', () => {
    const movedWithinTolerance = target('Save', {
      boundingBox: { x: 10.5, y: 19.5, width: 100.5, height: 29.5 },
    });
    const changedLocator: Locator = { type: 'role', role: 'button', name: 'Save', confidence: 0.9 };
    const reference = [
      action('old-tolerance', 'tolerance', 'interaction.click'),
      action('old-route', 'route', 'interaction.click'),
      action('old-label', 'label', 'interaction.click'),
      action('old-locator', 'locator', 'interaction.click'),
      action('old-geometry', 'geometry', 'interaction.click'),
    ];
    const fresh = [
      action('new-tolerance', 'tolerance', 'interaction.click', movedWithinTolerance),
      { ...action('new-route', 'route', 'interaction.click'), route: '/exports' },
      action('new-label', 'label', 'interaction.click', target('Download')),
      action('new-locator', 'locator', 'interaction.click', target('Save', { locators: [changedLocator] })),
      action('new-geometry', 'geometry', 'interaction.click', target('Save', {
        boundingBox: { ...box, x: 10.51 },
      })),
    ];

    const diff = diffTraces(reference, fresh);

    expect(diff.counts).toEqual({ unchanged: 1, changed: 4, added: 0, removed: 0 });
    expect(diff.actions.map(({ changes }) => changes)).toEqual([
      [], ['route'], ['label'], ['locator'], ['geometry'],
    ]);
  });

  it('classifies unpaired actions as added or removed', () => {
    const diff = diffTraces(
      [action('old', 'removed', 'interaction.input')],
      [action('new', 'added', 'interaction.keypress')],
    );

    expect(diff.counts).toEqual({ unchanged: 0, changed: 0, added: 1, removed: 1 });
    expect(diff.actions).toEqual([
      {
        status: 'removed', stepId: 'removed', kind: 'input', occurrence: 1,
        label: 'Save', changes: [],
      },
      {
        status: 'added', stepId: 'added', kind: 'keypress', occurrence: 1,
        label: 'Save', changes: [],
      },
    ]);
  });

  it('never copies or formats input values and falls back from masked labels', () => {
    const secret = 'do-not-print-this';
    const referenceTarget = target('[MASKED]', {
      text: '[MASKED]', role: 'textbox', tagName: 'INPUT', value: secret,
    });
    const freshTarget = target('[MASKED]', {
      text: '[MASKED]', role: 'textbox', tagName: 'INPUT', value: `${secret}-changed`,
    });
    const diff = diffTraces(
      [action('old', 'step_secret', 'interaction.input', referenceTarget)],
      [action('new', 'step_secret', 'interaction.input', freshTarget)],
    );

    expect(diff.actions[0]?.label).toBe('textbox');
    expect(diff.counts.unchanged).toBe(1);
    expect(JSON.stringify(diff)).not.toContain(secret);
    expect(formatTraceDiff(diff)).toBe(
      'Trace diff\n\n' +
      '  1 unchanged\n' +
      '  0 changed\n' +
      '  0 added\n' +
      '  0 removed\n',
    );
    expect(formatTraceDiff(diff)).not.toContain(secret);
  });
});
