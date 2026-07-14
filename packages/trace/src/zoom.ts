import type { BoundingBox, ScrollPosition } from './schema';

export type ZoomClick = { t: number; box: BoundingBox; scroll: ScrollPosition };
export type ZoomSegment = {
  startMs: number;
  clickMs: number;
  endMs: number;
  focus: BoundingBox;
  scale: number;
};

type Size = { width: number; height: number };

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

export function deriveZoomSegments(clicks: readonly ZoomClick[], viewport: Size): ZoomSegment[] {
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
    const focus = focusRect(click.box, viewport);
    return [{
      startMs: Math.max(0, click.t - 400),
      clickMs: click.t,
      endMs: click.t + 900,
      focus,
      scale: Math.min(2.5, viewport.width / focus.width),
    }];
  });
  return segments.reduce<ZoomSegment[]>((merged, segment) => {
    const previous = merged.at(-1);
    if (previous && segment.startMs <= previous.endMs && overlaps(previous.focus, segment.focus)) {
      previous.endMs = Math.max(previous.endMs, segment.endMs);
      return merged;
    }
    merged.push(segment);
    return merged;
  }, []);
}
