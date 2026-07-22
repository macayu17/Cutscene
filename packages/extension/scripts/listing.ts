import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

// Chrome Web Store listing screenshots, taken from the editor page inside the built
// extension. The subject is a real recording, not a mockup: PRODUCT.md forbids one.
const size = { width: 1_280, height: 800 };
const extensionRoot = fileURLToPath(new URL('..', import.meta.url));
const repositoryRoot = path.resolve(extensionRoot, '..', '..');
const bundle = process.env.CUTSCENE_BUNDLE ?? path.join(repositoryRoot, 'artifacts', 'submission', 'clean-recording');
const output = path.join(repositoryRoot, 'artifacts', 'store-listing');

await mkdir(output, { recursive: true });
const context = await chromium.launchPersistentContext(path.join(output, 'profile'), {
  headless: false,
  viewport: size,
  args: [`--disable-extensions-except=${path.join(extensionRoot, 'dist')}`,
    `--load-extension=${path.join(extensionRoot, 'dist')}`],
});
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  const page = context.pages()[0] ?? await context.newPage();

  await page.goto(`chrome-extension://${extensionId}/editor.html`);
  await page.locator('.file-label input').setInputFiles(bundle);
  await page.locator('.instrument').waitFor();
  await page.locator('.timeline, .trace-lane').first().waitFor();
  await page.waitForTimeout(1_500);
  await page.screenshot({ path: path.join(output, '01-editor.png') });

  // The claim of the whole product: selecting a recorded click shows the element it
  // landed on, its box in CSS pixels and the locator that found it.
  await page.locator('.events button.event').filter({ hasText: 'interaction.click' }).first().click();
  await page.waitForTimeout(1_200);
  await page.screenshot({ path: path.join(output, '02-element.png') });

  await page.locator('.action-menu summary', { hasText: 'Export' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(output, '03-artifacts.png') });
  await page.keyboard.press('Escape');
} finally {
  await context.close();
}
console.log(`wrote listing screenshots to ${output}`);
