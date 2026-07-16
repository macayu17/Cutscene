import type { Locator } from './schema.ts';

export type LocatorObservation = {
  testId?: string;
  role?: string;
  accessibleName?: string;
  label?: string;
  text?: string;
  css?: string;
};

export function rankLocators(input: LocatorObservation): Locator[] {
  const result: Locator[] = [];
  if (input.testId) result.push({ type: 'testId', value: input.testId, confidence: 1 });
  if (input.role && input.accessibleName) result.push({ type: 'role', role: input.role, name: input.accessibleName, confidence: 0.9 });
  if (input.label) result.push({ type: 'label', value: input.label, confidence: 0.8 });
  if (input.text) result.push({ type: 'text', value: input.text, confidence: 0.6 });
  if (input.css) result.push({ type: 'css', value: input.css, confidence: 0.2 });
  return result;
}
