import type { TraceEventType } from '@cutscene/trace';

type SensitiveElement = Pick<Element, 'matches' | 'closest'>;

export function hasSensitiveContext(element: SensitiveElement): boolean {
  const selector = '[data-sensitive], [data-private]';
  return element.matches(selector) || element.closest(selector) !== null;
}

export function nextStep(current: number, type: TraceEventType): { current: number; id: string } {
  const next = type === 'interaction.click' ? current + 1 : current;
  return { current: next, id: `step_${String(next).padStart(4, '0')}` };
}
