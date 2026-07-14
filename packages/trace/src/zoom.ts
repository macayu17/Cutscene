import type { BoundingBox, ScrollPosition } from './schema';

export type ZoomClick = { t: number; box: BoundingBox; scroll: ScrollPosition; viewport?: Size };
export type ZoomSegment = {
  startMs: number;
  clickMs: number;
  endMs: number;
  focus: BoundingBox;
  scale: number;
  viewport: Size;
};

type Size = { width: number; height: number };

export const AUTO_ZOOM_TRANSITION_MS = 650;
export const AUTO_ZOOM_HOLD_MS = 900;
export const AUTO_ZOOM_EXIT_MS = 900;
export const AUTO_ZOOM_MAX_SCALE = 1.8;

function focusRect(box: BoundingBox, viewport: Size): BoundingBox {
  const aspect = viewport.width / viewport.height;
  let width = Math.max(box.width + 96, 320);
  let height = Math.max(box.height + 96, width / aspect);
  width = Math.max(width, height * aspect);
  height = width / aspect;
  width = Math.min(width, viewport.width);
  height = Math.min(height, viewport.height);
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  return {
    x: Math.min(Math.max(centerX - width / 2, 0), viewport.width - width),
    y: Math.min(Math.max(centerY - height / 2, 0), viewport.height - height),
    width,
    height,
  };
}

function overlaps(a: BoundingBox, b: BoundingBox): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

export function deriveZoomSegments(clicks: readonly ZoomClick[], viewport: Size, scrollTimes: readonly number[] = []): ZoomSegment[] {
  const duringScroll = new Set<number>();
  for (let index = 1; index < clicks.length; index += 1) {
    const previous = clicks[index - 1];
    const current = clicks[index];
    if (previous && current && current.t - previous.t <= 1_200 &&
        (previous.scroll.x !== current.scroll.x || previous.scroll.y !== current.scroll.y)) {
      duringScroll.add(index - 1);
      duringScroll.add(index);
    }
  }
  const segments = clicks.flatMap((click, index) => {
    if (duringScroll.has(index)) return [];
    const clickViewport = click.viewport ?? viewport;
    const startMs = Math.max(0, click.t - AUTO_ZOOM_TRANSITION_MS);
    const endMs = click.t + AUTO_ZOOM_HOLD_MS + AUTO_ZOOM_EXIT_MS;
    if (scrollTimes.some((time) => time >= startMs && time <= endMs)) return [];
    const focus = focusRect(click.box, clickViewport);
    return [{
      startMs,
      clickMs: click.t,
      endMs,
      focus,
      scale: Math.min(AUTO_ZOOM_MAX_SCALE, clickViewport.width / focus.width),
      viewport: clickViewport,
    }];
  });
  return segments.reduce<ZoomSegment[]>((merged, segment) => {
    const previous = merged.at(-1);
    if (previous && segment.startMs <= previous.endMs && previous.viewport.width === segment.viewport.width &&
        previous.viewport.height === segment.viewport.height && overlaps(previous.focus, segment.focus)) {
      previous.endMs = Math.max(previous.endMs, segment.endMs);
      return merged;
    }
    merged.push(segment);
    return merged;
  }, []);
}
