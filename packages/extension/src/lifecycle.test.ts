import { describe, expect, it } from 'vitest';
import { finishRecording } from './lifecycle';

describe('finishRecording', () => {
  it('waits for capture to drain before finalizing and then clears the session', async () => {
    const calls: string[] = [];
    let releaseCapture: (() => void) | undefined;
    const captureDrained = new Promise<void>((resolve) => { releaseCapture = resolve; });
    const result = finishRecording(
      async () => { calls.push('quiesce'); await captureDrained; },
      async () => { calls.push('finalize'); return 'saved'; },
      async () => { calls.push('cleanup'); },
    );

    await Promise.resolve();
    expect(calls).toEqual(['quiesce']);
    releaseCapture?.();
    await expect(result).resolves.toBe('saved');
    expect(calls).toEqual(['quiesce', 'finalize', 'cleanup']);
  });
});
