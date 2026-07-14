import type { Size } from './callouts';

export function wrapCalloutText(text: string, maxCharacters: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharacters) { current = candidate; continue; }
    if (lines.length === maxLines - 1) {
      lines.push(`${(current || word).slice(0, Math.max(1, maxCharacters - 1))}…`);
      return lines;
    }
    if (current) lines.push(current);
    current = word.slice(0, maxCharacters);
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

export async function renderCalloutCard(text: string, size: Size): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(size.width);
  canvas.height = Math.round(size.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable.');
  context.fillStyle = '#1E2126';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#F2A63B';
  context.fillRect(0, 0, Math.max(3, Math.round(canvas.width * .008)), canvas.height);
  const fontSize = Math.max(12, Math.round(canvas.height * .22));
  context.font = `${fontSize}px "IBM Plex Mono", monospace`;
  context.fillStyle = '#C8CDD4';
  context.textBaseline = 'middle';
  const lines = wrapCalloutText(text, Math.max(8, Math.floor((canvas.width - 30) / (fontSize * .62))), 3);
  const lineHeight = fontSize * 1.25;
  const firstY = canvas.height / 2 - (lines.length - 1) * lineHeight / 2;
  lines.forEach((line, index) => context.fillText(line, 16, firstY + index * lineHeight, canvas.width - 26));
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Callout PNG encoding failed.');
  return new Uint8Array(await blob.arrayBuffer());
}
