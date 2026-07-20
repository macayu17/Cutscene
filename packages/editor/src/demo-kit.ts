import { deriveDocSteps, generatePlaywrightSkeleton, renderDocMarkdown, type MediaClockFit,
  type RecordingMeta, type TraceEvent } from '@cutscene/trace';
import type { BrandPreset } from './brand';
import type { EditableCallout } from './callouts';
import type { CursorSettings } from './cursor';
import { renderStepShots, type RenderedSteps } from './docs-export';
import { exportRecording } from './export';
import { deriveInteractiveManifest, renderInteractivePlayer, type InteractiveManifest } from './interactive';
import type { EditableRedaction, RedactionBox } from './redactions';
import type { EditableSegment } from './segments';
import { zipStore } from './zip';

type DemoKitInput = {
  media: Blob;
  video: HTMLVideoElement;
  meta: RecordingMeta;
  events: readonly TraceEvent[];
  clock: MediaClockFit;
  segments: readonly EditableSegment[];
  callouts: readonly EditableCallout[];
  redactions: readonly EditableRedaction[];
  redactionBoxes: readonly RedactionBox[];
  brand: BrandPreset | null;
  cursorSettings: CursorSettings;
  progress: (value: number) => void;
};

type DemoKitArchiveInput = {
  mp4: Blob;
  gif: Blob;
  manifest: InteractiveManifest;
  rendered: RenderedSteps;
  meta: Pick<RecordingMeta, 'recordingId' | 'url'>;
  skeleton: string;
};

export async function demoKitArchive(input: DemoKitArchiveInput): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  return zipStore([
    { name: 'index.html', data: encoder.encode(renderInteractivePlayer(input.manifest)) },
    { name: 'demo.mp4', data: new Uint8Array(await input.mp4.arrayBuffer()) },
    { name: 'demo.gif', data: new Uint8Array(await input.gif.arrayBuffer()) },
    { name: 'docs.md', data: encoder.encode(renderDocMarkdown(input.rendered.steps, input.meta)) },
    ...input.rendered.shots,
    { name: 'playwright.spec.ts', data: encoder.encode(input.skeleton) },
  ]);
}

async function stage<T>(name: string, task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Demo kit ${name} export failed: ${detail}`);
  }
}

export async function buildDemoKit(input: DemoKitInput): Promise<Uint8Array> {
  const manifest = deriveInteractiveManifest(input.meta, input.events, input.clock, input.segments,
    input.brand?.intro.trim() ? 1_500 : 0);
  if (!manifest.ok) throw new Error('Demo kit needs at least one clickable target.');
  if (!deriveDocSteps(input.events).some(({ screenshot }) => screenshot)) {
    throw new Error('Demo kit needs at least one documented target.');
  }
  const render = (format: 'mp4' | 'gif', progress: (value: number) => void) => exportRecording(
    input.media, format, input.segments, input.meta, input.callouts, input.events, input.clock,
    input.redactions, input.redactionBoxes, input.brand, input.cursorSettings, progress,
  );
  const mp4 = await stage('video', () => render('mp4', (value) => input.progress(value * 0.55)));
  const gif = await stage('GIF', () => render('gif', (value) => input.progress(0.55 + value * 0.35)));
  input.progress(0.92);
  const rendered = await stage('screenshot', () => renderStepShots(input.video, input.events, input.meta,
    (time) => input.clock.toMediaTime(time)));
  input.progress(0.98);
  const archive = await demoKitArchive({
    mp4,
    gif,
    manifest: manifest.value,
    rendered,
    meta: input.meta,
    skeleton: generatePlaywrightSkeleton({ meta: input.meta, events: input.events }),
  });
  input.progress(1);
  return archive;
}
