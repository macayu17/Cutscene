import type { RecorderStatus, Result } from './messages';

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing control element: ${selector}`);
  return element;
}

const startButton = required<HTMLButtonElement>('#start');
const stopButton = required<HTMLButtonElement>('#stop');
const statusText = required<HTMLElement>('#status');

async function targetTabId(): Promise<number | null> {
  const fromQuery = Number(new URLSearchParams(location.search).get('tabId'));
  if (Number.isInteger(fromQuery) && fromQuery > 0) return fromQuery;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

function render(result: Result<RecorderStatus>): void {
  if (!result.ok) {
    statusText.textContent = result.error;
    startButton.disabled = false;
    stopButton.disabled = true;
    return;
  }
  const value = result.value;
  statusText.textContent = value.recording
    ? `recording · ${value.clickCount} clicks`
    : value.clickCount > 0
      ? `saved · ${value.clickCount} clicks`
      : 'idle';
  startButton.disabled = value.recording;
  stopButton.disabled = !value.recording;
}

startButton.addEventListener('click', async () => {
  const tabId = await targetTabId();
  if (tabId === null) {
    render({ ok: false, error: 'No target tab found.' });
    return;
  }
  statusText.textContent = 'starting';
  render((await chrome.runtime.sendMessage({ type: 'recording.start', tabId })) as Result<RecorderStatus>);
});

stopButton.addEventListener('click', async () => {
  statusText.textContent = 'saving';
  render((await chrome.runtime.sendMessage({ type: 'recording.stop' })) as Result<RecorderStatus>);
});

render((await chrome.runtime.sendMessage({ type: 'recording.status' })) as Result<RecorderStatus>);
