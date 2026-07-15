import { beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (message: unknown, sender: unknown, respond: (result: unknown) => void) => boolean;

describe('recording stop', () => {
  beforeEach(() => { vi.resetModules(); vi.unstubAllGlobals(); });

  it('cancels instead of finalizing when trace quiesce fails', async () => {
    let listener: Listener | undefined;
    let finalized = false;
    const runtimeSend = vi.fn(async (message: { type: string }) => {
      if (message.type === 'offscreen.status') return { ok: true, value: { recording: true, tabId: 7, clickCount: 0,
        startedAt: 1, recordingId: 'rec_1' } };
      if (message.type === 'offscreen.stop') { finalized = true; return { ok: true, value: undefined }; }
      if (message.type === 'offscreen.cancel') throw new Error('Cancel cleanup failed.');
      throw new Error(`Unexpected runtime message: ${message.type}`);
    });
    const tabsSend = vi.fn(async (_tabId: number, message: { type: string }) => {
      if (message.type === 'session.quiesce') return { ok: false, error: 'Trace delivery failed.' };
      if (message.type === 'session.stop') throw new Error('Session cleanup failed.');
      throw new Error(`Unexpected tab message: ${message.type}`);
    });
    vi.stubGlobal('chrome', { runtime: { getURL: vi.fn(), sendMessage: runtimeSend,
      onMessage: { addListener: vi.fn((value: Listener) => { listener = value; }) } }, tabs: { sendMessage: tabsSend } });
    await import('./background');
    if (!listener) throw new Error('Background listener was not registered.');
    const responses: unknown[] = [];

    expect(listener({ type: 'recording.stop' }, {}, (response) => responses.push(response))).toBe(true);
    await vi.waitFor(() => expect(responses).toEqual([{ ok: false, error: 'Trace delivery failed.' }]));
    expect(finalized).toBe(false);
    expect(runtimeSend.mock.calls.map(([message]) => message.type)).toEqual(['offscreen.status', 'offscreen.cancel']);
    expect(tabsSend.mock.calls.map(([, message]) => message.type)).toEqual(['session.quiesce', 'session.stop']);
  });
});
