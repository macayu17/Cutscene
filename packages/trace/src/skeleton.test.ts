import { expect, it } from 'vitest';
import { generatePlaywrightSkeleton, type SkeletonInput } from './skeleton';
import type { Locator, TargetDescriptor, TraceEvent } from './schema';

const meta: SkeletonInput['meta'] = { recordingId: 'rec_01H8XK', url: 'https://app.example.com/dashboard' };

function target(locators: Locator[], overrides: Partial<TargetDescriptor> = {}): TargetDescriptor {
  return {
    role: 'button', accessibleName: 'Create report', text: 'Create report', tagName: 'BUTTON',
    boundingBox: { x: 0, y: 0, width: 10, height: 10 }, locators, ...overrides,
  };
}

function click(overrides: Partial<TraceEvent> = {}): TraceEvent {
  return {
    v: 1, id: 'evt', t: 0, stepId: 'step', route: '/dashboard',
    viewport: { width: 1440, height: 900, dpr: 2 }, scroll: { x: 0, y: 0 },
    type: 'interaction.click', ...overrides,
  } as TraceEvent;
}

it('emits a header goto and a skeleton, not a test, per recording', () => {
  const out = generatePlaywrightSkeleton({ meta, events: [] });
  expect(out).toContain("import { test, expect } from '@playwright/test';");
  expect(out).toContain("// This is a skeleton, not a test.");
  expect(out).toContain("test('rec_01H8XK', async ({ page }) => {");
  expect(out).toContain("await page.goto('https://app.example.com/dashboard');");
  expect(out).toContain('// no actionable events captured');
});

it('maps each locator tier to the correct Playwright accessor', () => {
  const cases: Array<[Locator, string]> = [
    [{ type: 'testId', value: 'create-report', confidence: 1 }, "page.getByTestId('create-report').click()"],
    [{ type: 'role', role: 'button', name: 'Create report', confidence: 0.9 }, "page.getByRole('button', { name: 'Create report' }).click()"],
    [{ type: 'label', value: 'Report name', confidence: 0.8 }, "page.getByLabel('Report name').click()"],
    [{ type: 'text', value: 'Create report', confidence: 0.6 }, "page.getByText('Create report').click()"],
    [{ type: 'css', value: 'main > header > button.primary', confidence: 0.2 }, "page.locator('main > header > button.primary').click()"],
  ];
  for (const [locator, expected] of cases) {
    const out = generatePlaywrightSkeleton({ meta, events: [click({ target: target([locator]) })] });
    expect(out).toContain(`await ${expected};`);
  }
});

it('uses only the highest-confidence locator', () => {
  const out = generatePlaywrightSkeleton({ meta, events: [click({ target: target([
    { type: 'testId', value: 'create-report', confidence: 1 },
    { type: 'css', value: 'button', confidence: 0.2 },
  ]) })] });
  expect(out).toContain("page.getByTestId('create-report').click()");
  expect(out).not.toContain("page.locator('button')");
});

it('fills inputs and marks masked values without inventing a secret', () => {
  const out = generatePlaywrightSkeleton({ meta, events: [click({
    type: 'interaction.input',
    target: target([{ type: 'label', value: 'Report name', confidence: 0.8 }], { value: '[MASKED]' }),
  })] });
  expect(out).toContain("await page.getByLabel('Report name').fill('[MASKED]');");
  expect(out).toContain('// value was masked at capture time');
});

it('suggests route changes and newly visible targets as comments only', () => {
  const out = generatePlaywrightSkeleton({ meta, events: [
    click({ route: '/dashboard', target: target([{ type: 'testId', value: 'create-report', confidence: 1 }]) }),
    click({ route: '/reports/new', target: target(
      [{ type: 'role', role: 'textbox', name: 'Report name', confidence: 0.9 }],
      { role: 'textbox', accessibleName: 'Report name' }) }),
  ] });
  expect(out).toContain('  // suggested: route changed to /reports/new');
  expect(out).toContain('  // suggested: "Report name" became visible');
  // A suggestion is never an executed assertion.
  expect(out).not.toMatch(/^\s*(await )?expect\(/m);
});

it('does not suggest a route change on the first action', () => {
  const out = generatePlaywrightSkeleton({ meta, events: [
    click({ route: '/dashboard', target: target([{ type: 'testId', value: 'create-report', confidence: 1 }]) }),
  ] });
  expect(out).not.toContain('route changed to');
});

it('escapes quotes and backslashes so names cannot break the source', () => {
  const out = generatePlaywrightSkeleton({ meta, events: [click({ target: target(
    [{ type: 'text', value: "O'Brien \\ co", confidence: 0.6 }]) })] });
  expect(out).toContain("page.getByText('O\\'Brien \\\\ co').click()");
});

it('leaves a TODO for a step with no locator, never a fabricated selector', () => {
  const out = generatePlaywrightSkeleton({ meta, events: [click({ target: target([]) })] });
  expect(out).toContain("// TODO: no locator resolved for 'Create report'");
  expect(out).not.toContain('page.locator');
});

it('leaves a TODO for a step with no target', () => {
  // click() with no override carries no target property.
  const out = generatePlaywrightSkeleton({ meta, events: [click()] });
  expect(out).toContain('// TODO: no target captured for this step');
});
