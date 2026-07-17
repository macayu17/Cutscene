import { deriveDocSteps, mapBoxToCapture, renderDocMarkdown, type BoundingBox, type DocStep,
  type RecordingMeta, type TraceEvent } from '@cutscene/trace';
import { deriveRedactionIntervals, redactionBoxesAt, type RedactionBox } from './redactions';
import { zipStore, type ZipEntry } from './zip';

// One cropped, 2x screenshot per documented step, grabbed from the loaded video
// with Canvas 2D. No FFmpeg, no dependency. The docs bundle and the screenshot
// set share this rendering pass.

const PAD_CSS = 24; // CSS px of breathing room around the target, matches the zoom feel
const SCALE = 2; // PRD §10: screenshots exported at 2x

function seek(video: HTMLVideoElement, timeSeconds: number): Promise<void> {
  if (Math.abs(video.currentTime - timeSeconds) < 1e-3) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('video seek failed')); };
    const cleanup = () => { video.removeEventListener('seeked', done); video.removeEventListener('error', fail); };
    video.addEventListener('seeked', done);
    video.addEventListener('error', fail);
    video.currentTime = timeSeconds;
  });
}

async function renderShot(video: HTMLVideoElement, mediaTimeMs: number, box: BoundingBox,
  meta: Pick<RecordingMeta, 'viewport'>, redactions: readonly RedactionBox[]): Promise<Uint8Array> {
  await seek(video, Math.max(0, mediaTimeMs / 1_000));
  const capture = { width: video.videoWidth, height: video.videoHeight };
  const region = mapBoxToCapture(box, meta.viewport, capture);
  const pad = PAD_CSS * Math.min(capture.width / meta.viewport.width, capture.height / meta.viewport.height);
  const sx = Math.max(0, region.x - pad);
  const sy = Math.max(0, region.y - pad);
  const sw = Math.min(capture.width - sx, region.width + pad * 2);
  const sh = Math.min(capture.height - sy, region.height + pad * 2);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * SCALE));
  canvas.height = Math.max(1, Math.round(sh * SCALE));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is unavailable');
  context.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  context.fillStyle = '#16181C';
  for (const redaction of redactions) {
    const painted = mapBoxToCapture(redaction.box, redaction.viewport, capture);
    context.fillRect((painted.x - sx) * canvas.width / sw, (painted.y - sy) * canvas.height / sh,
      painted.width * canvas.width / sw, painted.height * canvas.height / sh);
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('screenshot encoding failed');
  return new Uint8Array(await blob.arrayBuffer());
}

export type RenderedSteps = { steps: DocStep[]; shots: ZipEntry[] };

export async function renderStepShots(video: HTMLVideoElement, events: readonly TraceEvent[],
  meta: Pick<RecordingMeta, 'viewport'>, toMediaTime: (t: number) => number): Promise<RenderedSteps> {
  const steps = deriveDocSteps(events);
  const shots: ZipEntry[] = [];
  const boxes = deriveRedactionIntervals(events, { slope: 1, intercept: 0, toMediaTime }, Infinity);
  const redactions = [...new Set(boxes.map(({ selector }) => selector))].map((selector) => ({ selector, enabled: true }));
  for (const step of steps) {
    if (!step.box || !step.screenshot) continue;
    const mediaTimeMs = toMediaTime(step.t);
    const png = await renderShot(video, mediaTimeMs, step.box, meta, redactionBoxesAt(boxes, redactions, mediaTimeMs));
    shots.push({ name: step.screenshot, data: png });
  }
  return { steps, shots };
}

export function docsArchive(rendered: RenderedSteps, meta: Pick<RecordingMeta, 'recordingId' | 'url'>): Uint8Array {
  const markdown = renderDocMarkdown(rendered.steps, meta);
  return zipStore([{ name: 'docs.md', data: new TextEncoder().encode(markdown) }, ...rendered.shots]);
}

export function screenshotsArchive(rendered: RenderedSteps): Uint8Array {
  return zipStore(rendered.shots);
}
