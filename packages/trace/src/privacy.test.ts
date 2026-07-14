import { describe, expect, it } from 'vitest';
import { sanitizeTarget } from './privacy';

const target = {
  role: 'textbox', accessibleName: 'Token', text: 'secret', tagName: 'INPUT',
  boundingBox: { x: 1, y: 2, width: 100, height: 20 }, locators: [], value: 'raw-token',
};

describe('sanitizeTarget', () => {
  it('drops password targets completely', () => {
    expect(sanitizeTarget({ ...target, inputType: 'password' })).toBeNull();
  });

  it('masks input values before constructing the target', () => {
    expect(sanitizeTarget({ ...target, inputType: 'text' })?.value).toBe('[MASKED]');
  });

  it('masks sensitive text and value', () => {
    expect(sanitizeTarget({ ...target, sensitive: true })).toMatchObject({ text: '[MASKED]', value: '[MASKED]' });
  });

  it('unmasks only an explicitly matched selector', () => {
    expect(sanitizeTarget({ ...target, inputType: 'text', selector: '#safe' }, ['#safe'])?.value).toBe('raw-token');
    expect(sanitizeTarget({ ...target, inputType: 'text', selector: '#other' }, ['#safe'])?.value).toBe('[MASKED]');
  });
});
