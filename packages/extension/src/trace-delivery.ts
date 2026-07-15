import type { TraceEvent } from '@cutscene/trace';
import type { Result } from './messages';

export function createTraceDeliveryQueue(send: (event: TraceEvent) => Promise<Result>) {
  const pending = new Set<Promise<void>>();
  let failure: string | null = null;
  return {
    send(event: TraceEvent): void {
      const delivery = send(event).then(
        (result) => { if (!result.ok) failure ??= result.error; },
        (error: unknown) => { failure ??= error instanceof Error ? error.message : String(error); },
      );
      pending.add(delivery);
      void delivery.then(() => pending.delete(delivery));
    },
    async drain(): Promise<Result> {
      await Promise.all([...pending]);
      return failure === null ? { ok: true, value: undefined } : { ok: false, error: failure };
    },
  };
}
