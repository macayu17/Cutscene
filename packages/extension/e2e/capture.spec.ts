import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { chromium, expect, test } from '@playwright/test';

const execute = promisify(execFile);
const durationSeconds = Number(process.env.CUTSCENE_DURATION_SECONDS ?? 3);
const requestedClicks = Number(process.env.CUTSCENE_CLICK_COUNT ?? 1);
const requestedOutput = process.env.CUTSCENE_ARTIFACT_DIR;
const clickMode = process.env.CUTSCENE_CLICK_MODE ?? 'toggle';

test('captures a playable, complete, masked recording bundle', async () => {
  const output = requestedOutput ? path.resolve(requestedOutput) : path.resolve('test-results', 'capture');
  const downloads = path.join(output, 'downloads');
  await mkdir(downloads, { recursive: true });
  const context = await chromium.launchPersistentContext(path.join(output, 'profile'), {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: [`--disable-extensions-except=${path.resolve('dist')}`, `--load-extension=${path.resolve('dist')}`],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    const page = await context.newPage();
    await page.goto('https://todomvc.com/examples/react/dist/');
    for (let index = 0; clickMode === 'toggle' && index < requestedClicks; index += 1) {
      await page.locator('.new-todo').fill(`Phase 1 target ${index + 1}`);
      await page.locator('.new-todo').press('Enter');
    }
    await page.bringToFront();
    const browser = context.browser();
    if (!browser) throw new Error('Browser connection unavailable.');
    const cdp = await browser.newBrowserCDPSession();
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
    const targets = await cdp.send('Target.getTargets', { filter: [{ type: 'tab', exclude: false }] });
    const tabTarget = targets.targetInfos.find((target) => target.type === 'tab' && target.url === page.url());
    if (!tabTarget) throw new Error('Target tab unavailable.');
    await cdp.send('Extensions.triggerAction', { id: extensionId, targetId: tabTarget.targetId });
    const tabId = await worker.evaluate(async (url) => (await chrome.tabs.query({})).find((tab) => tab.url === url)?.id, page.url());
    const control = await context.newPage();
    await control.goto(`chrome-extension://${extensionId}/control.html?tabId=${tabId}`);
    await control.locator('#redact').fill('.todo-list li');
    await control.locator('#start').click();
    await expect(control.locator('#status')).toContainText('recording');

    const startedAt = Date.now();
    await page.locator('.new-todo').fill('raw-secret-value');
    await page.locator('.new-todo').fill('');
    const intervalMs = Math.max(100, (durationSeconds * 1_000 - 3_000) / requestedClicks);
    for (let index = 0; index < requestedClicks; index += 1) {
      if (clickMode === 'edge-input') {
        const box = await page.locator('.new-todo').boundingBox();
        if (!box) throw new Error('Comparison input is not visible.');
        await page.locator('.new-todo').click({ position: { x: box.width - 8, y: box.height / 2 } });
      } else {
        await page.locator('.toggle').nth(index).click();
      }
      if (index === 0) {
        await page.locator('.todo-list li').first().evaluate((element) => { element.style.transform = 'translateY(24px)'; });
        await page.waitForTimeout(100);
        await page.evaluate(() => history.pushState({}, '', '#captured-route'));
        await page.evaluate(() => { document.body.style.minHeight = '1600px'; scrollTo(0, 20); });
        await page.setViewportSize({ width: 1200, height: 760 });
      }
      await page.waitForTimeout(intervalMs);
    }
    const remaining = durationSeconds * 1_000 - (Date.now() - startedAt);
    if (remaining > 0) await page.waitForTimeout(remaining);

    await control.bringToFront();
    await control.locator('#stop').click();
    await expect(control.locator('#status')).toContainText('saved', { timeout: 30_000 });
    await expect.poll(async () => (await control.evaluate(() => chrome.downloads.search({ orderBy: ['-startTime'], limit: 3 })))
      .filter((item) => item.state === 'complete').length).toBe(3);
    const items = await control.evaluate(() => chrome.downloads.search({ orderBy: ['-startTime'], limit: 3 }));
    for (const item of items) await copyFile(item.filename, path.join(output, path.basename(item.filename)));

    const traceItem = items.find((item) => item.mime.includes('ndjson'));
    const metaItem = items.find((item) => item.mime === 'application/json');
    const mediaItem = items.find((item) => item.mime.startsWith('video/webm'));
    if (!traceItem || !metaItem || !mediaItem) throw new Error('Bundle files missing.');
    const traceText = await readFile(traceItem.filename, 'utf8');
    const events = traceText.trim().split(/\r?\n/).map((line) => JSON.parse(line) as Record<string, unknown>);
    const types = new Set(events.map((event) => event.type));
    for (const type of ['system.recordingStart', 'system.recordingStop', 'system.clockSync', 'navigation',
      'interaction.click', 'interaction.input', 'interaction.scroll', 'viewport.resize', 'annotation.redaction']) expect(types.has(type)).toBe(true);
    expect(traceText).not.toContain('raw-secret-value');
    expect(events.filter((event) => event.type === 'interaction.click')).toHaveLength(requestedClicks);
    const navigation = events.find((event) => event.type === 'navigation');
    const firstSync = events.find((event) => event.type === 'system.clockSync');
    expect(Math.abs(Number(navigation?.t) - Number(firstSync?.t))).toBeLessThan(100);
    const click = events.find((event) => event.type === 'interaction.click');
    expect(click).toMatchObject({ v: 1, stepId: expect.any(String), scroll: expect.any(Object) });
    expect((click?.target as { locators?: unknown[] }).locators?.length).toBeGreaterThan(0);
    const meta = JSON.parse(await readFile(metaItem.filename, 'utf8')) as Record<string, unknown>;
    expect(meta).toMatchObject({ schemaVersion: 1, privacy: { visualRedactionSelectors: ['.todo-list li'] },
      app: { commit: null, version: null, environment: null } });
    const redaction = events.find((event) => event.type === 'annotation.redaction' && event.visible === true);
    expect(redaction).toMatchObject({ selector: '.todo-list li', instanceId: expect.any(String), visible: true,
      box: { x: expect.any(Number), y: expect.any(Number), width: expect.any(Number), height: expect.any(Number) } });
    expect(redaction).not.toHaveProperty('target');
    expect(redaction).not.toHaveProperty('text');
    expect(redaction).not.toHaveProperty('value');
    const redactionSamples = events.filter((event) => event.type === 'annotation.redaction' && event.visible === true);
    expect(redactionSamples.length).toBeGreaterThan(1);
    expect(new Set(redactionSamples.map((event) => (event.box as { y: number }).y)).size).toBeGreaterThan(1);
    expect((await readFile(mediaItem.filename)).length).toBeGreaterThan(0);
    const probe = JSON.parse((await execute('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', mediaItem.filename])).stdout) as { streams: Array<{ width: number; height: number }> };
    expect(meta.capture).toMatchObject(probe.streams[0] ?? {});
  } finally {
    await context.close();
  }
});
