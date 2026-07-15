import type { TraceEvent } from '@cutscene/trace';
import type { Result } from './messages';

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function acknowledgement(value: unknown): Result {
  if (typeof value === 'object' && value !== null && 'ok' in value) {
    if (value.ok === true) return { ok: true, value: undefined };
    if (value.ok === false && 'error' in value && typeof value.error === 'string') return { ok: false, error: value.error };
  }
  return { ok: false, error: 'Trace acknowledgement is invalid.' };
}

export function createTraceDeliveryQueue(send: (event: TraceEvent) => Promise<unknown>) {
  const pending = new Set<Promise<void>>();
  let failure: string | null = null;
  return {
    send(event: TraceEvent): void {
      let delivery: Promise<void>;
      try {
        delivery = send(event).then(
          (value) => { const result = acknowledgement(value); if (!result.ok) failure ??= result.error; },
          (error: unknown) => { failure ??= failureMessage(error); },
        );
      } catch (error: unknown) { failure ??= failureMessage(error); return; }
      pending.add(delivery);
      void delivery.finally(() => pending.delete(delivery));
    },
    async drain(): Promise<Result> {
      await Promise.all([...pending]);
      return failure === null ? { ok: true, value: undefined } : { ok: false, error: failure };
    },
  };
}
