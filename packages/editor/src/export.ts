import { mapBoxToCapture } from '@cutscene/trace';
import type { EditableSegment } from './segments';

type ExportMeta = { capture: { width: number; height: number; fps: number }; viewport?: { width: number; height: number } };
export type ExportFormat = 'gif' | 'mp4';
export type ExportPlan = { args: string[]; output: 'output.gif' | 'output.mp4'; mimeType: 'image/gif' | 'video/mp4' };

function escape(expression: string): string { return expression.replaceAll(',', '\\,'); }

function strength(segment: EditableSegment, time: string): string {
  const start = segment.startMs / 1_000;
  const end = segment.endMs / 1_000;
  const transition = Math.min(0.4, (end - start) / 2);
  const up = `(${time}-${start})/${transition}`;
  const down = `(${end}-${time})/${transition}`;
  const smooth = (value: string) => `(${value})*(${value})*(3-2*(${value}))`;
  return `if(between(${time},${start},${start + transition}),${smooth(up)},if(between(${time},${end - transition},${end}),${smooth(down)},if(between(${time},${start + transition},${end - transition}),1,0)))`;
}

function zoomPanFilter(segments: readonly EditableSegment[], meta: ExportMeta, width: number, height: number, fps: number): string {
  const viewport = meta.viewport ?? { width: meta.capture.width, height: meta.capture.height };
  const factors = segments.map((segment) => strength(segment, 'in_time'));
  const choose = (values: string[], fallback: string) => values.reduceRight((next, value, index) => `if(gt(${factors[index]},0),${value},${next})`, fallback);
  const zooms = segments.map((segment, index) => `1+(${factors[index]})*${segment.scale - 1}`);
  const centers = segments.map((segment) => {
    const focus = mapBoxToCapture(segment.focus, viewport, meta.capture);
    return { x: focus.x + focus.width / 2, y: focus.y + focus.height / 2 };
  });
  const zoom = choose(zooms, '1');
  const centerX = choose(centers.map(({ x }, index) => `iw/2+(${factors[index]})*(${x}-iw/2)`), 'iw/2');
  const centerY = choose(centers.map(({ y }, index) => `ih/2+(${factors[index]})*(${y}-ih/2)`), 'ih/2');
  return `zoompan=z='${escape(zoom)}':x='${escape(`${centerX}-iw/(2*zoom)`)}':y='${escape(`${centerY}-ih/(2*zoom)`)}':d=1:s=${width}x${height}:fps=${fps}`;
}

export function buildExportPlan(format: ExportFormat, segments: readonly EditableSegment[], meta: ExportMeta): ExportPlan {
  if (format === 'gif') {
    const zoom = zoomPanFilter(segments, meta, 800, 450, 15);
    return { output: 'output.gif', mimeType: 'image/gif', args: ['-i', 'input.webm', '-filter_complex',
      `[0:v]fps=15,${zoom},split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle[out]`,
      '-map', '[out]', '-loop', '0', 'output.gif'] };
  }
  const zoom = zoomPanFilter(segments, meta, 1920, 1080, meta.capture.fps);
  return { output: 'output.mp4', mimeType: 'video/mp4', args: ['-i', 'input.webm', '-vf', `fps=${meta.capture.fps},${zoom},format=yuv420p`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', 'output.mp4'] };
}

let loaded: Promise<InstanceType<typeof import('@ffmpeg/ffmpeg')['FFmpeg']>> | null = null;

async function ffmpeg() {
  if (!loaded) loaded = (async () => {
    const [{ FFmpeg }, { toBlobURL }] = await Promise.all([import('@ffmpeg/ffmpeg'), import('@ffmpeg/util')]);
    const instance = new FFmpeg();
    const base = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';
    await instance.load({ coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'), wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm') });
    return instance;
  })();
  return loaded;
}

export async function exportRecording(media: Blob, format: ExportFormat, segments: readonly EditableSegment[], meta: ExportMeta,
  progress: (value: number) => void): Promise<Blob> {
  const engine = await ffmpeg();
  const listener = ({ progress: value }: { progress: number }) => progress(value);
  engine.on('progress', listener);
  try {
    const plan = buildExportPlan(format, segments, meta);
    await engine.writeFile('input.webm', new Uint8Array(await media.arrayBuffer()));
    await engine.exec(plan.args);
    const data = await engine.readFile(plan.output);
    if (!(data instanceof Uint8Array)) throw new Error('Export produced invalid binary output.');
    const output = new Uint8Array(data.byteLength);
    output.set(data);
    return new Blob([output.buffer], { type: plan.mimeType });
  } finally { engine.off('progress', listener); }
}
