import { expect, it } from 'vitest';
import { rankLocators } from './locators';

it('ranks stable locators by confidence and keeps CSS last', () => {
  const locators = rankLocators({
    testId: 'save', role: 'button', accessibleName: 'Save', label: 'Save', text: 'Save', css: 'main > button',
  });
  expect(locators.map(({ type, confidence }) => [type, confidence])).toEqual([
    ['testId', 1], ['role', 0.9], ['label', 0.8], ['text', 0.6], ['css', 0.2],
  ]);
});
