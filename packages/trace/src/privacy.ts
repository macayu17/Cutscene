import type { TargetDescriptor } from './schema';

export type TargetObservation = TargetDescriptor & {
  inputType?: string;
  sensitive?: boolean;
  selector?: string;
};

export function sanitizeTarget(input: TargetObservation, unmaskSelectors: readonly string[] = []): TargetDescriptor | null {
  if (input.inputType === 'password') return null;
  const unmasked = input.selector !== undefined && unmaskSelectors.includes(input.selector);
  const masked = input.sensitive === true || (input.value !== undefined && !unmasked);
  const target: TargetDescriptor = {
    role: input.role,
    accessibleName: input.accessibleName,
    text: input.sensitive === true ? '[MASKED]' : input.text,
    tagName: input.tagName,
    boundingBox: input.boundingBox,
    locators: input.locators,
  };
  if (input.value !== undefined) target.value = masked ? '[MASKED]' : input.value;
  return target;
}
