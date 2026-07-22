import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

// The mark is the product's own motif: an amber measurement box locking onto a target.
// Rendered rather than drawn by hand so a palette change is one edit, not four binaries.
// Small renderings need a heavier stroke and no centre mark, or the corners turn to mud.
const sizes = [
  { size: 16, stroke: 20, inset: 12, centre: 0 },
  { size: 32, stroke: 14, inset: 16, centre: 26 },
  { size: 48, stroke: 12, inset: 18, centre: 26 },
  { size: 128, stroke: 9, inset: 20, centre: 24 },
];

function mark({ stroke, inset, centre }: { stroke: number; inset: number; centre: number }): string {
  const far = 128 - inset;
  const arm = 30;
  const bracket = (x: number, y: number, dx: number, dy: number) =>
    `<path d="M${x} ${y + dy * arm} L${x} ${y} L${x + dx * arm} ${y}" fill="none" stroke="#F2A63B" stroke-width="${stroke}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
    <rect width="128" height="128" fill="#16181C"/>
    ${bracket(inset, inset, 1, 1)}${bracket(far, inset, -1, 1)}${bracket(inset, far, 1, -1)}${bracket(far, far, -1, -1)}
    ${centre ? `<rect x="${64 - centre / 2}" y="${64 - centre / 2}" width="${centre}" height="${centre}" fill="#F2A63B"/>` : ''}
  </svg>`;
}

const directory = fileURLToPath(new URL('../icons', import.meta.url));
await mkdir(directory, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
for (const variant of sizes) {
  await page.setViewportSize({ width: variant.size, height: variant.size });
  await page.setContent(`<body style="margin:0">${mark(variant).replace('<svg ',
    `<svg width="${variant.size}" height="${variant.size}" `)}</body>`);
  await writeFile(path.join(directory, `icon-${variant.size}.png`), await page.locator('svg').screenshot());
}
await browser.close();
