import type { BoundingBox, ScrollPosition } from './schema';

type Size = { width: number; height: number };

export function mapBoxToCapture(box: BoundingBox, viewport: Size, capture: Size): BoundingBox {
  const scale = Math.min(capture.width / viewport.width, capture.height / viewport.height);
  const offsetX = (capture.width - viewport.width * scale) / 2;
  const offsetY = (capture.height - viewport.height * scale) / 2;
  return {
    x: offsetX + box.x * scale,
    y: offsetY + box.y * scale,
    width: box.width * scale,
    height: box.height * scale,
  };
}

export function scrollMatches(recorded: ScrollPosition, current: ScrollPosition): boolean {
  return recorded.x === current.x && recorded.y === current.y;
}
