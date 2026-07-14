import { fitClock, mapBoxToVideo, type ClockPoint } from './measurement';
import type { ClickEvent, ClockSyncEvent, TraceEvent } from './messages';

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing player element: ${selector}`);
  return element;
}

const mediaInput = required<HTMLInputElement>('#media-file');
const traceInput = required<HTMLInputElement>('#trace-file');
const video = required<HTMLVideoElement>('video');
const overlay = required<HTMLElement>('#overlay');
const readout = required<HTMLElement>('#readout');
const samples = required<HTMLOListElement>('#samples');

let events: TraceEvent[] = [];
let clicks: ClickEvent[] = [];
let toMediaTime = (contentTimeMs: number) => contentTimeMs;

function parseTrace(text: string): TraceEvent[] {
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as TraceEvent)
    .sort((left, right) => left.t - right.t);
}

function renderSamples(): void {
  samples.replaceChildren();
  if (clicks.length === 0) return;
  const count = Math.min(10, clicks.length);
  for (let index = 0; index < count; index += 1) {
    const clickIndex = count === 1 ? 0 : Math.round((index * (clicks.length - 1)) / (count - 1));
    const click = clicks[clickIndex];
    if (!click) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${(toMediaTime(click.t) / 1_000).toFixed(3)}s · ${click.target.accessibleName || click.target.tagName}`;
    button.addEventListener('click', () => {
      video.currentTime = Math.max(0, toMediaTime(click.t) / 1_000);
      video.pause();
      draw();
    });
    const item = document.createElement('li');
    item.append(button);
    samples.append(item);
  }
}

function draw(): void {
  if (clicks.length === 0 || video.readyState === 0) {
    overlay.hidden = true;
    return;
  }
  const mediaMs = video.currentTime * 1_000;
  const click = clicks.reduce<ClickEvent | null>((closest, candidate) => {
    if (!closest) return candidate;
    return Math.abs(toMediaTime(candidate.t) - mediaMs) < Math.abs(toMediaTime(closest.t) - mediaMs)
      ? candidate
      : closest;
  }, null);
  if (!click || Math.abs(toMediaTime(click.t) - mediaMs) > 150) {
    overlay.hidden = true;
    return;
  }
  const mapped = mapBoxToVideo(click.target.boundingBox, click.viewport, {
    width: video.clientWidth,
    height: video.clientHeight,
  });
  overlay.hidden = false;
  overlay.style.left = `${video.offsetLeft + mapped.x}px`;
  overlay.style.top = `${video.offsetTop + mapped.y}px`;
  overlay.style.width = `${mapped.width}px`;
  overlay.style.height = `${mapped.height}px`;
  readout.textContent = `${(toMediaTime(click.t) / 1_000).toFixed(3)}s · x ${click.target.boundingBox.x.toFixed(1)} · y ${click.target.boundingBox.y.toFixed(1)} · ${click.target.boundingBox.width.toFixed(1)}×${click.target.boundingBox.height.toFixed(1)} CSS px`;
}

mediaInput.addEventListener('change', () => {
  const file = mediaInput.files?.[0];
  if (!file) return;
  video.src = URL.createObjectURL(file);
});

traceInput.addEventListener('change', async () => {
  const file = traceInput.files?.[0];
  if (!file) return;
  events = parseTrace(await file.text());
  clicks = events.filter((event): event is ClickEvent => event.type === 'interaction.click');
  const syncs: ClockPoint[] = events
    .filter((event): event is ClockSyncEvent => event.type === 'system.clockSync')
    .map((event) => ({ contentClockMs: event.contentClockMs, mediaTimeMs: event.mediaTimeMs }));
  toMediaTime = fitClock(syncs);
  renderSamples();
  readout.textContent = `${clicks.length} clicks · ${syncs.length} sync markers`;
});

video.addEventListener('timeupdate', draw);
video.addEventListener('seeked', draw);
window.addEventListener('resize', draw);
