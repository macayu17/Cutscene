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

start.addEventListener('click', async () => {
  const targetTabId = await tabId();
  if (targetTabId === null) return render({ ok: false, error: 'No active tab.' });
  const redactSelectors = redact.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  render(await chrome.runtime.sendMessage({ type: 'recording.start', tabId: targetTabId, includeMic: mic.checked,
    redactSelectors }) as Result<RecorderStatus>);
});
stop.addEventListener('click', async () => render(await chrome.runtime.sendMessage({ type: 'recording.stop' }) as Result<RecorderStatus>));
async function refresh(): Promise<void> {
  render(await chrome.runtime.sendMessage({ type: 'recording.status' }) as Result<RecorderStatus>);
}

await refresh();
// Only while recording: a poll after a stop would report the idle recorder and
// overwrite the saved result the user just produced.
setInterval(() => { if (output.dataset.state === 'recording') void refresh(); }, 1_000);
