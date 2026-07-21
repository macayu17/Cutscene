import { expect, it } from 'vitest';
import { analyzeQuality, renderQualityReport } from './quality';
import type { Locator, TargetDescriptor, TraceEvent } from './schema';

function target(overrides: Partial<TargetDescriptor> = {}): TargetDescriptor {
  return {
    role: 'button', accessibleName: 'Create report', text: 'Create report', tagName: 'BUTTON',
    boundingBox: { x: 1, y: 2, width: 3, height: 4 },
    locators: [{ type: 'testId', value: 'create', confidence: 1 }] as Locator[], ...overrides,
  };
}

function event(overrides: Partial<TraceEvent>): TraceEvent {
  return {
    v: 1, id: 'evt', t: 0, stepId: 'step', route: '/',
    viewport: { width: 1440, height: 900, dpr: 2 }, scroll: { x: 0, y: 0 },
    type: 'interaction.click', ...overrides,
  } as TraceEvent;
}

it('reports nothing for a well-described element with a strong locator', () => {
  expect(analyzeQuality([event({ target: target() })])).toEqual([]);
});

it('flags an interaction on an element with no accessible name', () => {
  const findings = analyzeQuality([event({ target: target({ accessibleName: '  ' }) })]);
  expect(findings.map((finding) => finding.kind)).toEqual(['missing-accessible-name']);
});

it('flags a missing role separately from a missing name', () => {
  const findings = analyzeQuality([event({ target: target({ role: null }) })]);
  expect(findings.map((finding) => finding.kind)).toEqual(['missing-role']);
});

it('flags text and css locators as fragile but accepts role', () => {
  const fragile = analyzeQuality([event({ target: target({ locators: [{ type: 'css', value: '.a', confidence: 0.2 }] }) })]);
  expect(fragile.map((finding) => finding.kind)).toEqual(['fragile-locator']);
  const solid = analyzeQuality([event({ target: target({ locators: [{ type: 'role', role: 'button', name: 'Go', confidence: 0.9 }] }) })]);
  expect(solid).toEqual([]);
});

it('flags an element with no captured locator at all', () => {
  const findings = analyzeQuality([event({ target: target({ locators: [] }) })]);
  expect(findings.map((finding) => finding.kind)).toEqual(['no-locator']);
});

it('ignores events that carry no target', () => {
  const scroll = {
    v: 1, id: 'evt', t: 0, stepId: 'step', route: '/',
    viewport: { width: 1440, height: 900, dpr: 2 }, scroll: { x: 0, y: 0 },
    type: 'interaction.scroll',
  } as TraceEvent;
  expect(analyzeQuality([scroll])).toEqual([]);
});

it('never leaks a masked value into the report', () => {
  const findings = analyzeQuality([event({
    type: 'interaction.input',
    target: target({ role: 'textbox', tagName: 'INPUT', accessibleName: '[MASKED]', text: '[MASKED]', value: 'hunter2', locators: [{ type: 'css', value: '.pw', confidence: 0.2 }] }),
  })]);
  const report = renderQualityReport(findings);
  expect(report).not.toContain('hunter2');
  expect(report).toContain('textbox');
});

it('renders a clean report when there is nothing to flag', () => {
  expect(renderQualityReport([])).toContain('No accessibility or locator-fragility findings');
});

it('groups findings under one heading each', () => {
  const report = renderQualityReport(analyzeQuality([
    event({ id: 'a', target: target({ accessibleName: '' }) }),
    event({ id: 'b', t: 2_000, target: target({ locators: [{ type: 'text', value: 'Go', confidence: 0.6 }] }) }),
  ]));
  expect(report).toContain('Interactions on elements with no accessible name (1)');
  expect(report).toContain('Steps that will drift when the markup or copy changes (1)');
  expect(report).toContain('2.0s');
});
