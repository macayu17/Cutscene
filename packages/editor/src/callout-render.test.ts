import { expect, it } from 'vitest';
import { wrapCalloutText } from './callout-render';

it('wraps callout text into a bounded number of lines', () => {
  expect(wrapCalloutText('one two three four', 7, 3)).toEqual(['one two', 'three', 'four']);
  expect(wrapCalloutText('one two three four five', 7, 2)).toEqual(['one two', 'three…']);
});
