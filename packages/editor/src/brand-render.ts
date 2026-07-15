import { brandFontFamily, type BrandPreset } from './brand';
import { wrapCalloutText } from './callout-render';

type Size = { width: number; height: number };

export async function renderBrandCard(text: string, preset: BrandPreset, size: Size): Promise<Uint8Array> {
  const { canvas, context } = brandCanvas(size);
  context.fillStyle = preset.color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const background = luminance(preset.color);
  context.fillStyle = contrastRatio(background, luminance('#16181C')) > contrastRatio(background, 1) ? '#16181C' : '#FFFFFF';
  const fontSize = Math.max(24, Math.round(canvas.height * .1));
  context.font = `${fontSize}px ${brandFontFamily(preset.font)}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const maxWidth = canvas.width * .9;
  const lines = wrapCalloutText(text, Math.max(8, Math.floor(maxWidth / (fontSize * .62))), 3);
  const lineHeight = fontSize * 1.25;
  const firstY = canvas.height / 2 - (lines.length - 1) * lineHeight / 2;
  lines.forEach((line, index) => context.fillText(line, canvas.width / 2, firstY + index * lineHeight, maxWidth));
  return png(canvas);
}

export async function renderBrandWatermark(text: string, preset: BrandPreset, size: Size): Promise<Uint8Array> {
  const { canvas, context } = brandCanvas(size);
  context.fillStyle = preset.color;
  context.font = `${Math.max(12, Math.round(canvas.height * .36))}px ${brandFontFamily(preset.font)}`;
  context.textAlign = 'right';
  context.textBaseline = 'middle';
  context.fillText(text.trim(), canvas.width - 8, canvas.height / 2, canvas.width - 16);
  return png(canvas);
}

function brandCanvas(size: Size): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(size.width);
  canvas.height = Math.round(size.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable.');
  return { canvas, context };
}

async function png(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Brand PNG encoding failed.');
  return new Uint8Array(await blob.arrayBuffer());
}

function luminance(color: string): number {
  const channels = [1, 3, 5].map((start) => Number.parseInt(color.slice(start, start + 2), 16) / 255)
    .map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * (channels[0] ?? 0) + .7152 * (channels[1] ?? 0) + .0722 * (channels[2] ?? 0);
}

function contrastRatio(first: number, second: number): number {
  return (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
}
