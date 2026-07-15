import { afterEach, describe, expect, it, vi } from 'vitest';
import { cameraAt, portraitCropAt } from './camera';
import { mapCursorToOutput, type CursorTrack } from './cursor';
import {
  buildCursorOverlays,
  cursorEnableExpression,
  cursorPathExpression,
  cursorPointExpressions,
} from './cursor-export';
import { renderCursorAssets } from './cursor-render';

afterEach(() => vi.unstubAllGlobals());

const meta = { capture: { width: 1920, height: 1080, fps: 30 }, media: { durationMs: 5_000, hasAudio: true } };
const segments = [{ id: 'z1', eventId: 'e1', startMs: 350, clickMs: 1_000, endMs: 2_650,
  focus: { x: 100, y: 100, width: 640, height: 360 }, scale: 1.8, viewport: { width: 1_200, height: 760 } }];
const track: CursorTrack = {
  enabled: true,
  ripple: true,
  samples: [
    { timeMs: 100, x: 300, y: 200, click: false },
    { timeMs: 200, x: 450, y: 250, click: true },
    { timeMs: 200, x: 475, y: 275, click: false },
    { timeMs: 400, x: 600, y: 350, click: false },
  ],
  clicks: [{ timeMs: 200, x: 450, y: 250, click: true }],
  visibleRanges: [{ startMs: 100, endMs: 500 }, { startMs: 800, endMs: 900 }],
};

describe('cursor filter expressions', () => {
  it('uses shallow cumulative clamped ramps and collapses equal-time samples', () => {
    const expression = cursorPathExpression(track.samples, 'x');
    expect(expression).toBe('300+(150)*min(max((t-0.1)/0.1,0),1)+(150)*min(max((t-0.2)/0.2,0),1)');
    expect(expression).not.toContain('if(');
    expect(expression).not.toMatch(/\/0(?:[),]|$)/);
  });

  it('builds merged idle visibility from overlay-local time', () => {
    expect(cursorEnableExpression(track.visibleRanges)).toBe('between(t,0.1,0.5)+between(t,0.8,0.9)');
  });

  it('skips cursor overlays when disabled or empty', () => {
    expect(buildCursorOverlays('mp4', { ...track, enabled: false }, 24, segments, meta)).toEqual([]);
    expect(buildCursorOverlays('mp4', { ...track, samples: [] }, 24, segments, meta)).toEqual([]);
  });

  it.each([
    ['mp4', 0], ['mp4', 1_000], ['vertical', 0], ['vertical', 1_000],
  ] as const)('matches numeric camera mapping for %s at %dms', (format, timeMs) => {
    const point = { x: 450, y: 250 };
    const expressions = cursorPointExpressions(format, String(point.x), String(point.y), segments, meta);
    const actual = { x: evaluate(expressions.x, timeMs / 1_000), y: evaluate(expressions.y, timeMs / 1_000) };
    const output = format === 'vertical' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
    const expected = format === 'vertical'
      ? (() => { const crop = portraitCropAt(timeMs, segments, meta.capture); return {
        x: (point.x - crop.x) * output.width / crop.width,
        y: (point.y - crop.y) * output.height / crop.height,
      }; })()
      : mapCursorToOutput(point, cameraAt(timeMs, segments, meta.capture, meta.capture), meta.capture, output);
    expect(actual.x).toBeCloseTo(expected.x, 6);
    expect(actual.y).toBeCloseTo(expected.y, 6);
  });

  it('builds one arrow and four non-overlapping ripple phases at the exact click anchor', () => {
    const overlays = buildCursorOverlays('mp4', track, 24, segments, meta);
    expect(overlays).toHaveLength(5);
    expect(overlays[0]).toMatchObject({ filename: 'cursor-arrow.png', enable: 'between(t,0.1,0.5)+between(t,0.8,0.9)' });
    expect(overlays.slice(1).map(({ enable }) => enable)).toEqual([
      'gte(t,0.2)*lt(t,0.3)', 'gte(t,0.3)*lt(t,0.4)', 'gte(t,0.4)*lt(t,0.5)', 'between(t,0.5,0.6)',
    ]);
    expect(overlays[1]?.x).toContain('450');
    expect(overlays[1]?.y).toContain('250');
    expect(overlays[0]?.x).toContain('min(max(');
    expect(overlays.flatMap(({ x, y }) => [String(x), String(y)]).join(' ')).not.toMatch(/\b(?:iw|ih|in_time)\b/);
  });
});

describe('cursor PNG rendering', () => {
  it('renders one arrow and four reusable ripple phases', async () => {
    const { canvas, context } = fakeCanvas();
    vi.stubGlobal('document', { createElement: () => canvas });
    const assets = await renderCursorAssets(24);
    expect(assets.map(({ filename }) => filename)).toEqual([
      'cursor-arrow.png', 'cursor-ripple-0.png', 'cursor-ripple-1.png', 'cursor-ripple-2.png', 'cursor-ripple-3.png',
    ]);
    expect(assets.every(({ data }) => data.byteLength === 2)).toBe(true);
    expect(context.moveTo).toHaveBeenCalledWith(0, 0);
    expect(context.fillStyle).toBe('#C8CDD4');
    expect(context.strokeStyle).toContain('#F2A63B');
  });

  it('reports plain Canvas and PNG encoding errors', async () => {
    vi.stubGlobal('document', undefined);
    await expect(renderCursorAssets(24)).rejects.toThrow('Canvas is unavailable.');
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });
    await expect(renderCursorAssets(24)).rejects.toThrow('Canvas 2D context is unavailable.');
    const { canvas } = fakeCanvas();
    canvas.toBlob = (callback: BlobCallback) => callback(null);
    vi.stubGlobal('document', { createElement: () => canvas });
    await expect(renderCursorAssets(24)).rejects.toThrow('Canvas PNG encoding failed.');
  });
});

function evaluate(expression: string, t: number): number {
  let offset = 0;
  const parse = (): number => sum();
  const sum = (): number => {
    let value = product();
    while (expression[offset] === '+' || expression[offset] === '-') {
      const operator = expression[offset++]; const right = product(); value = operator === '+' ? value + right : value - right;
    }
    return value;
  };
  const product = (): number => {
    let value = atom();
    while (expression[offset] === '*' || expression[offset] === '/') {
      const operator = expression[offset++]; const right = atom(); value = operator === '*' ? value * right : value / right;
    }
    return value;
  };
  const atom = (): number => {
    if (expression[offset] === '(') { offset += 1; const value = sum(); offset += 1; return value; }
    const token = /^[\w.]+/.exec(expression.slice(offset))?.[0] ?? '';
    offset += token.length;
    if (expression[offset] !== '(') return token === 't' ? t : token === 'iw' ? 1920 : token === 'ih' ? 1080 : Number(token);
    offset += 1;
    const args: number[] = [];
    while (expression[offset] !== ')') { args.push(sum()); if (expression[offset] === ',') offset += 1; }
    offset += 1;
    if (token === 'min') return Math.min(...args);
    if (token === 'max') return Math.max(...args);
    if (token === 'between') return Number((args[0] ?? 0) >= (args[1] ?? 0) && (args[0] ?? 0) <= (args[2] ?? 0));
    if (token === 'gt') return Number((args[0] ?? 0) > (args[1] ?? 0));
    if (token === 'if') return args[0] ? args[1] ?? 0 : args[2] ?? 0;
    throw new Error(`Unsupported function ${token}`);
  };
  return parse();
}

function fakeCanvas() {
  const context = {
    fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 0, lineJoin: '', lineCap: '',
    beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), fill: vi.fn(), stroke: vi.fn(), arc: vi.fn(),
  };
  const canvas = { width: 0, height: 0, getContext: () => context,
    toBlob: (callback: BlobCallback) => callback(new Blob([new Uint8Array([1, 2])], { type: 'image/png' })) };
  return { canvas: canvas as unknown as HTMLCanvasElement, context };
}
