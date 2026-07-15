import type { RecordingMeta, TraceEvent, Viewport, ScrollPosition } from '@cutscene/trace';
import type { RecorderStatus, Result } from './messages';
import { saveBundle } from './storage';

type PageContext = { viewport: Viewport; scroll: ScrollPosition; route: string; url: string; origin: string; contentClockMs: number;
  visualRedactionSelectors: string[] };
type State = {
  recorder: MediaRecorder; stream: MediaStream; mic: MediaStream | null; chunks: Blob[]; events: TraceEvent[];
  tabId: number; sessionEpoch: number; startedAt: number; mediaStart: number; timer: number; recordingId: string; context: PageContext;
  capture: { width: number; height: number; fps: number };
};

let state: State | null = null;

async function captureDimensions(stream: MediaStream): Promise<{ width: number; height: number }> {
  const video = document.createElement('video');
  video.muted = true;
  video.srcObject = stream;
  await new Promise<void>((resolve, reject) => {
    video.addEventListener('loadedmetadata', () => resolve(), { once: true });
    video.addEventListener('error', () => reject(new Error('Captured video metadata is unavailable.')), { once: true });
    void video.play();
  });
  const dimensions = { width: video.videoWidth, height: video.videoHeight };
  video.pause(); video.srcObject = null;
  return dimensions;
}

function status(): RecorderStatus {
  return { recording: state !== null, tabId: state?.tabId ?? null,
    clickCount: state?.events.filter(({ type }) => type === 'interaction.click').length ?? 0,
    startedAt: state?.startedAt ?? null, recordingId: state?.recordingId ?? null };
}

function systemEvent(type: 'system.recordingStart' | 'system.recordingStop' | 'navigation', current: State, t: number): TraceEvent {
  return { v: 1, id: `evt_${crypto.randomUUID()}`, t, type, stepId: `step_${type}`, route: current.context.route,
    viewport: current.context.viewport, scroll: current.context.scroll };
}

async function sync(): Promise<void> {
  const current = state;
  if (!current) return;
  const before = performance.now() - current.mediaStart;
  const sample = await chrome.runtime.sendMessage({ type: 'clock.sample', tabId: current.tabId, sessionEpoch: current.sessionEpoch }) as Result<{ contentClockMs: number; workerClockMs: number }>;
  if (!sample.ok || state !== current) return;
  const mediaTimeMs = (before + performance.now() - current.mediaStart) / 2;
  current.context.contentClockMs = sample.value.contentClockMs;
  current.events.push({ v: 1, id: `evt_${crypto.randomUUID()}`, t: sample.value.contentClockMs, type: 'system.clockSync',
    stepId: 'step_clock', route: current.context.route, viewport: current.context.viewport, scroll: current.context.scroll,
    contentClockMs: sample.value.contentClockMs, workerClockMs: sample.value.workerClockMs, mediaTimeMs });
}

async function start(message: { streamId: string; tabId: number; sessionEpoch: number; includeMic: boolean; context: PageContext }): Promise<Result<RecorderStatus>> {
  if (state) return { ok: false, error: 'A recording is already active.' };
  try {
    const video = { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: message.streamId } } as MediaTrackConstraints & { mandatory: { chromeMediaSource: 'tab'; chromeMediaSourceId: string } };
    const tab = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    const mic = message.includeMic ? await navigator.mediaDevices.getUserMedia({ audio: true }) : null;
    const stream = new MediaStream([...tab.getVideoTracks(), ...(mic?.getAudioTracks() ?? [])]);
    const dimensions = await captureDimensions(stream);
    const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp9', 'video/webm'].find(MediaRecorder.isTypeSupported.bind(MediaRecorder));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    recorder.addEventListener('dataavailable', (event) => { if (event.data.size) chunks.push(event.data); });
    const current: State = { recorder, stream, mic, chunks, events: [], tabId: message.tabId, sessionEpoch: message.sessionEpoch,
      startedAt: Date.now(), mediaStart: performance.now(), timer: 0, recordingId: `rec_${crypto.randomUUID()}`, context: message.context,
      capture: { ...dimensions, fps: tab.getVideoTracks()[0]?.getSettings().frameRate ?? 30 } };
    recorder.start(1_000);
    state = current;
    await sync();
    current.events.unshift(systemEvent('system.recordingStart', current, current.context.contentClockMs),
      systemEvent('navigation', current, current.context.contentClockMs));
    current.timer = window.setInterval(() => void sync(), 2_000);
    return { ok: true, value: status() };
  } catch (error: unknown) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
}

async function stop(): Promise<Result<RecorderStatus>> {
  const current = state;
  if (!current) return { ok: false, error: 'No recording is active.' };
  try {
    clearInterval(current.timer);
    await sync();
    const durationMs = performance.now() - current.mediaStart;
    current.events.push(systemEvent('system.recordingStop', current, current.context.contentClockMs));
    await new Promise<void>((resolve) => { current.recorder.addEventListener('stop', () => resolve(), { once: true }); current.recorder.stop(); });
    current.stream.getTracks().forEach((track) => track.stop()); current.mic?.getTracks().forEach((track) => track.stop());
    const media = new Blob(current.chunks, { type: current.recorder.mimeType });
    const trace = new Blob([`${current.events.map((event) => JSON.stringify(event)).join('\n')}\n`], { type: 'application/x-ndjson' });
    const meta: RecordingMeta = { schemaVersion: 1, recordingId: current.recordingId, createdAt: new Date(current.sessionEpoch).toISOString(),
      sessionEpoch: current.sessionEpoch, url: current.context.url, origin: current.context.origin, viewport: current.context.viewport,
      capture: current.capture,
      media: { mimeType: current.recorder.mimeType, hasAudio: current.stream.getAudioTracks().length > 0, durationMs },
      privacy: { maskInputValues: true, captureNetwork: false, maskedSelectors: ['[data-sensitive]', '[data-private]', 'input[type=password]'],
        ...(current.context.visualRedactionSelectors.length ?
          { visualRedactionSelectors: current.context.visualRedactionSelectors } : {}) },
      app: { commit: null, version: null, environment: null } };
    await saveBundle(current.recordingId, media, trace, meta);
    const urls = { mediaUrl: URL.createObjectURL(media), traceUrl: URL.createObjectURL(trace),
      metaUrl: URL.createObjectURL(new Blob([`${JSON.stringify(meta, null, 2)}\n`], { type: 'application/json' })) };
    const final = { ...status(), recording: false, tabId: current.tabId, clickCount: current.events.filter(({ type }) => type === 'interaction.click').length,
      startedAt: current.startedAt, recordingId: current.recordingId };
    state = null;
    const downloaded = await chrome.runtime.sendMessage({ type: 'downloads.start', recordingId: current.recordingId, ...urls }) as Result;
    setTimeout(() => Object.values(urls).forEach(URL.revokeObjectURL), 60_000);
    return downloaded.ok ? { ok: true, value: final } : downloaded;
  } catch (error: unknown) {
    state = null; current.stream.getTracks().forEach((track) => track.stop()); current.mic?.getTracks().forEach((track) => track.stop());
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function cancel(): Promise<Result> {
  const current = state;
  if (!current) return { ok: true, value: undefined };
  clearInterval(current.timer);
  if (current.recorder.state !== 'inactive') await new Promise<void>((resolve) => {
    current.recorder.addEventListener('stop', () => resolve(), { once: true }); current.recorder.stop();
  });
  current.stream.getTracks().forEach((track) => track.stop()); current.mic?.getTracks().forEach((track) => track.stop());
  state = null;
  return { ok: true, value: undefined };
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, respond) => {
  if (!message || typeof message !== 'object' || !('type' in message)) return false;
  if (message.type === 'trace.event' && 'event' in message) {
    if (state) { state.events.push(message.event as TraceEvent); respond({ ok: true, value: undefined } satisfies Result); }
    else respond({ ok: false, error: 'Recording is not active.' } satisfies Result);
    return false;
  }
  if (message.type === 'offscreen.start' && 'streamId' in message && typeof message.streamId === 'string' &&
      'tabId' in message && typeof message.tabId === 'number' && 'sessionEpoch' in message && typeof message.sessionEpoch === 'number' && 'context' in message) {
    void start({ streamId: message.streamId, tabId: message.tabId, sessionEpoch: message.sessionEpoch,
      includeMic: 'includeMic' in message && message.includeMic === true, context: message.context as PageContext }).then(respond); return true;
  }
  if (message.type === 'offscreen.stop') { void stop().then(respond); return true; }
  if (message.type === 'offscreen.cancel') { void cancel().then(respond); return true; }
  if (message.type === 'offscreen.status') { respond({ ok: true, value: status() } satisfies Result<RecorderStatus>); return false; }
  return false;
});
