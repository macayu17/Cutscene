import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test } from '@playwright/test';

type CreatedRecording = { id: string; ownerToken: string; invitationToken: string };

const auth = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` });
const envelope = (id: string, t: number, type: string, stepId: string) => ({
  v: 1, id, t, type, stepId, route: '/reports',
  viewport: { width: 1280, height: 800, dpr: 1 }, scroll: { x: 0, y: 0 },
});

function recordingTrace(eventId: string, stepId: string, eventTime: number): string {
  return [
    { ...envelope(`clock_${eventId}_1`, 0, 'system.clockSync', 'step_0'),
      contentClockMs: 0, workerClockMs: 0, mediaTimeMs: 0 },
    { ...envelope(eventId, eventTime, 'interaction.click', stepId), target: {
      role: 'button', accessibleName: 'Export PDF', text: 'Export PDF', tagName: 'BUTTON',
      boundingBox: { x: 400, y: 300, width: 120, height: 40 },
      locators: [{ type: 'testId', value: 'export-pdf', confidence: 1 }],
    } },
    { ...envelope(`clock_${eventId}_2`, 9_000, 'system.clockSync', stepId),
      contentClockMs: 9_000, workerClockMs: 9_000, mediaTimeMs: 9_000 },
  ].map((event) => JSON.stringify(event)).join('\n');
}

const meta = JSON.stringify({
  schemaVersion: 1, recordingId: 'rec_review_e2e', createdAt: '2026-07-16T10:00:00.000Z', sessionEpoch: 1,
  url: 'https://app.example.com/reports', origin: 'https://app.example.com',
  viewport: { width: 1280, height: 800, dpr: 1 }, capture: { width: 1920, height: 1080, fps: 30 },
  media: { mimeType: 'video/webm', hasAudio: false, durationMs: 9_000 },
  privacy: { maskInputValues: true, captureNetwork: false, maskedSelectors: [] },
  app: { commit: null, version: null, environment: null },
});

async function freePort(): Promise<number> {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const address = probe.address();
  if (!address || typeof address === 'string') throw new Error('port probe did not bind to TCP');
  await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function waitForServer(base: string, process: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (process.exitCode !== null) throw new Error(`review server exited with code ${process.exitCode}`);
    try { await fetch(base); return; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  throw new Error('review server did not start');
}

test('two team members preserve a semantic comment through a re-edit and approve', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cutscene-review-e2e-'));
  const port = await freePort();
  const server = spawn(process.execPath, ['../server/src/index.ts'], {
    cwd: process.cwd(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(port), CUTSCENE_DATA: root },
  });
  const base = `http://127.0.0.1:${port}`;
  await waitForServer(base, server);
  const browser = await chromium.launch({ headless: true });
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const reviewerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ownerErrors: string[] = [];
  const reviewerErrors: string[] = [];

  try {
    const mediaPage = await ownerContext.newPage();
    const media = Buffer.from(await mediaPage.evaluate(async () => {
      const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('canvas unavailable');
      context.fillStyle = '#16181C'; context.fillRect(0, 0, canvas.width, canvas.height);
      const stream = canvas.captureStream(5);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
      const chunks: Blob[] = [];
      recorder.addEventListener('dataavailable', (event) => chunks.push(event.data));
      const stopped = new Promise<void>((resolve) => recorder.addEventListener('stop', () => resolve(), { once: true }));
      recorder.start(); await new Promise((resolve) => setTimeout(resolve, 300)); recorder.stop(); await stopped;
      return Array.from(new Uint8Array(await new Blob(chunks, { type: recorder.mimeType }).arrayBuffer()));
    }));
    await mediaPage.close();

    const createdResponse = await fetch(`${base}/api/recordings`, { method: 'POST' });
    const created = await createdResponse.json() as CreatedRecording;
    for (const [name, body] of [['media.webm', media], ['trace.jsonl', recordingTrace('export_v1', 'step_3', 4_200)],
      ['meta.json', meta]] as const) {
      expect((await fetch(`${base}/api/recordings/${created.id}/${name}`, {
        method: 'PUT', headers: auth(created.ownerToken), body,
      })).status).toBe(200);
    }

    const owner = await ownerContext.newPage();
    const reviewer = await reviewerContext.newPage();
    owner.on('pageerror', (error) => ownerErrors.push(error.message));
    reviewer.on('pageerror', (error) => reviewerErrors.push(error.message));
    await owner.goto(`${base}/r/${created.id}#token=${created.ownerToken}`);
    await owner.getByLabel('Invite role').selectOption('editor');
    await owner.getByLabel('Access').selectOption('team');
    await owner.getByRole('button', { name: 'Create invitation' }).click();
    const invitationUrl = await owner.getByLabel('Invitation link').inputValue();
    expect(invitationUrl).toContain('#invite=');
    await reviewer.goto(invitationUrl);

    await reviewer.getByLabel('Display name').fill('Reviewer');
    await reviewer.getByRole('button', { name: 'Join review' }).click();
    await reviewer.getByRole('button', { name: /Export PDF/ }).click();
    await reviewer.getByLabel('Comment on selected event').fill('Mention PDF export.');
    await reviewer.getByRole('button', { name: 'Add comment' }).click();

    await expect(owner.locator('#comment-list')).toContainText('Mention PDF export.');
    await expect(owner.locator('#presence')).toContainText('Reviewer');
    expect((await fetch(`${base}/api/recordings/${created.id}/trace.jsonl`, {
      method: 'PUT', headers: auth(created.ownerToken), body: recordingTrace('export_v2', 'step_8', 7_100),
    })).status).toBe(200);

    await expect(owner.locator('#comment-list')).toContainText('matched · 7.1s');
    await expect(reviewer.locator('#comment-list')).toContainText('matched · 7.1s');
    await owner.getByRole('button', { name: 'Request review' }).click();
    await reviewer.getByRole('button', { name: 'Approve' }).click();
    await expect(owner.locator('#review-state')).toHaveText('approved');
    await expect(reviewer.locator('#review-state')).toHaveText('approved');

    const reviewResponse = await fetch(`${base}/api/recordings/${created.id}/review`, {
      headers: auth(created.ownerToken),
    });
    const review = await reviewResponse.json() as {
      state: string;
      members: Array<{ id: string; name: string; role: string; scope: string }>;
      comments: Array<{ event: { anchor: { mediaTimeMs: number } }; resolution: { status: string } }>;
    };
    expect(review.members.map(({ id }) => id).filter((id, index, ids) => ids.indexOf(id) === index)).toHaveLength(2);
    expect(review.members).toContainEqual(expect.objectContaining({
      name: 'Reviewer', role: 'editor', scope: 'team',
    }));
    expect(review).toMatchObject({
      state: 'approved',
      comments: [{ event: { anchor: { mediaTimeMs: 7_100 } }, resolution: { status: 'matched' } }],
    });
    expect(ownerErrors).toEqual([]);
    expect(reviewerErrors).toEqual([]);
  } finally {
    await ownerContext.close();
    await reviewerContext.close();
    await browser.close();
    server.kill();
    if (server.exitCode === null) await once(server, 'exit');
    await rm(root, { recursive: true, force: true });
  }
});
