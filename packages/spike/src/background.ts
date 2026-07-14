import type { RecorderStatus, Result } from './messages';

const OFFSCREEN_PATH = 'offscreen.html';

async function ensureOffscreenDocument(): Promise<void> {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_PATH);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [offscreenUrl],
  });
  if (contexts.length > 0) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: [chrome.offscreen.Reason.USER_MEDIA, chrome.offscreen.Reason.BLOBS],
    justification: 'Record the selected browser tab and prepare the recording bundle.',
  });
}

async function startRecording(tabId: number): Promise<Result<RecorderStatus>> {
  try {
    await ensureOffscreenDocument();
    const sessionEpoch = Date.now();
    const content = (await chrome.tabs.sendMessage(tabId, {
      type: 'session.start',
      sessionEpoch,
    })) as Result<{ width: number; height: number; dpr: number }>;
    if (!content.ok) return content;

    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
    const result = (await chrome.runtime.sendMessage({
      type: 'offscreen.start',
      streamId,
      tabId,
      sessionEpoch,
      viewport: content.value,
    })) as Result<RecorderStatus>;
    if (!result.ok) await chrome.tabs.sendMessage(tabId, { type: 'session.stop' });
    return result;
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function stopRecording(): Promise<Result<RecorderStatus>> {
  try {
    const status = (await chrome.runtime.sendMessage({ type: 'offscreen.status' })) as Result<RecorderStatus>;
    if (!status.ok || status.value.tabId === null) return status;
    const result = (await chrome.runtime.sendMessage({ type: 'offscreen.stop' })) as Result<RecorderStatus>;
    await chrome.tabs.sendMessage(status.value.tabId, { type: 'session.stop' }).catch(() => undefined);
    return result;
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!message || typeof message !== 'object' || !('type' in message)) return false;

  if (message.type === 'recording.start' && 'tabId' in message && typeof message.tabId === 'number') {
    void startRecording(message.tabId).then(sendResponse);
    return true;
  }
  if (message.type === 'recording.stop') {
    void stopRecording().then(sendResponse);
    return true;
  }
  if (message.type === 'recording.status') {
    void ensureOffscreenDocument()
      .then(() => chrome.runtime.sendMessage({ type: 'offscreen.status' }))
      .then(sendResponse)
      .catch((error: unknown) =>
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) } satisfies Result),
      );
    return true;
  }
  if (message.type === 'clock.sample' && 'tabId' in message && typeof message.tabId === 'number') {
    const workerClockMs = 'sessionEpoch' in message && typeof message.sessionEpoch === 'number'
      ? Date.now() - message.sessionEpoch
      : 0;
    void chrome.tabs
      .sendMessage(message.tabId, { type: 'clock.sample' })
      .then((content: Result<number>) =>
        content.ok
          ? { ok: true, value: { contentClockMs: content.value, workerClockMs } } satisfies Result<{
              contentClockMs: number;
              workerClockMs: number;
            }>
          : content,
      )
      .then(sendResponse)
      .catch((error: unknown) =>
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) } satisfies Result),
      );
    return true;
  }
  if (message.type === 'downloads.start' && 'mediaUrl' in message && 'traceUrl' in message) {
    if (typeof message.mediaUrl !== 'string' || typeof message.traceUrl !== 'string') return false;
    const folder = `cutscene-spike-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    void Promise.all([
      chrome.downloads.download({ url: message.mediaUrl, filename: `${folder}/media.webm`, saveAs: false }),
      chrome.downloads.download({ url: message.traceUrl, filename: `${folder}/trace.jsonl`, saveAs: false }),
    ])
      .then(() => sendResponse({ ok: true, value: undefined } satisfies Result))
      .catch((error: unknown) =>
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) } satisfies Result),
      );
    return true;
  }
  return false;
});
