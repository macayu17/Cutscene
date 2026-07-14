import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { chromium, expect, test } from '@playwright/test';

const execute = promisify(execFile);

test('captures a playable, complete, masked recording bundle', async () => {
  const output = path.resolve('test-results', 'capture');
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
    await control.locator('#start').click();
    await expect(control.locator('#status')).toContainText('recording');

    await page.locator('.new-todo').fill('raw-secret-value');
    await page.locator('.new-todo').press('Enter');
    await page.locator('.toggle').click();
    await page.evaluate(() => history.pushState({}, '', '#captured-route'));
    await page.evaluate(() => { document.body.style.minHeight = '1600px'; scrollTo(0, 20); });
    await page.setViewportSize({ width: 1200, height: 760 });
    await page.waitForTimeout(2_200);

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
      'interaction.click', 'interaction.input', 'interaction.scroll', 'viewport.resize']) expect(types.has(type)).toBe(true);
    expect(traceText).not.toContain('raw-secret-value');
    const click = events.find((event) => event.type === 'interaction.click');
    expect(click).toMatchObject({ v: 1, stepId: expect.any(String), scroll: expect.any(Object) });
    expect((click?.target as { locators?: unknown[] }).locators?.length).toBeGreaterThan(0);
    const meta = JSON.parse(await readFile(metaItem.filename, 'utf8')) as Record<string, unknown>;
    expect(meta).toMatchObject({ schemaVersion: 1, app: { commit: null, version: null, environment: null } });
    expect((await readFile(mediaItem.filename)).length).toBeGreaterThan(0);
    const probe = JSON.parse((await execute('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', mediaItem.filename])).stdout) as { streams: Array<{ width: number; height: number }> };
    expect(meta.capture).toMatchObject(probe.streams[0] ?? {});
  } finally {
    await context.close();
  }
});
