import { beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (message: unknown, sender: unknown, respond: (result: unknown) => void) => boolean;

describe('recording start', () => {
  beforeEach(() => { vi.resetModules(); vi.unstubAllGlobals(); });

  it('explains when the active tab has no content script', async () => {
    let listener: Listener | undefined;
    const tabsSend = vi.fn(async () => { throw new Error('Could not establish connection. Receiving end does not exist.'); });
    vi.stubGlobal('chrome', {
      runtime: {
        ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
        getURL: vi.fn(() => 'chrome-extension://cutscene/offscreen.html'),
        getContexts: vi.fn(async () => [{}]),
        sendMessage: vi.fn(),
        onMessage: { addListener: vi.fn((value: Listener) => { listener = value; }) },
      },
      tabs: { sendMessage: tabsSend },
      storage: { session: { get: vi.fn(), set: vi.fn(), remove: vi.fn() } },
    });
    await import('./background');
    if (!listener) throw new Error('Background listener was not registered.');
    const responses: unknown[] = [];

    expect(listener({ type: 'recording.start', tabId: 7, includeMic: false, redactSelectors: [] }, {},
      (response) => responses.push(response))).toBe(true);
    await vi.waitFor(() => expect(responses).toEqual([{ ok: false,
      error: 'This tab cannot be recorded. Open or reload an http or https page.' }]));
  });
});

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
      onMessage: { addListener: vi.fn((value: Listener) => { listener = value; }) } }, tabs: { sendMessage: tabsSend },
      action: { setBadgeText: vi.fn(), setBadgeBackgroundColor: vi.fn() } });
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

describe('concurrent start', () => {
  beforeEach(() => { vi.resetModules(); vi.unstubAllGlobals(); });

  // A second start used to reset the live content session and then cancel the running
  // recorder, which deletes the take the flush had been saving.
  it('refuses a start against a running recorder without touching it', async () => {
    let listener: Listener | undefined;
    const runtimeSend = vi.fn(async (message: { type: string }) => {
      if (message.type === 'offscreen.status') {
        return { ok: true, value: { recording: true, tabId: 7, clickCount: 3, startedAt: 1, recordingId: 'rec_1' } };
      }
      throw new Error(`Unexpected runtime message: ${message.type}`);
    });
    const tabsSend = vi.fn(async () => { throw new Error('The content script must not be touched.'); });
    vi.stubGlobal('chrome', {
      runtime: {
        ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
        getURL: vi.fn(() => 'chrome-extension://cutscene/offscreen.html'),
        getContexts: vi.fn(async () => [{}]),
        sendMessage: runtimeSend,
        onMessage: { addListener: vi.fn((value: Listener) => { listener = value; }) },
      },
      tabs: { sendMessage: tabsSend },
      storage: { session: { get: vi.fn(), set: vi.fn(), remove: vi.fn() } },
      action: { setBadgeText: vi.fn(), setBadgeBackgroundColor: vi.fn() },
    });
    await import('./background');
    if (!listener) throw new Error('Background listener was not registered.');
    const responses: unknown[] = [];

    expect(listener({ type: 'recording.start', tabId: 9, includeMic: false, redactSelectors: [] }, {},
      (response) => responses.push(response))).toBe(true);
    await vi.waitFor(() => expect(responses).toEqual([{ ok: false, error: 'A recording is already active.' }]));
    expect(tabsSend).not.toHaveBeenCalled();
    expect(runtimeSend.mock.calls.map(([message]) => message.type)).toEqual(['offscreen.status']);
  });
});

describe('content rejoin', () => {
  beforeEach(() => { vi.resetModules(); vi.unstubAllGlobals(); });

  it('reattaches a replacement content script with the original epoch and selectors', async () => {
    let listener: Listener | undefined;
    const tabsSend = vi.fn(async (_tabId: number, message: { type: string }) =>
      message.type === 'session.start' ? { ok: true, value: {} } : { ok: true, value: undefined });
    vi.stubGlobal('chrome', {
      runtime: { getURL: vi.fn(), sendMessage: vi.fn(), onMessage: { addListener: vi.fn((value: Listener) => { listener = value; }) } },
      tabs: { sendMessage: tabsSend },
      storage: { session: { get: vi.fn(async () => ({ activeRecording: { tabId: 7, sessionEpoch: 123,
        redactSelectors: ['.secret'], captureReady: true } })), set: vi.fn(), remove: vi.fn() } },
    });
    await import('./background');
    if (!listener) throw new Error('Background listener was not registered.');
    const responses: unknown[] = [];
    expect(listener({ type: 'session.contentReady' }, { tab: { id: 7 } }, (response) => responses.push(response))).toBe(true);
    await vi.waitFor(() => expect(responses).toEqual([{ ok: true, value: undefined }]));
    expect(tabsSend).toHaveBeenNthCalledWith(1, 7, { type: 'session.start', sessionEpoch: 123, redactSelectors: ['.secret'] });
    expect(tabsSend).toHaveBeenNthCalledWith(2, 7, { type: 'session.captureReady', navigation: true });
  });
});
