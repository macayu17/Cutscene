import { type MediaClockFit, type TraceEvent } from '@cutscene/trace';
import type { EditableSegment } from './segments';
import { portraitCropAt } from './camera';
import { calloutLayout, calloutSize, calloutWindow, type EditableCallout } from './callouts';
import { renderCalloutCard } from './callout-render';
import { compileRedactions, type CompiledRedaction, type EditableRedaction, type RedactionBox } from './redactions';
import { watermarkLayout, type BrandPreset } from './brand';
import { renderBrandCard, renderBrandWatermark } from './brand-render';
import { buildCursorOverlays, escapeFilter, portraitFilter, zoomPanFilter } from './cursor-export';
import { deriveCursorSamples, prepareCursorTrack, type CursorSettings } from './cursor';
import { renderCursorAssets } from './cursor-render';

export type ExportMeta = {
  capture: { width: number; height: number; fps: number };
  viewport?: { width: number; height: number };
  media: { durationMs: number; hasAudio: boolean };
};
export type ExportFormat = 'gif' | 'mp4' | 'vertical';
export type ExportPlan = { args: string[]; output: 'output.gif' | 'output.mp4'; mimeType: 'image/gif' | 'video/mp4' };
export type ExportOverlay = { filename: string; x: number | string; y: number | string; startSeconds: number; endSeconds: number;
  enable?: string };
export type BrandExportCards = { introFilename?: string; outroFilename?: string; introSeconds: number; outroSeconds: number };

function overlayChain(overlays: readonly ExportOverlay[]): { filters: string[]; output: string } {
  let input = 'base';
  const filters = overlays.map((overlay, index) => {
    const output = `overlay_${index}`;
    const x = typeof overlay.x === 'number' ? overlay.x : `'${escapeFilter(overlay.x)}'`;
    const y = typeof overlay.y === 'number' ? overlay.y : `'${escapeFilter(overlay.y)}'`;
    const enable = overlay.enable ? escapeFilter(overlay.enable) : `between(t,${overlay.startSeconds},${overlay.endSeconds})`;
    const filter = `[${input}][${index + 1}:v]overlay=${x}:${y}:enable='${enable}':eof_action=repeat[${output}]`;
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

export type ExportWindow = { startSeconds: number; endSeconds: number };

export function buildExportPlan(format: ExportFormat, segments: readonly EditableSegment[], meta: ExportMeta,
  overlays: readonly ExportOverlay[] = [], redactions: readonly CompiledRedaction[] = [],
  cards: BrandExportCards = { introSeconds: 0, outroSeconds: 0 }, window?: ExportWindow, gifWidth = 800): ExportPlan {
  const intro = cards.introFilename && cards.introSeconds > 0 ? cards.introFilename : undefined;
  const outro = cards.outroFilename && cards.outroSeconds > 0 ? cards.outroFilename : undefined;
  if (intro || outro) return buildBrandedExportPlan(format, segments, meta, overlays, redactions, {
    ...(intro ? { introFilename: intro } : {}), ...(outro ? { outroFilename: outro } : {}),
    introSeconds: intro ? cards.introSeconds : 0, outroSeconds: outro ? cards.outroSeconds : 0,
  }, gifWidth);
  const inputs = ['-i', 'input.webm', ...overlays.flatMap(({ filename }) => ['-i', filename])];
  const source = redactionChain(redactions);
  const sourceFilters = source.filters.length ? `${source.filters.join(';')};` : '';
  if (format === 'gif') {
    const height = Math.round(gifWidth * meta.capture.height / meta.capture.width);
    const zoom = zoomPanFilter(segments, meta, gifWidth, height, 15);
    const chain = overlayChain(overlays);
    const overlayFilters = chain.filters.length ? `;${chain.filters.join(';')}` : '';
    // Trim after the camera and overlays so their absolute-time expressions stay
    // correct, then reset PTS so the windowed GIF starts at zero. Both palettegen
    // and paletteuse then see only the windowed frames.
    const trim = window
      ? `;[${chain.output}]trim=start=${window.startSeconds}:end=${window.endSeconds},setpts=PTS-STARTPTS[win]`
      : '';
    const paletteInput = window ? 'win' : chain.output;
    return { output: 'output.gif', mimeType: 'image/gif', args: [...inputs, '-filter_complex',
      `${sourceFilters}[${source.output}]fps=15,${zoom}[base]${overlayFilters}${trim};[${paletteInput}]split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle[out]`,
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

function buildBrandedExportPlan(format: ExportFormat, segments: readonly EditableSegment[], meta: ExportMeta,
  overlays: readonly ExportOverlay[], redactions: readonly CompiledRedaction[], cards: BrandExportCards,
  gifWidth: number): ExportPlan {
  const width = format === 'gif' ? gifWidth : format === 'vertical' ? 1_080 : 1_920;
  const height = format === 'gif' ? Math.round(gifWidth * meta.capture.height / meta.capture.width) :
    format === 'vertical' ? 1_920 : 1_080;
  const fps = format === 'gif' ? 15 : 60;
  const cardInputs: string[] = [];
  if (cards.introFilename) cardInputs.push('-loop', '1', '-t', String(cards.introSeconds), '-i', cards.introFilename);
  if (cards.outroFilename) cardInputs.push('-loop', '1', '-t', String(cards.outroSeconds), '-i', cards.outroFilename);
  const inputs = ['-i', 'input.webm', ...overlays.flatMap(({ filename }) => ['-i', filename]), ...cardInputs];
  const source = redactionChain(redactions);
  const sourceFilters = source.filters.length ? `${source.filters.join(';')};` : '';
  const camera = format === 'vertical' ? portraitFilter(segments, meta) : zoomPanFilter(segments, meta, width, height, fps);
  const chain = overlayChain(overlays);
  const filters = [`${sourceFilters}[${source.output}]fps=${fps},${camera}[base]`, ...chain.filters];
  let cardIndex = overlays.length + 1;
  const concatInputs: string[] = [];
  if (cards.introFilename) {
    filters.push(`[${cardIndex}:v]fps=${fps},scale=${width}:${height}:flags=lanczos,setsar=1[intro]`);
    concatInputs.push('[intro]');
    cardIndex += 1;
  }
  concatInputs.push(`[${chain.output}]`);
  if (cards.outroFilename) {
    filters.push(`[${cardIndex}:v]fps=${fps},scale=${width}:${height}:flags=lanczos,setsar=1[outro]`);
    concatInputs.push('[outro]');
  }
  filters.push(`${concatInputs.join('')}concat=n=${concatInputs.length}:v=1:a=0[branded]`);
  if (format === 'gif') {
    filters.push('[branded]split[a][b]', '[a]palettegen=stats_mode=diff[p]',
      '[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle[out]');
    return { output: 'output.gif', mimeType: 'image/gif', args: [...inputs, '-filter_complex', filters.join(';'),
      '-map', '[out]', '-loop', '0', 'output.gif'] };
  }
  const audio: string[] = [];
  if (meta.media.hasAudio) {
    const audioFilters = [cards.introFilename ? `adelay=${Math.round(cards.introSeconds * 1_000)}:all=1` : '',
      cards.outroFilename ? `apad=pad_dur=${cards.outroSeconds}` : ''].filter(Boolean).join(',');
    filters.push(`[0:a]${audioFilters}[audio]`);
    audio.push('-map', '[audio]');
  }
  return { output: 'output.mp4', mimeType: 'video/mp4', args: [...inputs, '-filter_complex', filters.join(';'),
    '-map', '[branded]', ...audio, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    ...(meta.media.hasAudio ? ['-c:a', 'aac'] : []), '-movflags', '+faststart', 'output.mp4'] };
}

let loaded: Promise<InstanceType<typeof import('@ffmpeg/ffmpeg')['FFmpeg']>> | null = null;

async function ffmpeg() {
  if (!loaded) loaded = (async () => {
    // The core is served from our own origin, not a CDN: an extension page's CSP
    // refuses both remote and blob: script, and this build runs inside the extension.
    const [{ FFmpeg }, { default: coreURL }, { default: wasmURL }] = await Promise.all([
      import('@ffmpeg/ffmpeg'),
      import('@ffmpeg/core?url'),
      import('@ffmpeg/core/wasm?url'),
    ]);
    const instance = new FFmpeg();
    await instance.load({ coreURL, wasmURL });
    return instance;
  })();
  return loaded;
}

export async function exportRecording(media: Blob, format: ExportFormat, segments: readonly EditableSegment[], meta: ExportMeta,
  callouts: readonly EditableCallout[], events: readonly TraceEvent[], clock: MediaClockFit,
  redactions: readonly EditableRedaction[], redactionBoxes: readonly RedactionBox[],
  brand: BrandPreset | null, cursorSettings: CursorSettings,
  progress: (value: number) => void, window?: ExportWindow, gifWidth = 800): Promise<Blob> {
  const engine = await ffmpeg();
  const runFiles = new Set<string>();
  const listener = ({ progress: value }: { progress: number }) => progress(value);
  engine.on('progress', listener);
  try {
    const outputSize = format === 'gif' ? { width: gifWidth, height: Math.round(gifWidth * meta.capture.height / meta.capture.width) } :
      format === 'vertical' ? { width: 1_080, height: 1_920 } : { width: 1_920, height: 1_080 };
    const cursorTrack = cursorSettings.enabled
      ? prepareCursorTrack(deriveCursorSamples(events, clock, meta.capture), cursorSettings) : null;
    const cursorAssets = cursorTrack?.samples.length ? await renderCursorAssets(cursorSettings.size) : [];
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
    const watermarkBounds = brand?.watermark.trim() ? watermarkLayout(outputSize) : null;
    const watermark = brand && watermarkBounds ? { filename: 'brand-watermark.png',
      data: await renderBrandWatermark(brand.watermark, brand, watermarkBounds), overlay: { filename: 'brand-watermark.png',
        x: watermarkBounds.x, y: watermarkBounds.y, startSeconds: 0,
        endSeconds: meta.media.durationMs / 1_000 } satisfies ExportOverlay } : null;
    const intro = brand?.intro.trim() ? { filename: 'intro.png', data: await renderBrandCard(brand.intro, brand, outputSize) } : null;
    const outro = brand?.outro.trim() ? { filename: 'outro.png', data: await renderBrandCard(brand.outro, brand, outputSize) } : null;
    const overlays = [...prepared.map(({ overlay }) => overlay), ...(watermark ? [watermark.overlay] : []),
      ...(cursorTrack ? buildCursorOverlays(format, cursorTrack, cursorSettings.size, segments, meta) : [])];
    const plan = buildExportPlan(format, segments, meta, overlays,
      compileRedactions(redactionBoxes, redactions, meta.capture), {
        ...(intro ? { introFilename: intro.filename } : {}), ...(outro ? { outroFilename: outro.filename } : {}),
        introSeconds: intro ? 1.5 : 0, outroSeconds: outro ? 1.5 : 0,
      }, window, gifWidth);
    ['input.webm', plan.output, ...prepared.map(({ filename }) => filename),
      ...(watermark ? [watermark.filename] : []), ...(intro ? [intro.filename] : []), ...(outro ? [outro.filename] : []),
      ...cursorAssets.map(({ filename }) => filename)].forEach((filename) => runFiles.add(filename));
    await engine.writeFile('input.webm', new Uint8Array(await media.arrayBuffer()));
    for (const item of prepared) await engine.writeFile(item.filename, await item.data);
    if (watermark) await engine.writeFile(watermark.filename, watermark.data);
    if (intro) await engine.writeFile(intro.filename, intro.data);
    if (outro) await engine.writeFile(outro.filename, outro.data);
    for (const asset of cursorAssets) await engine.writeFile(asset.filename, asset.data);
    await engine.deleteFile(plan.output).catch(() => undefined);
    const exitCode = await engine.exec(plan.args);
    if (exitCode !== 0) throw new Error(`FFmpeg export failed with exit code ${exitCode}.`);
    const data = await engine.readFile(plan.output);
    if (!(data instanceof Uint8Array)) throw new Error('Export produced invalid binary output.');
    const output = new Uint8Array(data.byteLength);
    output.set(data);
    return new Blob([output.buffer], { type: plan.mimeType });
  } finally {
    await Promise.allSettled([...runFiles].map((filename) => engine.deleteFile(filename)));
    engine.off('progress', listener);
  }
}
