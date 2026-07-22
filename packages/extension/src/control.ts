import type { RecorderStatus, Result } from './messages';

function required<T extends Element>(selector: string): T {
  const value = document.querySelector<T>(selector);
  if (!value) throw new Error(`Missing control: ${selector}`);
  return value;
}

const start = required<HTMLButtonElement>('#start');
const stop = required<HTMLButtonElement>('#stop');
const mic = required<HTMLInputElement>('#mic');
const redact = required<HTMLTextAreaElement>('#redact');
const output = required<HTMLOutputElement>('#status');
const warning = required<HTMLParagraphElement>('#length-warning');

const LONG_RECORDING_MS = 10 * 60 * 1_000;

function elapsed(startedAt: number | null): string {
  if (startedAt === null) return '';
  const seconds = Math.max(0, Math.round((Date.now() - startedAt) / 1_000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

async function tabId(): Promise<number | null> {
  const query = Number(new URLSearchParams(location.search).get('tabId'));
  if (Number.isInteger(query) && query > 0) return query;
  return (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id ?? null;
}

function render(result: Result<RecorderStatus>): void {
  if (!result.ok) {
    output.dataset.state = 'error';
    output.value = result.error;
    start.disabled = false;
    stop.disabled = true;
    return;
  }
  const state = result.value.recording ? 'recording' : result.value.clickCount ? 'saved' : 'idle';
  output.dataset.state = state;
  output.value = state === 'idle' ? state
    : [state, elapsed(result.value.startedAt), `${result.value.clickCount} clicks`].filter(Boolean).join(' · ');
  // The whole recording is held in memory until it stops, so a long take is a real risk.
  warning.hidden = !result.value.recording || Date.now() - (result.value.startedAt ?? Date.now()) < LONG_RECORDING_MS;
  start.disabled = result.value.recording;
  stop.disabled = !result.value.recording;
  mic.disabled = result.value.recording;
  redact.disabled = result.value.recording;
}

// Stopping takes seconds: the recorder quiesces, encodes, saves and opens the editor.
// Polls fired during that window see an already-idle recorder and would repaint over the
// saved result. What the user asked for outranks what a poll happened to observe, so a
// poll overlapping an action is discarded rather than ordered against it.
let busy = false;
let epoch = 0;

async function act(type: 'recording.start' | 'recording.stop', extra: Record<string, unknown> = {}): Promise<void> {
  busy = true;
  epoch += 1;
  try {
    render(await chrome.runtime.sendMessage({ type, ...extra }) as Result<RecorderStatus>);
  } finally {
    busy = false;
    epoch += 1;
  }
}

async function poll(): Promise<void> {
  if (busy) return;
  const at = epoch;
  const result = await chrome.runtime.sendMessage({ type: 'recording.status' }) as Result<RecorderStatus>;
  if (busy || at !== epoch) return;
  render(result);
}

start.addEventListener('click', async () => {
  const targetTabId = await tabId();
  if (targetTabId === null) return render({ ok: false, error: 'No active tab.' });
  const redactSelectors = redact.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  await act('recording.start', { tabId: targetTabId, includeMic: mic.checked, redactSelectors });
});
stop.addEventListener('click', () => void act('recording.stop'));

await poll();
// Only while recording: once it stops, the recorder has nothing further to report.
setInterval(() => { if (output.dataset.state === 'recording') void poll(); }, 1_000);
