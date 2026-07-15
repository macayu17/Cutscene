export type CursorAsset = { filename: string; data: Uint8Array };

export function cursorRippleDiameter(size: number, phase: number): number {
  return Math.round(size * (1.5 + phase * .5));
}

export async function renderCursorAssets(size: number): Promise<CursorAsset[]> {
  const arrow = canvas(size, Math.ceil(size * 1.2));
  arrow.context.fillStyle = '#C8CDD4';
  arrow.context.strokeStyle = '#16181C';
  arrow.context.lineWidth = Math.max(1.5, size / 10);
  arrow.context.lineJoin = 'round';
  arrow.context.beginPath();
  arrow.context.moveTo(0, 0);
  arrow.context.lineTo(size * .72, size * .58);
  arrow.context.lineTo(size * .43, size * .64);
  arrow.context.lineTo(size * .62, size * 1.08);
  arrow.context.lineTo(size * .45, size * 1.16);
  arrow.context.lineTo(size * .27, size * .72);
  arrow.context.lineTo(size * .08, size * .96);
  arrow.context.closePath();
  arrow.context.fill();
  arrow.context.stroke();

  const assets: CursorAsset[] = [{ filename: 'cursor-arrow.png', data: await png(arrow.element) }];
  for (let phase = 0; phase < 4; phase += 1) {
    const diameter = cursorRippleDiameter(size, phase);
    const ripple = canvas(diameter, diameter);
    ripple.context.strokeStyle = '#F2A63B';
    ripple.context.globalAlpha = 1 - phase * .22;
    ripple.context.lineWidth = Math.max(2, size / 10);
    ripple.context.beginPath();
    ripple.context.arc(diameter / 2, diameter / 2, diameter / 2 - ripple.context.lineWidth, 0, Math.PI * 2);
    ripple.context.stroke();
    assets.push({ filename: `cursor-ripple-${phase}.png`, data: await png(ripple.element) });
  }
  return assets;
}

function canvas(width: number, height: number): { element: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  if (typeof document === 'undefined') throw new Error('Canvas is unavailable.');
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  const context = element.getContext('2d');
  if (!context) throw new Error('Canvas 2D context is unavailable.');
  return { element, context };
}

async function png(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Canvas PNG encoding failed.');
  return new Uint8Array(await blob.arrayBuffer());
}
