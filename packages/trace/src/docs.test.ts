import { expect, it } from 'vitest';
import { deriveDocSteps, renderDocMarkdown, targetLabel } from './docs';
import type { Locator, TargetDescriptor, TraceEvent } from './schema';

const meta = { recordingId: 'rec_01H8XK', url: 'https://app.example.com/dashboard' };

function target(overrides: Partial<TargetDescriptor> = {}): TargetDescriptor {
  return {
    role: 'button', accessibleName: 'Create report', text: 'Create report', tagName: 'BUTTON',
    boundingBox: { x: 1, y: 2, width: 3, height: 4 }, locators: [] as Locator[], ...overrides,
  };
}

function event(overrides: Partial<TraceEvent>): TraceEvent {
  return {
    v: 1, id: 'evt', t: 0, stepId: 'step', route: '/dashboard',
    viewport: { width: 1440, height: 900, dpr: 2 }, scroll: { x: 0, y: 0 },
    type: 'interaction.click', ...overrides,
  } as TraceEvent;
}

it('documents only clicks, inputs, and navigations', () => {
  const steps = deriveDocSteps([
    event({ type: 'interaction.click', target: target() }),
    event({ type: 'interaction.hover' }),
    event({ type: 'annotation.redaction' }),
    event({ type: 'interaction.scroll' }),
    event({ type: 'navigation', route: '/reports' }),
  ]);
  expect(steps.map((s) => s.index)).toEqual([1, 2]);
  expect(steps.map((s) => s.route)).toEqual(['/dashboard', '/reports']);
});

it('writes click and input copy from the accessible name', () => {
  const steps = deriveDocSteps([
    event({ type: 'interaction.click', target: target({ accessibleName: 'Save draft' }) }),
    event({ type: 'interaction.input', target: target({ accessibleName: 'Report name', value: 'Q3' }) }),
  ]);
  expect(steps[0]?.action).toBe('Click **Save draft**.');
  expect(steps[1]?.action).toBe('Enter `Q3` into **Report name**.');
});

it('never leaks a masked value or masked name', () => {
  const steps = deriveDocSteps([
    event({ type: 'interaction.input', target: target({ accessibleName: 'Password', value: '[MASKED]' }) }),
    event({ type: 'interaction.click', target: target({ accessibleName: '[MASKED]', text: '[MASKED]', role: 'checkbox' }) }),
  ]);
  expect(steps[0]?.action).toBe('Fill in **Password**.');
  expect(steps[1]?.action).toBe('Click **checkbox**.');
  expect(steps.some((s) => s.action.includes('[MASKED]'))).toBe(false);
});

it('falls back to text then role when the accessible name is empty', () => {
  const byText = deriveDocSteps([event({ type: 'interaction.click', target: target({ accessibleName: '', text: 'Go' }) })]);
  const byRole = deriveDocSteps([event({ type: 'interaction.click', target: target({ accessibleName: '', text: '', role: 'checkbox' }) })]);
  expect(byText[0]?.action).toBe('Click **Go**.');
  expect(byRole[0]?.action).toBe('Click **checkbox**.');
});

it('exposes the same privacy-safe target label for other trace artifacts', () => {
  expect(targetLabel(target({ accessibleName: 'Save', text: 'ignored' }))).toBe('Save');
  expect(targetLabel(target({ accessibleName: '[MASKED]', text: '[MASKED]', role: 'textbox' }))).toBe('textbox');
});

it('names one screenshot per step with a target box and none for navigation', () => {
  const steps = deriveDocSteps([
    event({ type: 'navigation', route: '/reports' }),
    event({ type: 'interaction.click', target: target() }),
  ]);
  expect(steps[0]?.screenshot).toBeNull();
  expect(steps[1]?.screenshot).toBe('screenshots/step-02.png');
  expect(steps[1]?.box).toEqual({ x: 1, y: 2, width: 3, height: 4 });
});

it('renders markdown with a section and image per documented step', () => {
  const steps = deriveDocSteps([event({ type: 'interaction.click', target: target({ accessibleName: 'Save draft' }) })]);
  const md = renderDocMarkdown(steps, meta);
  expect(md).toContain('# rec_01H8XK');
  expect(md).toContain('## Step 1');
  expect(md).toContain('Click **Save draft**.');
  expect(md).toContain('![Step 1](screenshots/step-01.png)');
});

it('renders an explicit empty-doc body when nothing is documented', () => {
  expect(renderDocMarkdown(deriveDocSteps([event({ type: 'interaction.hover' })]), meta))
    .toContain('No documented steps were captured.');
});
