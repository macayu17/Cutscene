import { mapBoxToCapture, type MediaClockFit, type TraceEvent } from '@cutscene/trace';
import type { EditableSegment } from './segments';
import { cameraTiming, portraitCropAt } from './camera';
import { calloutLayout, calloutSize, calloutWindow, type EditableCallout } from './callouts';
import { renderCalloutCard } from './callout-render';
import { compileRedactions, type CompiledRedaction, type EditableRedaction, type RedactionBox } from './redactions';

type ExportMeta = { capture: { width: number; height: number; fps: number }; viewport?: { width: number; height: number } };
export type ExportFormat = 'gif' | 'mp4' | 'vertical';
export type ExportPlan = { args: string[]; output: 'output.gif' | 'output.mp4'; mimeType: 'image/gif' | 'video/mp4' };
export type ExportOverlay = { filename: string; x: number; y: number; startSeconds: number; endSeconds: number };

function escape(expression: string): string { return expression.replaceAll(',', '\\,'); }

function strength(segment: EditableSegment, time: string): string {
  const timing = cameraTiming(segment);
  const start = timing.startMs / 1_000;
  const peak = timing.peakMs / 1_000;
  const exitStart = timing.exitStartMs / 1_000;
  const end = timing.endMs / 1_000;
  const up = `(${time}-${start})/${peak - start}`;
  const down = `(${end}-${time})/${end - exitStart}`;
  const smooth = (value: string) => `(${value})*(${value})*(3-2*(${value}))`;
  return `if(between(${time},${start},${peak}),${smooth(up)},if(between(${time},${exitStart},${end}),${smooth(down)},if(between(${time},${peak},${exitStart}),1,0)))`;
}

function zoomPanFilter(segments: readonly EditableSegment[], meta: ExportMeta, width: number, height: number, fps: number): string {
  const factors = segments.map((segment) => strength(segment, 'in_time'));
  const choose = (values: string[], fallback: string) => values.reduceRight((next, value, index) => `if(gt(${factors[index]},0),${value},${next})`, fallback);
  const zooms = segments.map((segment, index) => `1+(${factors[index]})*${segment.scale - 1}`);
  const centers = segments.map((segment) => {
    const focus = mapBoxToCapture(segment.focus, segment.viewport, meta.capture);
    return { x: focus.x + focus.width / 2, y: focus.y + focus.height / 2 };
  });
  const zoom = choose(zooms, '1');
  const centerX = choose(centers.map(({ x }, index) => `iw/2+(${factors[index]})*(${x}-iw/2)`), 'iw/2');
  const centerY = choose(centers.map(({ y }, index) => `ih/2+(${factors[index]})*(${y}-ih/2)`), 'ih/2');
  const x = `max(iw/(2*zoom),min(iw-iw/(2*zoom),${centerX}))-iw/(2*zoom)`;
  const y = `max(ih/(2*zoom),min(ih-ih/(2*zoom),${centerY}))-ih/(2*zoom)`;
  return `zoompan=z='${escape(zoom)}':x='${escape(x)}':y='${escape(y)}':d=1:s=${width}x${height}:fps=${fps}`;
}

function portraitFilter(segments: readonly EditableSegment[], meta: ExportMeta): string {
  const crop = portraitCropAt(0, [], meta.capture);
  const factors = segments.map((segment) => strength(segment, 't'));
  const choose = (values: string[], fallback: string) => values.reduceRight((next, value, index) =>
    `if(gt(${factors[index]},0),${value},${next})`, fallback);
  const centers = segments.map((segment) => {
    const focus = mapBoxToCapture(segment.focus, segment.viewport, meta.capture);
    return { x: focus.x + focus.width / 2, y: focus.y + focus.height / 2 };
  });
  const centerX = choose(centers.map(({ x }, index) => `iw/2+(${factors[index]})*(${x}-iw/2)`), 'iw/2');
  const centerY = choose(centers.map(({ y }, index) => `ih/2+(${factors[index]})*(${y}-ih/2)`), 'ih/2');
  const x = `max(0,min(iw-${crop.width},${centerX}-${crop.width / 2}))`;
  const y = `max(0,min(ih-${crop.height},${centerY}-${crop.height / 2}))`;
  return `crop=${crop.width}:${crop.height}:x='${escape(x)}':y='${escape(y)}',scale=1080:1920:flags=lanczos,setsar=1`;
}

function overlayChain(overlays: readonly ExportOverlay[]): { filters: string[]; output: string } {
  let input = 'base';
  const filters = overlays.map((overlay, index) => {
    const output = `overlay_${index}`;
    const filter = `[${input}][${index + 1}:v]overlay=${overlay.x}:${overlay.y}:enable='between(t,${overlay.startSeconds},${overlay.endSeconds})':eof_action=repeat[${output}]`;
    input = output;
    return filter;
  });
  return { filters, output: input };
}

function redactionChain(redactions: readonly CompiledRedaction[]): { filters: string[]; output: string } {
  let input = '0:v';
  const filters = redactions.map((redaction, index) => {
    const base = `redact_base_${index}`;
    const source = `redact_source_${index}`;
    const patch = `redact_patch_${index}`;
    const output = `redacted_${index}`;
    const filter = `[${input}]split[${base}][${source}];[${source}]crop=${redaction.width}:${redaction.height}:${redaction.x}:${redaction.y},boxblur=${redaction.blurRadius}[${patch}];` +
      `[${base}][${patch}]overlay=${redaction.x}:${redaction.y}:enable='between(t,${redaction.startSeconds},${redaction.endSeconds})'[${output}]`;
    input = output;
    return filter;
  });
  return { filters, output: input };
}

export function buildExportPlan(format: ExportFormat, segments: readonly EditableSegment[], meta: ExportMeta,
  overlays: readonly ExportOverlay[] = [], redactions: readonly CompiledRedaction[] = []): ExportPlan {
  const inputs = ['-i', 'input.webm', ...overlays.flatMap(({ filename }) => ['-i', filename])];
  const source = redactionChain(redactions);
  const sourceFilters = source.filters.length ? `${source.filters.join(';')};` : '';
  if (format === 'gif') {
    const zoom = zoomPanFilter(segments, meta, 800, 450, 15);
    const chain = overlayChain(overlays);
    const overlayFilters = chain.filters.length ? `;${chain.filters.join(';')}` : '';
    return { output: 'output.gif', mimeType: 'image/gif', args: [...inputs, '-filter_complex',
      `${sourceFilters}[${source.output}]fps=15,${zoom}[base]${overlayFilters};[${chain.output}]split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle[out]`,
      '-map', '[out]', '-loop', '0', 'output.gif'] };
  }
  if (format === 'vertical') {
    const chain = overlayChain(overlays);
    const overlayFilters = chain.filters.length ? `;${chain.filters.join(';')}` : '';
    return { output: 'output.mp4', mimeType: 'video/mp4', args: [...inputs, '-filter_complex',
      `${sourceFilters}[${source.output}]fps=60,${portraitFilter(segments, meta)}[base]${overlayFilters};[${chain.output}]format=yuv420p[out]`,
      '-map', '[out]', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-movflags', '+faststart', 'output.mp4'] };
  }
  const zoom = zoomPanFilter(segments, meta, 1920, 1080, 60);
  if (!overlays.length && !redactions.length) return { output: 'output.mp4', mimeType: 'video/mp4', args: [...inputs, '-vf', `fps=60,${zoom},format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', 'output.mp4'] };
  const chain = overlayChain(overlays);
  const overlayFilters = chain.filters.length ? `;${chain.filters.join(';')}` : '';
  return { output: 'output.mp4', mimeType: 'video/mp4', args: [...inputs, '-filter_complex',
    `${sourceFilters}[${source.output}]fps=60,${zoom}[base]${overlayFilters};[${chain.output}]format=yuv420p[out]`,
    '-map', '[out]', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-movflags', '+faststart', 'output.mp4'] };
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
  callouts: readonly EditableCallout[], events: readonly TraceEvent[], clock: MediaClockFit,
  redactions: readonly EditableRedaction[], redactionBoxes: readonly RedactionBox[],
  progress: (value: number) => void): Promise<Blob> {
  const engine = await ffmpeg();
  const listener = ({ progress: value }: { progress: number }) => progress(value);
  engine.on('progress', listener);
  try {
    const outputSize = format === 'gif' ? { width: 800, height: 450 } :
      format === 'vertical' ? { width: 1_080, height: 1_920 } : { width: 1_920, height: 1_080 };
    const cardSize = calloutSize(outputSize);
    const prepared = callouts.flatMap((callout, index) => {
      const event = events.find(({ id }) => id === callout.sourceEventId);
      const segment = segments.find(({ eventId }) => eventId === callout.sourceEventId);
      const window = calloutWindow(callout, segments, events, clock);
      const crop = segment && format === 'vertical' ? portraitCropAt(segment.clickMs, segments, meta.capture) : undefined;
      const layout = event && segment ? calloutLayout(event, segment, meta.capture, outputSize, cardSize, crop) : null;
      if (!event || !window || !layout || !callout.text.trim()) return [];
      const filename = `callout_${index}.png`;
      return [{ filename, data: renderCalloutCard(callout.text, cardSize), overlay: { filename,
        x: Math.round(layout.card.x), y: Math.round(layout.card.y), startSeconds: window.startMs / 1_000,
        endSeconds: window.endMs / 1_000 } satisfies ExportOverlay }];
    });
    const plan = buildExportPlan(format, segments, meta, prepared.map(({ overlay }) => overlay),
      compileRedactions(redactionBoxes, redactions, meta.capture));
    await engine.writeFile('input.webm', new Uint8Array(await media.arrayBuffer()));
    for (const item of prepared) await engine.writeFile(item.filename, await item.data);
    await engine.exec(plan.args);
    const data = await engine.readFile(plan.output);
    if (!(data instanceof Uint8Array)) throw new Error('Export produced invalid binary output.');
    const output = new Uint8Array(data.byteLength);
    output.set(data);
    return new Blob([output.buffer], { type: plan.mimeType });
  } finally { engine.off('progress', listener); }
}
