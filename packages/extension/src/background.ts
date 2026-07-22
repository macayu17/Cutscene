import { RECORDER_BUSY, type RecorderStatus, type Result } from './messages';

const offscreenPath = 'offscreen.html';
const editorPath = 'editor.html';
const activeRecordingKey = 'activeRecording';

/** The toolbar icon is the only recording indicator a user sees once the popup closes. */
function indicate(recording: boolean): void {
  void chrome.action.setBadgeText({ text: recording ? 'REC' : '' });
  void chrome.action.setBadgeBackgroundColor({ color: '#C7524B' });
}
type ActiveRecording = { tabId: number; sessionEpoch: number; redactSelectors: string[]; captureReady: boolean };

async function activeRecording(): Promise<ActiveRecording | null> {
  const stored = await chrome.storage.session.get(activeRecordingKey);
  const value = stored[activeRecordingKey];
  return value && typeof value === 'object' ? value as ActiveRecording : null;
}

async function saveActiveRecording(value: ActiveRecording): Promise<void> {
  await chrome.storage.session.set({ [activeRecordingKey]: value });
}

async function clearActiveRecording(): Promise<void> { await chrome.storage.session.remove(activeRecordingKey); }

async function reattach(tabId: number): Promise<Result> {
  const active = await activeRecording();
  if (!active || !active.captureReady || active.tabId !== tabId) return { ok: true, value: undefined };
  const started = await chrome.tabs.sendMessage(tabId, { type: 'session.start', sessionEpoch: active.sessionEpoch,
    redactSelectors: active.redactSelectors }) as Result;
  if (!started.ok) return started;
  return chrome.tabs.sendMessage(tabId, { type: 'session.captureReady', navigation: true }) as Promise<Result>;
}

async function ensureOffscreen(): Promise<void> {
  const url = chrome.runtime.getURL(offscreenPath);
  if ((await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT], documentUrls: [url] })).length) return;
  await chrome.offscreen.createDocument({ url: offscreenPath, reasons: [chrome.offscreen.Reason.USER_MEDIA, chrome.offscreen.Reason.BLOBS], justification: 'Record a tab and persist its local recording bundle.' });
}

// A second start must never touch the running recording: it resets the content
// session's clock and its rollback would cancel and delete a take it does not own.
// The flag closes the double-click window the status check alone cannot see.
let starting = false;

async function start(tabId: number, includeMic: boolean, redactSelectors: readonly string[]): Promise<Result<RecorderStatus>> {
  if (starting) return { ok: false, error: RECORDER_BUSY };
  starting = true;
  let sessionStarted = false;
  let offscreenStarted = false;
  try {
    await ensureOffscreen();
    // An unreachable or silent recorder is not a running recording, so only a
    // well-formed answer may refuse this start.
    const active = await Promise.resolve(chrome.runtime.sendMessage({ type: 'offscreen.status' }))
      .catch(() => null) as Result<RecorderStatus> | null;
    if (active?.ok && active.value.recording) return { ok: false, error: RECORDER_BUSY };
    const sessionEpoch = Date.now();
    const context = await chrome.tabs.sendMessage(tabId, { type: 'session.start', sessionEpoch, redactSelectors }) as Result;
    if (!context.ok) return context;
    sessionStarted = true;
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
    const result = await chrome.runtime.sendMessage({ type: 'offscreen.start', streamId, tabId, sessionEpoch, includeMic,
      context: context.value }) as Result<RecorderStatus>;
    if (!result.ok) {
      // Only roll back a capture this call created. A busy recorder owns itself.
      if (result.error !== RECORDER_BUSY) await chrome.runtime.sendMessage({ type: 'offscreen.cancel' }).catch(() => undefined);
      await chrome.tabs.sendMessage(tabId, { type: 'session.stop' }); sessionStarted = false;
    } else {
      offscreenStarted = true;
      const ready = await chrome.tabs.sendMessage(tabId, { type: 'session.captureReady' }) as Result;
      if (!ready.ok) {
        await chrome.runtime.sendMessage({ type: 'offscreen.cancel' }); offscreenStarted = false;
        await chrome.tabs.sendMessage(tabId, { type: 'session.stop' }).catch(() => undefined); sessionStarted = false;
        return ready;
      }
      await saveActiveRecording({ tabId, sessionEpoch, redactSelectors: [...redactSelectors], captureReady: true });
      indicate(true);
    }
    return result;
  } catch (error: unknown) {
    if (offscreenStarted) await chrome.runtime.sendMessage({ type: 'offscreen.cancel' }).catch(() => undefined);
    if (sessionStarted) await chrome.tabs.sendMessage(tabId, { type: 'session.stop' }).catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message.includes('Receiving end does not exist')
      ? 'This tab cannot be recorded. Open or reload an http or https page.' : message };
  } finally {
    starting = false;
  }
}

async function stop(): Promise<Result<RecorderStatus>> {
  try {
    const status = await chrome.runtime.sendMessage({ type: 'offscreen.status' }) as Result<RecorderStatus>;
    // An unreachable or idle recorder means nothing is recording, whatever the badge says.
    if (!status.ok || status.value.tabId === null) { indicate(false); return status; }
    const tabId = status.value.tabId;
    await clearActiveRecording().catch(() => undefined);
    indicate(false);
    let quiesced: Result;
    try { quiesced = await chrome.tabs.sendMessage(tabId, { type: 'session.quiesce' }) as Result; }
    catch (error: unknown) { quiesced = { ok: false, error: error instanceof Error ? error.message : String(error) }; }
    if (!quiesced.ok) {
      await Promise.allSettled([
        chrome.runtime.sendMessage({ type: 'offscreen.cancel' }),
        chrome.tabs.sendMessage(tabId, { type: 'session.stop' }),
      ]);
      return quiesced;
    }
    try { return await chrome.runtime.sendMessage({ type: 'offscreen.stop' }) as Result<RecorderStatus>; }
    finally { await chrome.tabs.sendMessage(tabId, { type: 'session.stop' }).catch(() => undefined); }
  } catch (error: unknown) {
    indicate(false);
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, respond) => {
  if (!message || typeof message !== 'object' || !('type' in message)) return false;
  if (message.type === 'recording.start' && 'tabId' in message && typeof message.tabId === 'number') {
    const redactSelectors = 'redactSelectors' in message && Array.isArray(message.redactSelectors) &&
      message.redactSelectors.every((value) => typeof value === 'string') ? message.redactSelectors : [];
    void start(message.tabId, 'includeMic' in message && message.includeMic === true, redactSelectors).then(respond); return true;
  }
  if (message.type === 'recording.stop') { void stop().then(respond); return true; }
  if (message.type === 'recording.status') { void ensureOffscreen().then(() => chrome.runtime.sendMessage({ type: 'offscreen.status' })).then(respond); return true; }
  if (message.type === 'session.contentReady') {
    const sender = _sender as chrome.runtime.MessageSender;
    if (sender.tab?.id === undefined) { respond({ ok: true, value: undefined } satisfies Result); return false; }
    void reattach(sender.tab.id).then(respond).catch((error: unknown) => respond({ ok: false,
      error: error instanceof Error ? error.message : String(error) } satisfies Result));
    return true;
  }
  if (message.type === 'clock.sample' && 'tabId' in message && typeof message.tabId === 'number' && 'sessionEpoch' in message && typeof message.sessionEpoch === 'number') {
    const workerClockMs = Date.now() - message.sessionEpoch;
    void chrome.tabs.sendMessage(message.tabId, { type: 'clock.sample' }).then((sample: Result<number>) =>
      respond(sample.ok ? { ok: true, value: { contentClockMs: sample.value, workerClockMs } } : sample))
      .catch((error: unknown) => respond({ ok: false, error: error instanceof Error ? error.message : String(error) } satisfies Result));
    return true;
  }
  if (message.type === 'downloads.start' && 'recordingId' in message && typeof message.recordingId === 'string' &&
      'mediaUrl' in message && typeof message.mediaUrl === 'string' && 'traceUrl' in message && typeof message.traceUrl === 'string' &&
      'metaUrl' in message && typeof message.metaUrl === 'string') {
    const folder = `cutscene-${message.recordingId}`;
    const recordingId = message.recordingId;
    // The bundle is already in IndexedDB, which the editor page shares an origin with,
    // so the editor opens on the recording itself rather than on a folder picker. A
    // refused or failed download must not cost the user the editor as well.
    void Promise.allSettled([
      chrome.downloads.download({ url: message.mediaUrl, filename: `${folder}/media.webm` }),
      chrome.downloads.download({ url: message.traceUrl, filename: `${folder}/trace.jsonl` }),
      chrome.downloads.download({ url: message.metaUrl, filename: `${folder}/meta.json` }),
    ]).then(async (settled) => {
      await chrome.tabs.create({ url: `${chrome.runtime.getURL(editorPath)}?recording=${recordingId}` })
        .catch(() => undefined);
      const failed = settled.find((outcome) => outcome.status === 'rejected');
      respond(failed
        ? { ok: false, error: `Recording saved. Download failed: ${String(failed.reason)}` } satisfies Result
        : { ok: true, value: undefined } satisfies Result);
    });
    return true;
  }
  return false;
});
