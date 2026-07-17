import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { chromium, expect, test } from '@playwright/test';
import { parseTraceEvent, planReplay, type TraceEvent } from '@cutscene/trace';
import { POINTER_SAMPLE_INTERVAL_MS } from '../src/pointer';

const execute = promisify(execFile);
const durationSeconds = Number(process.env.CUTSCENE_DURATION_SECONDS ?? 3);
const requestedClicks = Number(process.env.CUTSCENE_CLICK_COUNT ?? 1);
const requestedOutput = process.env.CUTSCENE_ARTIFACT_DIR;
const clickMode = process.env.CUTSCENE_CLICK_MODE ?? 'toggle';
const cleanDemo = process.env.CUTSCENE_CLEAN_DEMO === '1';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function point(value: unknown, label: string): { x: number; y: number } {
  if (!record(value) || typeof value.x !== 'number' || !Number.isFinite(value.x) ||
      typeof value.y !== 'number' || !Number.isFinite(value.y)) throw new Error(`${label} is invalid.`);
  return { x: value.x, y: value.y };
}

function box(value: unknown, label: string): { x: number; y: number; width: number; height: number } {
  if (!record(value) || typeof value.x !== 'number' || !Number.isFinite(value.x) ||
      typeof value.y !== 'number' || !Number.isFinite(value.y) ||
      typeof value.width !== 'number' || !Number.isFinite(value.width) ||
      typeof value.height !== 'number' || !Number.isFinite(value.height)) throw new Error(`${label} is invalid.`);
  return { x: value.x, y: value.y, width: value.width, height: value.height };
}

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
    await control.locator('#redact').fill('[');
    await control.locator('#start').click();
    await expect(control.locator('#status')).toContainText('not a valid selector');
    await expect(control.locator('#start')).toBeEnabled();
    await expect(control.locator('#stop')).toBeDisabled();
    await control.locator('#redact').fill('.new-todo, .todo-list li');
    await control.locator('#start').click();
    await expect(control.locator('#status')).toContainText('recording', { timeout: 15_000 });

    await page.reload();
    await expect(page.locator('.new-todo')).toBeVisible();
    await expect.poll(() => worker.evaluate(async (id) => {
      if (id === undefined) return false;
      try { return (await chrome.tabs.sendMessage(id, { type: 'clock.sample' }) as { ok?: boolean }).ok === true; }
      catch { return false; }
    }, tabId)).toBe(true);
    for (let index = 0; clickMode === 'toggle' && index < requestedClicks; index += 1) {
      await page.locator('.new-todo').fill(`Post-navigation target ${index + 1}`);
      await page.locator('.new-todo').press('a');
      await page.locator('.new-todo').press('Enter');
    }

    const startedAt = Date.now();
    if (!cleanDemo) {
      await page.evaluate(() => {
        const wrapper = document.createElement('div');
        wrapper.dataset.sensitive = '';
        wrapper.innerHTML = '<input id="nested-sensitive" aria-label="raw-nested-label">';
        document.body.append(wrapper);
      });
      await page.locator('#nested-sensitive').fill('raw-nested-secret');
      await page.locator('.new-todo').fill('raw-secret-value');
      await page.locator('.new-todo').fill('');
    }
    await page.bringToFront();
    for (const point of [{ x: 80, y: 80 }, { x: 180, y: 120 }, { x: 280, y: 180 }, { x: 380, y: 240 }, { x: 480, y: 300 }]) {
      await page.mouse.move(point.x, point.y);
      await page.waitForTimeout(40);
    }
    const clickPoints: Array<{ x: number; y: number }> = [];
    const intervalMs = Math.max(100, (durationSeconds * 1_000 - 3_000) / requestedClicks);
    for (let index = 0; index < requestedClicks; index += 1) {
      const clickTarget = clickMode === 'edge-input' ? page.locator('.new-todo') : page.locator('.toggle').nth(index);
      const box = await clickTarget.boundingBox();
      if (!box) throw new Error('Click target is not visible.');
      const point = clickMode === 'edge-input'
        ? { x: Math.round(box.x + box.width - 8), y: Math.round(box.y + box.height / 2) }
        : { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
      clickPoints.push(point);
      await page.mouse.click(point.x, point.y);
      if (index === 0) {
        const todo = page.locator('.todo-list li').first();
        await todo.evaluate((element) => { element.style.visibility = 'hidden'; });
        await page.waitForTimeout(100);
        await todo.evaluate((element) => { element.style.visibility = 'visible'; });
        await page.waitForTimeout(100);
        await todo.evaluate((element) => { element.style.transform = 'translateY(24px)'; });
        await page.waitForTimeout(100);
        await todo.evaluate((element) => {
          const box = element.getBoundingClientRect();
          Object.assign(element.style, { position: 'fixed', left: `${box.x}px`, top: `${box.y}px`,
            width: `${box.width}px`, boxSizing: 'border-box', transform: 'none' });
        });
        await page.waitForTimeout(100);
        await page.evaluate(() => history.pushState({}, '', '#captured-route'));
        await page.evaluate(() => { document.body.style.minHeight = '1600px'; scrollTo(0, 20); });
        await page.setViewportSize({ width: 1200, height: 760 });
        await page.waitForTimeout(100);
        await todo.evaluate((element) => element.removeAttribute('style'));
        expect(await todo.evaluate((element) => element.style.position)).toBe('');
      }
      await page.waitForTimeout(intervalMs);
    }
    const remaining = durationSeconds * 1_000 - (Date.now() - startedAt);
    if (remaining > 0) await page.waitForTimeout(remaining);

    await control.bringToFront();
    await control.locator('#stop').click();
    await page.bringToFront();
    for (let index = 0; index < 30; index += 1) {
      await page.mouse.move(1_000 + index, 340 + index);
      await page.waitForTimeout(20);
    }
    await expect(control.locator('#status')).toContainText('saved', { timeout: 30_000 });
    await expect.poll(async () => (await control.evaluate(() => chrome.downloads.search({ orderBy: ['-startTime'], limit: 3 })))
      .filter((item) => item.state === 'complete').length, { timeout: 30_000 }).toBe(3);
    const items = await control.evaluate(() => chrome.downloads.search({ orderBy: ['-startTime'], limit: 3 }));
    for (const item of items) await copyFile(item.filename, path.join(output, path.basename(item.filename)));

    const traceItem = items.find((item) => item.mime.includes('ndjson'));
    const metaItem = items.find((item) => item.mime === 'application/json');
    const mediaItem = items.find((item) => item.mime.startsWith('video/webm'));
    if (!traceItem || !metaItem || !mediaItem) throw new Error('Bundle files missing.');
    const traceText = await readFile(traceItem.filename, 'utf8');
    const events = traceText.trim().split(/\r?\n/).map((line) => JSON.parse(line) as Record<string, unknown>);
    if (cleanDemo) {
      const traceEvents: TraceEvent[] = [];
      for (const event of events) {
        const parsed = parseTraceEvent(event);
        if (!parsed.ok) throw new Error(parsed.error);
        traceEvents.push(parsed.value);
      }
      expect(planReplay(traceEvents, { step_0000: 'Clean demo value' })).toMatchObject({ ok: true });
    }
    for (let index = 1; index < events.length; index += 1) {
      expect(Number(events[index - 1]?.t)).toBeLessThanOrEqual(Number(events[index]?.t));
    }
    const types = new Set(events.map((event) => event.type));
    for (const type of ['system.recordingStart', 'system.recordingStop', 'system.clockSync', 'navigation',
      'interaction.click', 'interaction.input', 'interaction.keypress', 'interaction.scroll', 'viewport.resize',
      'annotation.redaction']) expect(types.has(type)).toBe(true);
    expect(traceText).not.toContain('raw-secret-value');
    expect(traceText).not.toContain('raw-nested-secret');
    expect(traceText).not.toContain('raw-nested-label');
    expect(events.filter((event) => event.type === 'interaction.click')).toHaveLength(requestedClicks);
    const keypresses = events.filter((event) => event.type === 'interaction.keypress');
    expect(keypresses).toHaveLength(requestedClicks);
    for (const keypress of keypresses) {
      expect(keypress).toMatchObject({ key: 'Enter', stepId: 'step_0000' });
      expect(keypress).not.toHaveProperty('code');
      expect(keypress).not.toHaveProperty('modifiers');
    }
    const hoverSamples = events.filter((event) => event.type === 'interaction.hover');
    expect(hoverSamples.length).toBeGreaterThanOrEqual(5);
    for (const sample of hoverSamples) {
      const pointer = point(sample.pointer, 'Hover pointer');
      expect(Number.isFinite(pointer.x)).toBe(true);
      expect(Number.isFinite(pointer.y)).toBe(true);
      expect(sample).not.toHaveProperty('target');
      expect(sample).not.toHaveProperty('text');
      expect(sample).not.toHaveProperty('value');
    }
    expect(hoverSamples.some((sample) => {
      const pointer = point(sample.pointer, 'Hover pointer');
      return pointer.x >= 1_000 && pointer.x < 1_030 && pointer.y >= 340 && pointer.y < 370;
    })).toBe(false);
    for (let index = 1; index < hoverSamples.length; index += 1) {
      expect(Number(hoverSamples[index]?.t) - Number(hoverSamples[index - 1]?.t))
        .toBeGreaterThanOrEqual(POINTER_SAMPLE_INTERVAL_MS - 1);
    }
    const navigation = events.find((event) => event.type === 'navigation');
    expect(events.filter((event) => event.type === 'navigation').length).toBeGreaterThanOrEqual(2);
    const firstSync = events.find((event) => event.type === 'system.clockSync');
    expect(Math.abs(Number(navigation?.t) - Number(firstSync?.t))).toBeLessThan(100);
    const syncs = events.filter((event) => event.type === 'system.clockSync');
    expect(syncs.length).toBeGreaterThanOrEqual(2);
    for (let index = 1; index < syncs.length; index += 1) {
      expect(Number(syncs[index]?.t)).toBeGreaterThan(Number(syncs[index - 1]?.t));
      expect(Number(syncs[index]?.mediaTimeMs)).toBeGreaterThan(Number(syncs[index - 1]?.mediaTimeMs));
    }
    const click = events.find((event) => event.type === 'interaction.click');
    expect(click).toMatchObject({ v: 1, stepId: 'step_0001', scroll: expect.any(Object) });
    expect(hoverSamples.filter((sample) => Number(sample.t) < Number(click?.t))
      .every((sample) => sample.stepId === 'step_0000')).toBe(true);
    if (!click || !record(click.target) || !Array.isArray(click.target.locators)) throw new Error('Click target is invalid.');
    expect(click.target.locators.length).toBeGreaterThan(0);
    const scriptedClick = clickPoints[0];
    if (!scriptedClick) throw new Error('Scripted click point missing.');
    const clickPointer = point(click.pointer, 'Click pointer');
    expect(clickPointer).toEqual(scriptedClick);
    const clickBox = box(click.target.boundingBox, 'Click target box');
    expect(clickPointer.x).toBeGreaterThanOrEqual(clickBox.x);
    expect(clickPointer.x).toBeLessThanOrEqual(clickBox.x + clickBox.width);
    expect(clickPointer.y).toBeGreaterThanOrEqual(clickBox.y);
    expect(clickPointer.y).toBeLessThanOrEqual(clickBox.y + clickBox.height);
    expect(events.at(-2)?.type).toBe('system.clockSync');
    expect(events.at(-1)?.type).toBe('system.recordingStop');
    const meta = JSON.parse(await readFile(metaItem.filename, 'utf8')) as Record<string, unknown>;
    expect(meta).toMatchObject({ schemaVersion: 1, privacy: { visualRedactionSelectors: ['.new-todo, .todo-list li'] },
      app: { commit: null, version: null, environment: null } });
    const redaction = events.find((event) => event.type === 'annotation.redaction' && event.visible === true);
    expect(redaction).toMatchObject({ selector: '.new-todo, .todo-list li', instanceId: expect.any(String), visible: true,
      box: { x: expect.any(Number), y: expect.any(Number), width: expect.any(Number), height: expect.any(Number) } });
    expect(redaction).not.toHaveProperty('target');
    expect(redaction).not.toHaveProperty('text');
    expect(redaction).not.toHaveProperty('value');
    const redactionSamples = events.filter((event) => event.type === 'annotation.redaction' && event.visible === true);
    expect(redactionSamples.length).toBeGreaterThan(1);
    const firstRedaction = events.find((event) => event.type === 'annotation.redaction');
    expect(firstRedaction?.visible).toBe(true);
    expect(firstRedaction?.t).toBe(0);
    expect(new Set(redactionSamples.map((event) => (event.box as { y: number }).y)).size).toBeGreaterThan(1);
    expect(events.some((event) => event.type === 'annotation.redaction' && event.visible === false)).toBe(true);
    expect(redactionSamples.some((left, index) => redactionSamples.slice(index + 1).some((right) =>
      JSON.stringify(left.box) === JSON.stringify(right.box) &&
      (left.viewport as { width: number }).width !== (right.viewport as { width: number }).width))).toBe(true);
    expect((await readFile(mediaItem.filename)).length).toBeGreaterThan(0);
    const probe = JSON.parse((await execute('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', mediaItem.filename])).stdout) as { streams: Array<{ width: number; height: number }> };
    expect(meta.capture).toMatchObject(probe.streams[0] ?? {});
  } finally {
    await context.close();
  }
});
