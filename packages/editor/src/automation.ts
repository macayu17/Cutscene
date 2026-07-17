import { renderDocMarkdown } from '@cutscene/trace';
import { parseBundle } from './bundle';
import { DEFAULT_CURSOR_SETTINGS } from './cursor';
import { renderStepShots } from './docs-export';
import { exportRecording } from './export';
import { deriveRedactionIntervals, deriveRedactions } from './redactions';
import { automaticSegments } from './segments';

export type AutomationApi = {
  probe(): Promise<{ width: number; height: number; durationMs: number }>;
  exportVideo(type: 'gif' | 'mp4', width?: number): Promise<void>;
  exportDocs(): Promise<{ markdown: string; shots: Array<{ name: string; bytes: number[] }> }>;
};

declare global {
  interface Window { cutscene: AutomationApi }
}

async function bundleResponse(fetcher: typeof fetch, path: string): Promise<Response> {
  const response = await fetcher(path);
  if (!response.ok) throw new Error(`Bundle fetch failed for ${path} (${response.status}).`);
  return response;
}

function metadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 1) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error('media.webm metadata could not be read.')); };
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', done);
      video.removeEventListener('error', failed);
    };
    video.addEventListener('loadedmetadata', done);
    video.addEventListener('error', failed);
  });
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export async function loadAutomationApi(fetcher: typeof fetch = fetch): Promise<AutomationApi> {
  const [mediaResponse, traceResponse, metaResponse] = await Promise.all([
    bundleResponse(fetcher, '/bundle/media.webm'),
    bundleResponse(fetcher, '/bundle/trace.jsonl'),
    bundleResponse(fetcher, '/bundle/meta.json'),
  ]);
  const [media, traceText, metaText] = await Promise.all([mediaResponse.blob(), traceResponse.text(), metaResponse.text()]);
  const parsed = parseBundle(metaText, traceText);
  if (!parsed.ok) throw new Error(parsed.error);
  const bundle = parsed.value;
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.src = URL.createObjectURL(media);
  await metadata(video);
  const durationMs = Number.isFinite(video.duration) ? Math.round(video.duration * 1_000) : bundle.meta.media.durationMs;
  const segments = automaticSegments(bundle.events, bundle.clock, bundle.meta.viewport);
  const redactions = deriveRedactions(bundle.meta, bundle.events);
  const redactionBoxes = deriveRedactionIntervals(bundle.events, bundle.clock, durationMs);

  return {
    async probe() {
      return { width: video.videoWidth, height: video.videoHeight, durationMs };
    },
    async exportVideo(type, width) {
      if (type === 'gif' && width !== undefined && (!Number.isInteger(width) || width <= 0)) {
        throw new Error('GIF width must be a positive integer.');
      }
      const output = await exportRecording(media, type, segments, bundle.meta, [], bundle.events, bundle.clock,
        redactions, redactionBoxes, null, DEFAULT_CURSOR_SETTINGS, () => undefined, undefined,
        type === 'gif' ? width : undefined);
      download(output, `${bundle.meta.recordingId}.${type}`);
    },
    async exportDocs() {
      const rendered = await renderStepShots(video, bundle.events, bundle.meta, bundle.clock.toMediaTime);
      return {
        markdown: renderDocMarkdown(rendered.steps, bundle.meta),
        shots: rendered.shots.map(({ name, data }) => ({ name, bytes: Array.from(data) })),
      };
    },
  };
}

if (typeof window !== 'undefined') {
  void loadAutomationApi().then((api) => { window.cutscene = api; });
}
