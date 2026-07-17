import { mapBoxToCapture, targetLabel, type BoundingBox, type MediaClockFit, type RecordingMeta,
  type Result, type TraceEvent } from '@cutscene/trace';
import { cameraAt, cameraMatrix } from './camera';
import type { EditableSegment } from './segments';
import { renderInteractivePlayer } from './interactive-player';
import { zipStore } from './zip';

const OUTPUT = { width: 1_920 as const, height: 1_080 as const };

export type InteractiveStep = {
  eventId: string;
  timeMs: number;
  label: string;
  box: BoundingBox;
};

export type InteractiveManifest = {
  v: 1;
  recordingId: string;
  width: 1_920;
  height: 1_080;
  steps: InteractiveStep[];
};

function outputBox(event: TraceEvent & { target: NonNullable<TraceEvent['target']> }, mediaTimeMs: number,
  meta: RecordingMeta, segments: readonly EditableSegment[]): BoundingBox | null {
  const source = mapBoxToCapture(event.target.boundingBox, event.viewport, meta.capture);
  const camera = cameraAt(mediaTimeMs, segments, meta.viewport, meta.capture);
  const matrix = cameraMatrix(camera, meta.capture, OUTPUT);
  const scaleX = OUTPUT.width / meta.capture.width;
  const scaleY = OUTPUT.height / meta.capture.height;
  const x = source.x * scaleX * camera.scale + matrix.translateX;
  const y = source.y * scaleY * camera.scale + matrix.translateY;
  const right = Math.min(OUTPUT.width, x + source.width * scaleX * camera.scale);
  const bottom = Math.min(OUTPUT.height, y + source.height * scaleY * camera.scale);
  const left = Math.max(0, x);
  const top = Math.max(0, y);
  return right > left && bottom > top ? { x: left, y: top, width: right - left, height: bottom - top } : null;
}

export function deriveInteractiveManifest(meta: RecordingMeta, events: readonly TraceEvent[], clock: MediaClockFit,
  segments: readonly EditableSegment[], introMs: number): Result<InteractiveManifest> {
  const steps = [...events].sort((left, right) => left.t - right.t).flatMap((event): InteractiveStep[] => {
    if (event.type !== 'interaction.click' || !event.target) return [];
    const sourceTimeMs = Math.max(0, Math.min(meta.media.durationMs, clock.toMediaTime(event.t)));
    const box = outputBox(event as TraceEvent & { target: NonNullable<TraceEvent['target']> }, sourceTimeMs, meta, segments);
    return box ? [{ eventId: event.id, timeMs: sourceTimeMs + introMs, label: targetLabel(event.target), box }] : [];
  });
  return steps.length === 0 ? { ok: false, error: 'No clickable trace events captured.' } : {
    ok: true,
    value: { v: 1, recordingId: meta.recordingId, ...OUTPUT, steps },
  };
}

export async function interactiveArchive(media: Blob, manifest: InteractiveManifest): Promise<Uint8Array> {
  return zipStore([
    { name: 'index.html', data: new TextEncoder().encode(renderInteractivePlayer(manifest)) },
    { name: 'demo.mp4', data: new Uint8Array(await media.arrayBuffer()) },
  ]);
}

export { renderInteractivePlayer } from './interactive-player';
