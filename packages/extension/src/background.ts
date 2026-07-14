import type { RecorderStatus, Result } from './messages';

const offscreenPath = 'offscreen.html';

async function ensureOffscreen(): Promise<void> {
  const url = chrome.runtime.getURL(offscreenPath);
  if ((await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT], documentUrls: [url] })).length) return;
  await chrome.offscreen.createDocument({ url: offscreenPath, reasons: [chrome.offscreen.Reason.USER_MEDIA, chrome.offscreen.Reason.BLOBS], justification: 'Record a tab and persist its local recording bundle.' });
}

async function start(tabId: number, includeMic: boolean): Promise<Result<RecorderStatus>> {
  try {
    await ensureOffscreen();
    const sessionEpoch = Date.now();
    const context = await chrome.tabs.sendMessage(tabId, { type: 'session.start', sessionEpoch }) as Result;
    if (!context.ok) return context;
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
    const result = await chrome.runtime.sendMessage({ type: 'offscreen.start', streamId, tabId, sessionEpoch, includeMic, context: context.value }) as Result<RecorderStatus>;
    if (!result.ok) await chrome.tabs.sendMessage(tabId, { type: 'session.stop' });
    return result;
  } catch (error: unknown) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
}

async function stop(): Promise<Result<RecorderStatus>> {
  try {
    const status = await chrome.runtime.sendMessage({ type: 'offscreen.status' }) as Result<RecorderStatus>;
    if (!status.ok || status.value.tabId === null) return status;
    const result = await chrome.runtime.sendMessage({ type: 'offscreen.stop' }) as Result<RecorderStatus>;
    await chrome.tabs.sendMessage(status.value.tabId, { type: 'session.stop' }).catch(() => undefined);
    return result;
  } catch (error: unknown) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, respond) => {
  if (!message || typeof message !== 'object' || !('type' in message)) return false;
  if (message.type === 'recording.start' && 'tabId' in message && typeof message.tabId === 'number') {
    void start(message.tabId, 'includeMic' in message && message.includeMic === true).then(respond); return true;
  }
  if (message.type === 'recording.stop') { void stop().then(respond); return true; }
  if (message.type === 'recording.status') { void ensureOffscreen().then(() => chrome.runtime.sendMessage({ type: 'offscreen.status' })).then(respond); return true; }
  if (message.type === 'clock.sample' && 'tabId' in message && typeof message.tabId === 'number' && 'sessionEpoch' in message && typeof message.sessionEpoch === 'number') {
    const workerClockMs = Date.now() - message.sessionEpoch;
    void chrome.tabs.sendMessage(message.tabId, { type: 'clock.sample' }).then((sample: Result<number>) => respond(sample.ok ? { ok: true, value: { contentClockMs: sample.value, workerClockMs } } : sample));
    return true;
  }
  if (message.type === 'downloads.start' && 'recordingId' in message && typeof message.recordingId === 'string' &&
      'mediaUrl' in message && typeof message.mediaUrl === 'string' && 'traceUrl' in message && typeof message.traceUrl === 'string' &&
      'metaUrl' in message && typeof message.metaUrl === 'string') {
    const folder = `cutscene-${message.recordingId}`;
    void Promise.all([
      chrome.downloads.download({ url: message.mediaUrl, filename: `${folder}/media.webm` }),
      chrome.downloads.download({ url: message.traceUrl, filename: `${folder}/trace.jsonl` }),
      chrome.downloads.download({ url: message.metaUrl, filename: `${folder}/meta.json` }),
    ]).then(() => respond({ ok: true, value: undefined } satisfies Result)).catch((error: unknown) => respond({ ok: false, error: error instanceof Error ? error.message : String(error) } satisfies Result));
    return true;
  }
  return false;
});
