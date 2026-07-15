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

  it('removes every semantic secret from sensitive targets before serialization', () => {
    const secrets = ['Account token', 'sk-live-secret', 'Submit secret'] as const;
    const sanitized = sanitizeTarget({
      ...target,
      accessibleName: secrets[0],
      text: secrets[1],
      value: secrets[2],
      sensitive: true,
      locators: [
        { type: 'testId', value: 'submit-token', confidence: 1 },
        { type: 'role', role: 'button', name: secrets[0], confidence: 0.9 },
        { type: 'label', value: secrets[1], confidence: 0.8 },
        { type: 'text', value: secrets[2], confidence: 0.6 },
        { type: 'css', value: '#submit-token', confidence: 0.2 },
        { type: 'css', value: `#${secrets[1]}`, confidence: 0.1 },
      ],
    });

    expect(sanitized).toMatchObject({
      role: 'textbox',
      accessibleName: '[MASKED]',
      text: '[MASKED]',
      tagName: 'INPUT',
      boundingBox: target.boundingBox,
      value: '[MASKED]',
      locators: [
        { type: 'testId', value: 'submit-token', confidence: 1 },
        { type: 'css', value: '#submit-token', confidence: 0.2 },
      ],
    });
    const serialized = JSON.stringify(sanitized);
    for (const secret of secrets) expect(serialized).not.toContain(secret);
  });

  it('unmasks only an explicitly matched selector', () => {
    expect(sanitizeTarget({ ...target, inputType: 'text', selector: '#safe' }, ['#safe'])?.value).toBe('raw-token');
    expect(sanitizeTarget({ ...target, inputType: 'text', selector: '#other' }, ['#safe'])?.value).toBe('[MASKED]');
  });
});
