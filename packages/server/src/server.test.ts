import { afterEach, expect, it } from 'vitest';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handle } from './server.ts';

const servers: Server[] = [];
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve()))));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function startServer(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cutscene-server-http-'));
  roots.push(root);
  const server = createServer((req, res) => { void handle(req, res, root); });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test server did not bind to TCP');
  return `http://127.0.0.1:${address.port}`;
}

type CreatedRecording = { id: string; ownerToken: string; invitationToken: string };

async function createRecording(base: string): Promise<CreatedRecording> {
  const response = await fetch(`${base}/api/recordings`, { method: 'POST' });
  expect(response.status).toBe(201);
  return await response.json() as CreatedRecording;
}

const auth = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` });

const envelope = (id: string, t: number, type: string, stepId: string) => ({
  v: 1, id, t, type, stepId, route: '/reports',
  viewport: { width: 1280, height: 800, dpr: 1 }, scroll: { x: 0, y: 0 },
});

const trace = [
  { ...envelope('clock_1', 0, 'system.clockSync', 'step_0'), contentClockMs: 0, workerClockMs: 0, mediaTimeMs: 0 },
  { ...envelope('click_export', 4_200, 'interaction.click', 'step_3'), target: {
    role: 'button', accessibleName: 'Export PDF', text: 'Export PDF', tagName: 'BUTTON',
    boundingBox: { x: 400, y: 300, width: 120, height: 40 },
    locators: [{ type: 'testId', value: 'export-pdf', confidence: 1 }],
  } },
  { ...envelope('clock_2', 8_000, 'system.clockSync', 'step_3'), contentClockMs: 8_000,
    workerClockMs: 8_000, mediaTimeMs: 8_000 },
].map((event) => JSON.stringify(event)).join('\n');

const meta = JSON.stringify({
  schemaVersion: 1, recordingId: 'rec_review', createdAt: '2026-07-16T10:00:00.000Z', sessionEpoch: 1,
  url: 'https://app.example.com/reports', origin: 'https://app.example.com',
  viewport: { width: 1280, height: 800, dpr: 1 }, capture: { width: 1920, height: 1080, fps: 30 },
  media: { mimeType: 'video/webm', hasAudio: false, durationMs: 8_000 },
  privacy: { maskInputValues: true, captureNetwork: false, maskedSelectors: [] },
  app: { commit: null, version: null, environment: null },
});

async function uploadBundle(base: string, created: CreatedRecording): Promise<void> {
  for (const [name, body] of [['media.webm', new Uint8Array([1, 2, 3])], ['trace.jsonl', trace], ['meta.json', meta]] as const) {
    const response = await fetch(`${base}/api/recordings/${created.id}/${name}`, {
      method: 'PUT', headers: auth(created.ownerToken), body,
    });
    expect(response.status).toBe(200);
  }
}

async function joinReviewer(base: string, created: CreatedRecording): Promise<{ memberId: string; memberToken: string }> {
  const response = await fetch(`${base}/api/recordings/${created.id}/join`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ invitationToken: created.invitationToken, name: 'Reviewer' }),
  });
  expect(response.status).toBe(201);
  return await response.json() as { memberId: string; memberToken: string };
}

it('permits editor POST and PUT requests across origins', async () => {
  const base = await startServer();
  const preflight = await fetch(`${base}/api/recordings`, {
    method: 'OPTIONS',
    headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'POST' },
  });

  expect(preflight.status).toBe(204);
  expect(preflight.headers.get('access-control-allow-origin')).toBe('*');
  expect(preflight.headers.get('access-control-allow-methods')).toContain('POST');
  expect(preflight.headers.get('access-control-allow-methods')).toContain('PUT');
  expect(preflight.headers.get('access-control-allow-headers')).toContain('authorization');

  const create = await fetch(`${base}/api/recordings`, {
    method: 'POST', headers: { origin: 'http://localhost:5173' },
  });
  expect(create.status).toBe(201);
  expect(create.headers.get('access-control-allow-origin')).toBe('*');
});

it('requires a member token for bundle mutation and exchanges an invitation once', async () => {
  const base = await startServer();
  const created = await createRecording(base);
  expect(created.ownerToken).not.toBe(created.invitationToken);

  expect((await fetch(`${base}/api/recordings/${created.id}/media.webm`, {
    method: 'PUT', body: new Uint8Array([1]),
  })).status).toBe(401);
  expect((await fetch(`${base}/api/recordings/${created.id}/media.webm`, {
    method: 'PUT', headers: auth(created.ownerToken), body: new Uint8Array([1]),
  })).status).toBe(200);

  const reviewer = await joinReviewer(base, created);
  expect(reviewer.memberId).toBeTruthy();
  expect(reviewer.memberToken).not.toBe(created.ownerToken);
  expect((await fetch(`${base}/api/recordings/${created.id}/join`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ invitationToken: created.invitationToken, name: 'Other' }),
  })).status).toBe(409);

  const view = await fetch(`${base}/api/recordings/${created.id}/review`, { headers: auth(reviewer.memberToken) });
  expect(view.status).toBe(200);
  const body = await view.json() as { members: unknown[] };
  expect(body.members).toHaveLength(2);
  expect(JSON.stringify(body)).not.toContain('tokenHash');
});

it('constructs semantic comments, retains concurrent writes, and enforces approval roles', async () => {
  const base = await startServer();
  const created = await createRecording(base);
  await uploadBundle(base, created);
  const reviewer = await joinReviewer(base, created);

  const eventsResponse = await fetch(`${base}/api/recordings/${created.id}/events`);
  expect(eventsResponse.status).toBe(200);
  const events = await eventsResponse.json() as Array<{ id: string; mediaTimeMs: number }>;
  expect(events).toContainEqual(expect.objectContaining({ id: 'click_export', mediaTimeMs: 4_200 }));

  const responses = await Promise.all(['Mention PDF export.', 'Check the label.'].map((body) =>
    fetch(`${base}/api/recordings/${created.id}/comments`, {
      method: 'POST', headers: { ...auth(reviewer.memberToken), 'content-type': 'application/json' },
      body: JSON.stringify({ eventId: 'click_export', body }),
    })));
  expect(responses.map(({ status }) => status)).toEqual([201, 201]);

  const reviewResponse = await fetch(`${base}/api/recordings/${created.id}/review`, { headers: auth(created.ownerToken) });
  const review = await reviewResponse.json() as {
    comments: Array<{ event: { anchor: { stepId: string; mediaTimeMs: number; locators: unknown[] } }; authorId: string }>;
  };
  expect(review.comments).toHaveLength(2);
  expect(review.comments[0]).toMatchObject({
    authorId: reviewer.memberId,
    event: { anchor: { stepId: 'step_3', mediaTimeMs: 4_200, locators: [{ type: 'testId', value: 'export-pdf' }] } },
  });

  expect((await fetch(`${base}/api/recordings/${created.id}/state`, {
    method: 'PUT', headers: { ...auth(reviewer.memberToken), 'content-type': 'application/json' },
    body: JSON.stringify({ state: 'approved' }),
  })).status).toBe(403);
  expect((await fetch(`${base}/api/recordings/${created.id}/state`, {
    method: 'PUT', headers: { ...auth(created.ownerToken), 'content-type': 'application/json' },
    body: JSON.stringify({ state: 'approved' }),
  })).status).toBe(200);
});

it('reports a soft-lock conflict while retaining both members presence', async () => {
  const base = await startServer();
  const created = await createRecording(base);
  const reviewer = await joinReviewer(base, created);
  const presence = (token: string) => fetch(`${base}/api/recordings/${created.id}/presence`, {
    method: 'PUT', headers: { ...auth(token), 'content-type': 'application/json' },
    body: JSON.stringify({ resource: 'timeline' }),
  });

  expect((await presence(created.ownerToken)).status).toBe(200);
  const conflict = await presence(reviewer.memberToken);
  expect(conflict.status).toBe(200);
  expect(await conflict.json()).toMatchObject({ conflictMemberId: expect.any(String) });
});

it('re-anchors an open comment when a replacement trace moves its event', async () => {
  const base = await startServer();
  const created = await createRecording(base);
  await uploadBundle(base, created);
  const reviewer = await joinReviewer(base, created);
  expect((await fetch(`${base}/api/recordings/${created.id}/comments`, {
    method: 'POST', headers: { ...auth(reviewer.memberToken), 'content-type': 'application/json' },
    body: JSON.stringify({ eventId: 'click_export', body: 'Mention PDF export.' }),
  })).status).toBe(201);

  const movedTrace = [
    { ...envelope('new_clock_1', 0, 'system.clockSync', 'step_0'), contentClockMs: 0, workerClockMs: 0, mediaTimeMs: 0 },
    { ...envelope('click_export_v2', 7_100, 'interaction.click', 'step_8'), target: {
      role: 'button', accessibleName: 'Export PDF', text: 'Export PDF', tagName: 'BUTTON',
      boundingBox: { x: 520, y: 340, width: 130, height: 40 },
      locators: [{ type: 'testId', value: 'export-pdf', confidence: 1 }],
    } },
    { ...envelope('new_clock_2', 9_000, 'system.clockSync', 'step_8'), contentClockMs: 9_000,
      workerClockMs: 9_000, mediaTimeMs: 9_000 },
  ].map((event) => JSON.stringify(event)).join('\n');
  const replaced = await fetch(`${base}/api/recordings/${created.id}/trace.jsonl`, {
    method: 'PUT', headers: auth(created.ownerToken), body: movedTrace,
  });
  expect(replaced.status).toBe(200);

  const reviewResponse = await fetch(`${base}/api/recordings/${created.id}/review`, { headers: auth(created.ownerToken) });
  const review = await reviewResponse.json() as { comments: Array<{
    event: { anchor: { stepId: string; mediaTimeMs: number } };
    resolution: { status: string; eventId: string; mediaTimeMs: number };
  }> };
  expect(review.comments[0]).toMatchObject({
    event: { anchor: { stepId: 'step_8', mediaTimeMs: 7_100 } },
    resolution: { status: 'matched', eventId: 'click_export_v2', mediaTimeMs: 7_100 },
  });

  expect((await fetch(`${base}/api/recordings/${created.id}/trace.jsonl`, {
    method: 'PUT', headers: auth(created.ownerToken), body: JSON.stringify({ v: 1 }),
  })).status).toBe(400);
  expect(await (await fetch(`${base}/api/recordings/${created.id}/trace.jsonl`)).text()).toBe(movedTrace);
});
