export type Box = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Size = {
  width: number;
  height: number;
};

export type ClockPoint = {
  contentClockMs: number;
  mediaTimeMs: number;
};

export function clockExchangeMidpoint(mediaBeforeMs: number, mediaAfterMs: number): number {
  return (mediaBeforeMs + mediaAfterMs) / 2;
}

export function fitClock(points: readonly ClockPoint[]): (contentTimeMs: number) => number {
  if (points.length === 0) return (contentTimeMs) => contentTimeMs;
  if (points.length === 1) {
    const point = points[0];
    if (!point) return (contentTimeMs) => contentTimeMs;
    const offset = point.mediaTimeMs - point.contentClockMs;
    return (contentTimeMs) => contentTimeMs + offset;
  }

  const count = points.length;
  const meanX = points.reduce((sum, point) => sum + point.contentClockMs, 0) / count;
  const meanY = points.reduce((sum, point) => sum + point.mediaTimeMs, 0) / count;
  const numerator = points.reduce(
    (sum, point) => sum + (point.contentClockMs - meanX) * (point.mediaTimeMs - meanY),
    0,
  );
  const denominator = points.reduce(
    (sum, point) => sum + (point.contentClockMs - meanX) ** 2,
    0,
  );
  const slope = denominator === 0 ? 1 : numerator / denominator;
  const intercept = meanY - slope * meanX;

  return (contentTimeMs) => slope * contentTimeMs + intercept;
}

export function mapBoxToVideo(box: Box, viewport: Size, videoArea: Size): Box {
  const scale = Math.min(videoArea.width / viewport.width, videoArea.height / viewport.height);
  const renderedWidth = viewport.width * scale;
  const renderedHeight = viewport.height * scale;
  const offsetX = (videoArea.width - renderedWidth) / 2;
  const offsetY = (videoArea.height - renderedHeight) / 2;

  return {
    x: offsetX + box.x * scale,
    y: offsetY + box.y * scale,
    width: box.width * scale,
    height: box.height * scale,
  };
}
