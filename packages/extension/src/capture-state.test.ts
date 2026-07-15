import { describe, expect, it, vi } from 'vitest';
import type { TraceEventType } from '@cutscene/trace';
import { hasSensitiveContext, nextStep } from './capture-state';

describe('hasSensitiveContext', () => {
  it('detects a sensitive ancestor', () => {
    const element = { matches: vi.fn(() => false), closest: vi.fn(() => ({})) };
    expect(hasSensitiveContext(element)).toBe(true);
  });
});

describe('nextStep', () => {
  it('increments only for clicks and reuses the current step for other events', () => {
    const types: TraceEventType[] = ['interaction.hover', 'interaction.click', 'interaction.input',
      'annotation.redaction', 'interaction.click', 'interaction.scroll'];
    let current = 0;
    const ids = types.map((type) => {
      const next = nextStep(current, type);
      current = next.current;
      return next.id;
    });
    expect(ids).toEqual(['step_0000', 'step_0001', 'step_0001', 'step_0001', 'step_0002', 'step_0002']);
  });
});
