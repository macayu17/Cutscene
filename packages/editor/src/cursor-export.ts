import { mapBoxToCapture } from '@cutscene/trace';
import { cameraTiming, portraitCropAt } from './camera';
import type { CursorSample, CursorTrack, CursorVisibleRange } from './cursor';
import { cursorRippleDiameter } from './cursor-render';
import type { ExportFormat, ExportMeta, ExportOverlay } from './export';
import type { EditableSegment } from './segments';

type CameraExpressions = { zoom: string; zoomX: string; zoomY: string; portraitX: string; portraitY: string;
  portraitWidth: number; portraitHeight: number };

export function cursorPathExpression(samples: readonly CursorSample[], coordinate: 'x' | 'y'): string {
  const points = collapseSamples(samples);
  const first = points[0];
  if (!first) return '0';
  let previous = first;
  const terms = [String(first[coordinate]), ...points.slice(1).flatMap((point) => {
    const duration = (point.timeMs - previous.timeMs) / 1_000;
    const delta = point[coordinate] - previous[coordinate];
    const start = previous.timeMs / 1_000;
    previous = point;
    return duration > 0 && delta !== 0 ? [`(${delta})*min(max((t-${start})/${duration},0),1)`] : [];
  })];
  while (terms.length > 1) {
    const next: string[] = [];
    for (let index = 0; index < terms.length; index += 2) {
      const right = terms[index + 1];
      next.push(right === undefined ? terms[index] ?? '0' : `(${terms[index]}+${right})`);
    }
    terms.splice(0, terms.length, ...next);
  }
  return terms[0] ?? '0';
}

export function cursorEnableExpression(ranges: readonly CursorVisibleRange[]): string {
  return ranges.filter(({ startMs, endMs }) => endMs >= startMs)
    .map(({ startMs, endMs }) => `between(t,${startMs / 1_000},${endMs / 1_000})`).join('+');
}

export function zoomPanFilter(segments: readonly EditableSegment[], meta: ExportMeta,
  width: number, height: number, fps: number): string {
  const camera = cameraExpressions(segments, meta, 'in_time');
  return `zoompan=z='${escapeFilter(camera.zoom)}':x='${escapeFilter(camera.zoomX.replaceAll('$zoom', 'zoom'))}':y='${escapeFilter(camera.zoomY.replaceAll('$zoom', 'zoom'))}':d=1:s=${width}x${height}:fps=${fps}`;
}

export function portraitFilter(segments: readonly EditableSegment[], meta: ExportMeta): string {
  const camera = cameraExpressions(segments, meta, 't');
  return `crop=${camera.portraitWidth}:${camera.portraitHeight}:x='${escapeFilter(camera.portraitX)}':y='${escapeFilter(camera.portraitY)}',scale=1080:1920:flags=lanczos,setsar=1`;
}

export function cursorPointExpressions(format: ExportFormat, x: string, y: string,
  segments: readonly EditableSegment[], meta: ExportMeta): { x: string; y: string } {
  const camera = cameraExpressions(segments, meta, 't');
  const sourceSize = (expression: string) => expression.replaceAll(/\biw\b/g, String(meta.capture.width))
    .replaceAll(/\bih\b/g, String(meta.capture.height));
  if (format === 'vertical') return {
    x: `((${x})-(${sourceSize(camera.portraitX)}))*${1_080 / camera.portraitWidth}`,
    y: `((${y})-(${sourceSize(camera.portraitY)}))*${1_920 / camera.portraitHeight}`,
  };
  const width = format === 'gif' ? 800 : 1_920;
  const height = format === 'gif' ? 450 : 1_080;
  return {
    x: `((${x})-(${sourceSize(camera.zoomX.replaceAll('$zoom', `(${camera.zoom})`))}))*(${camera.zoom})*${width / meta.capture.width}`,
    y: `((${y})-(${sourceSize(camera.zoomY.replaceAll('$zoom', `(${camera.zoom})`))}))*(${camera.zoom})*${height / meta.capture.height}`,
  };
}

export function buildCursorOverlays(format: ExportFormat, track: CursorTrack, size: number,
  segments: readonly EditableSegment[], meta: ExportMeta): ExportOverlay[] {
  if (!track.enabled || !track.samples.length) return [];
  const path = cursorPointExpressions(format, cursorPathExpression(track.samples, 'x'),
    cursorPathExpression(track.samples, 'y'), segments, meta);
  const arrow: ExportOverlay = { filename: 'cursor-arrow.png', x: path.x, y: path.y,
    startSeconds: 0, endSeconds: meta.media.durationMs / 1_000, enable: cursorEnableExpression(track.visibleRanges) };
  if (!track.ripple) return [arrow];
  return [arrow, ...track.clicks.flatMap((click) => Array.from({ length: 4 }, (_, phase): ExportOverlay => {
    const diameter = cursorRippleDiameter(size, phase);
    const point = cursorPointExpressions(format, String(click.x), String(click.y), segments, meta);
    const start = seconds(click.timeMs + phase * 100);
    const end = seconds(click.timeMs + (phase + 1) * 100);
    return { filename: `cursor-ripple-${phase}.png`, x: `(${point.x})-${diameter / 2}`,
      y: `(${point.y})-${diameter / 2}`, startSeconds: start, endSeconds: end,
      enable: phase === 3 ? `between(t,${start},${end})` : `gte(t,${start})*lt(t,${end})` };
  }))];
}

function seconds(timeMs: number): number { return Number((timeMs / 1_000).toFixed(6)); }

export function escapeFilter(expression: string): string {
  return expression.replaceAll('\\', '\\\\').replaceAll(',', '\\,').replaceAll("'", "\\'");
}

function collapseSamples(samples: readonly CursorSample[]): CursorSample[] {
  return samples.reduce<CursorSample[]>((points, sample) => {
    if (points.at(-1)?.timeMs === sample.timeMs) {
      const previous = points.at(-1);
      if (!previous?.click || sample.click) points[points.length - 1] = sample;
    }
    else if (!points.length || sample.timeMs > (points.at(-1)?.timeMs ?? -Infinity)) points.push(sample);
    return points;
  }, []);
}

function cameraExpressions(segments: readonly EditableSegment[], meta: ExportMeta, time: string): CameraExpressions {
  const factors = segments.map((segment) => strength(segment, time));
  const choose = (values: string[], fallback: string) => values.reduceRight((next, value, index) =>
    `if(gt(${factors[index]},0),${value},${next})`, fallback);
  const zoom = choose(segments.map((segment, index) => `1+(${factors[index]})*${segment.scale - 1}`), '1');
  const centers = segments.map((segment) => {
    const focus = mapBoxToCapture(segment.focus, segment.viewport, meta.capture);
    return { x: focus.x + focus.width / 2, y: focus.y + focus.height / 2 };
  });
  const centerX = choose(centers.map(({ x }, index) => `iw/2+(${factors[index]})*(${x}-iw/2)`), 'iw/2');
  const centerY = choose(centers.map(({ y }, index) => `ih/2+(${factors[index]})*(${y}-ih/2)`), 'ih/2');
  const crop = portraitCropAt(0, [], meta.capture);
  return { zoom,
    zoomX: `max(iw/(2*$zoom),min(iw-iw/(2*$zoom),${centerX}))-iw/(2*$zoom)`,
    zoomY: `max(ih/(2*$zoom),min(ih-ih/(2*$zoom),${centerY}))-ih/(2*$zoom)`,
    portraitX: `max(0,min(iw-${crop.width},${centerX}-${crop.width / 2}))`,
    portraitY: `max(0,min(ih-${crop.height},${centerY}-${crop.height / 2}))`,
    portraitWidth: crop.width, portraitHeight: crop.height };
}

function strength(segment: EditableSegment, time: string): string {
  const timing = cameraTiming(segment);
  const start = timing.startMs / 1_000;
  const peak = timing.peakMs / 1_000;
  const exitStart = timing.exitStartMs / 1_000;
  const end = timing.endMs / 1_000;
  const smooth = (value: string) => `(${value})*(${value})*(3-2*(${value}))`;
  const up = peak > start ? smooth(`(${time}-${start})/${peak - start}`) : '1';
  const down = end > exitStart ? smooth(`(${end}-${time})/${end - exitStart}`) : '0';
  return `if(between(${time},${start},${peak}),${up},if(between(${time},${exitStart},${end}),${down},if(between(${time},${peak},${exitStart}),1,0)))`;
}
