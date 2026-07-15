import { describe, expect, it, vi } from 'vitest';
import type { TraceEvent } from '@cutscene/trace';
import { createTraceDeliveryQueue } from './trace-delivery';

const event = { v: 1, id: 'evt_1', t: 1, type: 'interaction.hover', stepId: 'step_1', route: '/',
  viewport: { width: 100, height: 100, dpr: 1 }, scroll: { x: 0, y: 0 }, pointer: { x: 1, y: 2 } } satisfies TraceEvent;

describe('createTraceDeliveryQueue', () => {
  it('waits for every pending delivery before reporting success', async () => {
    let acknowledge: ((result: { ok: true; value: undefined }) => void) | undefined;
    const delivery = new Promise<{ ok: true; value: undefined }>((resolve) => { acknowledge = resolve; });
    const queue = createTraceDeliveryQueue(vi.fn().mockReturnValue(delivery));
    queue.send(event);
    let drained = false;
    const draining = queue.drain().then((result) => { drained = true; return result; });
    await Promise.resolve();
    expect(drained).toBe(false);
    acknowledge?.({ ok: true, value: undefined });
    await expect(draining).resolves.toEqual({ ok: true, value: undefined });
  });

  it('reports a rejected trace delivery when drained', async () => {
    const queue = createTraceDeliveryQueue(vi.fn().mockRejectedValue(new Error('Trace port closed.')));
    queue.send(event);
    await expect(queue.drain()).resolves.toEqual({ ok: false, error: 'Trace port closed.' });
  });

  it('preserves a negative trace acknowledgement', async () => {
    const queue = createTraceDeliveryQueue(vi.fn().mockResolvedValue({ ok: false, error: 'Trace was not recorded.' }));
    queue.send(event);
    await expect(queue.drain()).resolves.toEqual({ ok: false, error: 'Trace was not recorded.' });
  });
});
