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

async function tabId(): Promise<number | null> {
  const query = Number(new URLSearchParams(location.search).get('tabId'));
  if (Number.isInteger(query) && query > 0) return query;
  return (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id ?? null;
}

function render(result: Result<RecorderStatus>): void {
  if (!result.ok) {
    output.value = result.error;
    start.disabled = false;
    stop.disabled = true;
    return;
  }
  output.value = result.value.recording ? `recording · ${result.value.clickCount} clicks` : result.value.clickCount ? `saved · ${result.value.clickCount} clicks` : 'idle';
  start.disabled = result.value.recording;
  stop.disabled = !result.value.recording;
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
render(await chrome.runtime.sendMessage({ type: 'recording.status' }) as Result<RecorderStatus>);
