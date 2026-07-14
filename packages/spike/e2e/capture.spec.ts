import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium, expect, test } from '@playwright/test';

const durationSeconds = Number(process.env.CUTSCENE_DURATION_SECONDS ?? 5);
const requestedClicks = Number(process.env.CUTSCENE_CLICK_COUNT ?? 2);

test('records a real third-party tab and loads the bundle in the player', async () => {
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = path.resolve('artifacts', runId);
  const profileDir = path.join(runDir, 'chrome-profile');
  const downloadDir = path.join(runDir, 'downloads');
  const screenshotDir = path.join(runDir, 'screenshots');
  await Promise.all([mkdir(profileDir, { recursive: true }), mkdir(downloadDir, { recursive: true }), mkdir(screenshotDir, { recursive: true })]);

  const extensionPath = path.resolve('dist');
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-first-run',
      '--disable-default-apps',
    ],
  });

  try {
    let workers = context.serviceWorkers();
    if (workers.length === 0) workers = [await context.waitForEvent('serviceworker')];
    const worker = workers[0];
    if (!worker) throw new Error('Extension service worker did not start.');
    const extensionId = new URL(worker.url()).host;

    const target = await context.newPage();
    await target.goto('https://todomvc.com/examples/react/dist/', { waitUntil: 'domcontentloaded' });
    const newTodo = target.locator('.new-todo');
    for (let index = 0; index < requestedClicks; index += 1) {
      await newTodo.fill(`Phase 0 target ${index + 1}`);
      await newTodo.press('Enter');
    }
    await expect(target.locator('.todo-list li')).toHaveCount(requestedClicks);

    await target.bringToFront();
    const browser = context.browser();
    if (!browser) throw new Error('Chromium browser connection is unavailable.');
    const browserSession = await browser.newBrowserCDPSession();
    await browserSession.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
    const targets = await browserSession.send('Target.getTargets', {
      filter: [{ type: 'tab', exclude: false }],
    });
    const tabTarget = targets.targetInfos.find((candidate) => candidate.type === 'tab' && candidate.url === target.url());
    if (!tabTarget) throw new Error('Could not resolve Chromium tab target.');
    await browserSession.send('Extensions.triggerAction', {
      id: extensionId,
      targetId: tabTarget.targetId,
    });
    const targetTabId = await worker.evaluate(async (url) => {
      const tabs = await chrome.tabs.query({});
      return tabs.find((tab) => tab.url === url)?.id ?? null;
    }, target.url());
    if (targetTabId === null) throw new Error('Could not resolve the third-party target tab.');
    const monitor = await context.newPage();
    await monitor.goto(`chrome-extension://${extensionId}/control.html?tabId=${targetTabId}`);
    await monitor.locator('#start').click();
    await expect(monitor.locator('#status')).toContainText('recording', { timeout: 15_000 });
    const startedAt = Date.now();
    await target.bringToFront();

    const intervalMs = Math.max(500, (durationSeconds * 1_000 - 2_000) / requestedClicks);
    for (let index = 0; index < requestedClicks; index += 1) {
      const checkbox = target.locator('.todo-list li .toggle').nth(index);
      await checkbox.scrollIntoViewIfNeeded();
      await target.waitForTimeout(100);
      const sample = String(index + 1).padStart(2, '0');
      await target.screenshot({ path: path.join(screenshotDir, `reference-${sample}-before.png`) });
      await checkbox.click();
      await target.screenshot({ path: path.join(screenshotDir, `reference-${sample}-after.png`) });
      await target.waitForTimeout(intervalMs);
    }

    const remainingMs = durationSeconds * 1_000 - (Date.now() - startedAt);
    if (remainingMs > 0) await target.waitForTimeout(remainingMs);

    await monitor.bringToFront();
    await monitor.locator('#stop').click();
    await expect(monitor.locator('#status')).toContainText('saved', { timeout: 30_000 });

    await expect.poll(
      () => monitor.evaluate(async () => {
        const items = await chrome.downloads.search({ limit: 2, orderBy: ['-startTime'] });
        return items.length === 2 && items.every((item) => item.state === 'complete');
      }),
      { timeout: 30_000 },
    ).toBe(true);
    const downloads = await monitor.evaluate(async () => chrome.downloads.search({ limit: 2, orderBy: ['-startTime'] }));
    expect(downloads.map((item) => ({ state: item.state, error: item.error }))).toEqual([
      { state: 'complete', error: undefined },
      { state: 'complete', error: undefined },
    ]);
    const downloadedMediaPath = downloads.find((item) => item.mime.startsWith('video/webm'))?.filename;
    const downloadedTracePath = downloads.find((item) => !item.mime.startsWith('video/webm'))?.filename;
    if (!downloadedMediaPath || !downloadedTracePath) throw new Error('Recording download MIME types were not distinguishable.');
    const mediaPath = path.join(runDir, 'media.webm');
    const tracePath = path.join(runDir, 'trace.jsonl');
    await Promise.all([copyFile(downloadedMediaPath, mediaPath), copyFile(downloadedTracePath, tracePath)]);
    expect((await readFile(mediaPath)).length).toBeGreaterThan(0);
    const traceText = await readFile(tracePath, 'utf8');
    const trace = traceText
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line) as { type: string; mediaTimeMs?: number });
    const clickCount = trace.filter((event) => event.type === 'interaction.click').length;
    const syncCount = trace.filter((event) => event.type === 'system.clockSync').length;
    const recordedDurationSeconds = Math.max(
      ...trace.map((event) => event.mediaTimeMs ?? 0),
    ) / 1_000;
    expect(clickCount).toBe(requestedClicks);
    expect(syncCount).toBeGreaterThanOrEqual(Math.floor(durationSeconds / 2));

    const player = await context.newPage();
    await player.goto(`chrome-extension://${extensionId}/player.html`);
    await player.locator('#media-file').setInputFiles(mediaPath);
    await player.locator('#trace-file').setInputFiles(tracePath);
    await expect(player.locator('#readout')).toContainText(`${clickCount} clicks`);
    await player.locator('video').evaluate((element: HTMLVideoElement) => new Promise<void>((resolve, reject) => {
      if (element.readyState >= 1) {
        resolve();
        return;
      }
      element.addEventListener('loadedmetadata', () => resolve(), { once: true });
      element.addEventListener('error', () => reject(new Error('media.webm is not playable.')), { once: true });
    }));
    await player.locator('video').evaluate((element: HTMLVideoElement) => {
      element.muted = true;
      return element.play();
    });
    await expect.poll(() => player.locator('video').evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0.1);
    await player.locator('video').evaluate((element: HTMLVideoElement) => element.pause());
    expect(recordedDurationSeconds).toBeGreaterThanOrEqual(durationSeconds - 1);
    await player.screenshot({ path: path.join(screenshotDir, 'player.png') });

    await writeFile(
      path.join(runDir, 'summary.json'),
      `${JSON.stringify({ url: target.url(), viewport: { width: 1280, height: 800 }, durationSeconds: recordedDurationSeconds, clickCount, syncCount, mediaPath, tracePath }, null, 2)}\n`,
    );
  } finally {
    await context.close();
  }
});
