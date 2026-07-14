import type { RecorderStatus, Result, TraceEvent } from './messages';
import { clockExchangeMidpoint } from './measurement';

type RecordingState = {
  recorder: MediaRecorder;
  stream: MediaStream;
  chunks: Blob[];
  events: TraceEvent[];
  tabId: number;
  sessionEpoch: number;
  startedAt: number;
  mediaStart: number;
  syncTimer: number;
};

let state: RecordingState | null = null;

function status(): RecorderStatus {
  return {
    recording: state !== null,
    tabId: state?.tabId ?? null,
    clickCount: state?.events.filter((event) => event.type === 'interaction.click').length ?? 0,
    startedAt: state?.startedAt ?? null,
  };
}

async function addClockSync(): Promise<void> {
  const current = state;
  if (!current) return;
  const mediaBeforeMs = performance.now() - current.mediaStart;
  const sample = (await chrome.runtime.sendMessage({
    type: 'clock.sample',
    tabId: current.tabId,
    sessionEpoch: current.sessionEpoch,
  })) as Result<{ contentClockMs: number; workerClockMs: number }>;
  if (!sample.ok || state !== current) return;
  const mediaAfterMs = performance.now() - current.mediaStart;
  const mediaTimeMs = clockExchangeMidpoint(mediaBeforeMs, mediaAfterMs);
  current.events.push({
    v: 1,
    id: `evt_${crypto.randomUUID()}`,
    t: sample.value.contentClockMs,
    type: 'system.clockSync',
    contentClockMs: sample.value.contentClockMs,
    workerClockMs: sample.value.workerClockMs,
    mediaTimeMs,
  });
}

async function start(message: {
  streamId: string;
  tabId: number;
  sessionEpoch: number;
}): Promise<Result<RecorderStatus>> {
  if (state) return { ok: false, error: 'A recording is already active.' };
  try {
    const video = {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: message.streamId,
      },
    } as MediaTrackConstraints & {
      mandatory: { chromeMediaSource: 'tab'; chromeMediaSourceId: string };
    };
    const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((type) =>
      MediaRecorder.isTypeSupported(type),
    );
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });
    const mediaStart = performance.now();
    const events: TraceEvent[] = [
      {
        v: 1,
        id: `evt_${crypto.randomUUID()}`,
        t: 0,
        type: 'system.recordingStart',
      },
    ];
    recorder.start(1_000);
    state = {
      recorder,
      stream,
      chunks,
      events,
      tabId: message.tabId,
      sessionEpoch: message.sessionEpoch,
      startedAt: Date.now(),
      mediaStart,
      syncTimer: window.setInterval(() => void addClockSync(), 2_000),
    };
    await addClockSync();
    return { ok: true, value: status() };
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function stop(): Promise<Result<RecorderStatus>> {
  const current = state;
  if (!current) return { ok: false, error: 'No recording is active.' };
  try {
    window.clearInterval(current.syncTimer);
    await addClockSync();
    current.events.push({
      v: 1,
      id: `evt_${crypto.randomUUID()}`,
      t: Date.now() - current.sessionEpoch,
      type: 'system.recordingStop',
    });
    const stopped = new Promise<void>((resolve) => current.recorder.addEventListener('stop', () => resolve(), { once: true }));
    current.recorder.stop();
    await stopped;
    current.stream.getTracks().forEach((track) => track.stop());

    const mediaUrl = URL.createObjectURL(new Blob(current.chunks, { type: current.recorder.mimeType }));
    const traceUrl = URL.createObjectURL(
      new Blob([`${current.events.map((event) => JSON.stringify(event)).join('\n')}\n`], {
        type: 'application/x-ndjson',
      }),
    );
    const finalStatus: RecorderStatus = {
      recording: false,
      tabId: current.tabId,
      clickCount: current.events.filter((event) => event.type === 'interaction.click').length,
      startedAt: current.startedAt,
    };
    state = null;
    const downloaded = (await chrome.runtime.sendMessage({
      type: 'downloads.start',
      mediaUrl,
      traceUrl,
    })) as Result;
    window.setTimeout(() => {
      URL.revokeObjectURL(mediaUrl);
      URL.revokeObjectURL(traceUrl);
    }, 60_000);
    return downloaded.ok ? { ok: true, value: finalStatus } : downloaded;
  } catch (error: unknown) {
    state = null;
    current.stream.getTracks().forEach((track) => track.stop());
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!message || typeof message !== 'object' || !('type' in message)) return false;
  if (message.type === 'trace.event' && 'event' in message) {
    if (state) state.events.push(message.event as TraceEvent);
    return false;
  }
  if (message.type === 'offscreen.start' && 'streamId' in message && 'tabId' in message && 'sessionEpoch' in message) {
    if (typeof message.streamId !== 'string' || typeof message.tabId !== 'number' || typeof message.sessionEpoch !== 'number') {
      sendResponse({ ok: false, error: 'Invalid start request.' } satisfies Result);
      return false;
    }
    void start({ streamId: message.streamId, tabId: message.tabId, sessionEpoch: message.sessionEpoch }).then(sendResponse);
    return true;
  }
  if (message.type === 'offscreen.stop') {
    void stop().then(sendResponse);
    return true;
  }
  if (message.type === 'offscreen.status') {
    sendResponse({ ok: true, value: status() } satisfies Result<RecorderStatus>);
    return false;
  }
  return false;
});
