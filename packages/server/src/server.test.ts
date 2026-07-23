import { afterEach, expect, it } from 'vitest';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handle } from './server.ts';
import { sweepExpired } from './store.ts';
import * as Y from 'yjs';

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
type Invitation = { id: string; invitationToken: string; role: 'editor' | 'commenter' | 'viewer'; scope: 'team' | 'project' };

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

async function invite(base: string, created: CreatedRecording, role: Invitation['role'],
  scope: Invitation['scope']): Promise<Invitation> {
  const response = await fetch(`${base}/api/recordings/${created.id}/invitations`, {
    method: 'POST', headers: { ...auth(created.ownerToken), 'content-type': 'application/json' },
    body: JSON.stringify({ role, scope }),
  });
  expect(response.status).toBe(201);
  return await response.json() as Invitation;
}

async function joinMember(base: string, created: CreatedRecording, invitation: Invitation,
  name: string): Promise<{ memberId: string; memberToken: string }> {
  const response = await fetch(`${base}/api/recordings/${created.id}/join`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ invitationToken: invitation.invitationToken, name }),
  });
  expect(response.status).toBe(201);
  return await response.json() as { memberId: string; memberToken: string };
}

function timelineUpdate(value: string): Uint8Array {
  const document = new Y.Doc();
  document.getArray<string>('timeline').push([value]);
  const update = Y.encodeStateAsUpdate(document);
  document.destroy();
  return update;
}

async function timelineValues(response: Response): Promise<string[]> {
  const document = new Y.Doc();
  Y.applyUpdate(document, new Uint8Array(await response.arrayBuffer()));
  const values = document.getArray<string>('timeline').toArray();
  document.destroy();
  return values;
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

it('creates, exchanges, and revokes scoped role invitations', async () => {
  const base = await startServer();
  const created = await createRecording(base);
  await uploadBundle(base, created);
  const editorInvitation = await invite(base, created, 'editor', 'team');
  const commenterInvitation = await invite(base, created, 'commenter', 'project');
  const viewerInvitation = await invite(base, created, 'viewer', 'team');
  const editor = await joinMember(base, created, editorInvitation, 'Editor');
  const commenter = await joinMember(base, created, commenterInvitation, 'Commenter');
  const viewer = await joinMember(base, created, viewerInvitation, 'Viewer');

  const review = await (await fetch(`${base}/api/recordings/${created.id}/review`, {
    headers: auth(created.ownerToken),
  })).json() as { members: Array<{ name: string; role: string; scope: string }> };
  expect(review.members).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'Owner', role: 'owner', scope: 'team' }),
    expect.objectContaining({ name: 'Editor', role: 'editor', scope: 'team' }),
    expect.objectContaining({ name: 'Commenter', role: 'commenter', scope: 'project' }),
    expect.objectContaining({ name: 'Viewer', role: 'viewer', scope: 'team' }),
  ]));
  expect((await fetch(`${base}/api/recordings/${created.id}/timeline`, {
    method: 'POST', headers: auth(editor.memberToken), body: timelineUpdate('zoom_editor'),
  })).status).toBe(200);
  expect((await fetch(`${base}/api/recordings/${created.id}/state`, {
    method: 'PUT', headers: { ...auth(editor.memberToken), 'content-type': 'application/json' },
    body: JSON.stringify({ state: 'approved' }),
  })).status).toBe(200);
  expect((await fetch(`${base}/api/recordings/${created.id}/state`, {
    method: 'PUT', headers: { ...auth(commenter.memberToken), 'content-type': 'application/json' },
    body: JSON.stringify({ state: 'approved' }),
  })).status).toBe(403);
  expect((await fetch(`${base}/api/recordings/${created.id}/comments`, {
    method: 'POST', headers: { ...auth(viewer.memberToken), 'content-type': 'application/json' },
    body: JSON.stringify({ eventId: 'click_export', body: 'Not allowed' }),
  })).status).toBe(403);

  const revoked = await invite(base, created, 'viewer', 'project');
  expect((await fetch(`${base}/api/recordings/${created.id}/invitations/${revoked.id}`, {
    method: 'DELETE', headers: auth(created.ownerToken),
  })).status).toBe(200);
  expect((await fetch(`${base}/api/recordings/${created.id}/join`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ invitationToken: revoked.invitationToken, name: 'Revoked' }),
  })).status).toBe(409);
  expect((await fetch(`${base}/api/recordings/${created.id}/invitations`, {
    method: 'POST', headers: { ...auth(commenter.memberToken), 'content-type': 'application/json' },
    body: JSON.stringify({ role: 'viewer', scope: 'project' }),
  })).status).toBe(403);
  expect((await fetch(`${base}/api/recordings/${created.id}/invitations`, {
    method: 'POST', headers: { ...auth(created.ownerToken), 'content-type': 'application/json' },
    body: JSON.stringify({ role: 'owner', scope: 'team' }),
  })).status).toBe(400);
});

it('shares a validated brand kit while restricting writes to editors', async () => {
  const base = await startServer();
  const created = await createRecording(base);
  const editor = await joinMember(base, created, await invite(base, created, 'editor', 'team'), 'Editor');
  const viewer = await joinMember(base, created, await invite(base, created, 'viewer', 'project'), 'Viewer');
  const url = `${base}/api/recordings/${created.id}/brand-kit`;
  const brandPresets = [{
    id: 'brand_1', name: 'Launch', color: '#336699', font: 'mono',
    intro: 'Start', outro: 'End', watermark: 'ACME',
  }];

  expect((await fetch(url, {
    method: 'PUT', headers: { ...auth(editor.memberToken), 'content-type': 'application/json' },
    body: JSON.stringify({ brandPresets }),
  })).status).toBe(200);
  const loaded = await fetch(url, { headers: auth(viewer.memberToken) });
  expect(loaded.status).toBe(200);
  expect(await loaded.json()).toEqual({ brandPresets });
  expect((await fetch(url, {
    method: 'PUT', headers: { ...auth(viewer.memberToken), 'content-type': 'application/json' },
    body: JSON.stringify({ brandPresets: [] }),
  })).status).toBe(403);
  expect((await fetch(url, {
    method: 'PUT', headers: { ...auth(created.ownerToken), 'content-type': 'application/json' },
    body: JSON.stringify({ brandPresets: [{ ...brandPresets[0], color: 'blue' }] }),
  })).status).toBe(400);
  expect(await (await fetch(url, { headers: auth(created.ownerToken) })).json()).toEqual({ brandPresets });
});

it('constructs semantic comments, retains concurrent writes, and enforces approval roles', async () => {
  const base = await startServer();
  const created = await createRecording(base);
  await uploadBundle(base, created);
  const reviewer = await joinReviewer(base, created);

  const eventsResponse = await fetch(`${base}/api/recordings/${created.id}/events`);
  expect(eventsResponse.status).toBe(200);
  const eventPayload = await eventsResponse.json() as {
    capture: { width: number; height: number };
    events: Array<{ id: string; mediaTimeMs: number; box: { x: number; y: number; width: number; height: number } }>;
  };
  expect(eventPayload.capture).toEqual({ width: 1920, height: 1080 });
  const events = eventPayload.events;
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

it('merges authenticated timeline updates and serves snapshot history', async () => {
  const base = await startServer();
  const created = await createRecording(base);
  const reviewer = await joinReviewer(base, created);
  const url = `${base}/api/recordings/${created.id}/timeline`;
  const first = timelineUpdate('zoom_1');

  expect((await fetch(url, { method: 'POST', body: first })).status).toBe(401);
  expect((await fetch(url, { method: 'POST', headers: auth(reviewer.memberToken), body: first })).status).toBe(403);
  const firstMerge = await fetch(url, { method: 'POST', headers: auth(created.ownerToken), body: first });
  expect(firstMerge.status).toBe(200);
  expect(await firstMerge.json()).toEqual({ changed: true, version: 1 });

  const duplicate = await fetch(url, { method: 'POST', headers: auth(created.ownerToken), body: first });
  expect(await duplicate.json()).toEqual({ changed: false, version: 1 });
  const second = timelineUpdate('callout_1');
  expect(await (await fetch(url, { method: 'POST', headers: auth(created.ownerToken), body: second })).json())
    .toEqual({ changed: true, version: 2 });

  const current = await fetch(url, { headers: auth(created.ownerToken) });
  expect(current.headers.get('content-type')).toBe('application/octet-stream');
  expect((await timelineValues(current)).sort()).toEqual(['callout_1', 'zoom_1']);
  const versions = await fetch(`${base}/api/recordings/${created.id}/versions`, { headers: auth(created.ownerToken) });
  expect((await versions.json()) as unknown[]).toHaveLength(2);
  const versionOne = await fetch(`${base}/api/recordings/${created.id}/versions/1`, { headers: auth(created.ownerToken) });
  expect(await timelineValues(versionOne)).toEqual(['zoom_1']);
  expect((await fetch(`${base}/api/recordings/${created.id}/versions/99`, { headers: auth(created.ownerToken) })).status)
    .toBe(404);
  expect((await fetch(url, { method: 'POST', headers: auth(created.ownerToken), body: Uint8Array.from([255, 1]) })).status)
    .toBe(400);
});

it('reports retention, lets only the owner delete, and stops serving an expired recording', async () => {
  const base = await startServer();
  const created = await createRecording(base);
  const root = roots[roots.length - 1]!;

  const status = await fetch(`${base}/api/recordings/${created.id}`);
  expect(status.status).toBe(200);
  const body = await status.json() as { expiresAt: string; ready: boolean };
  expect(body.ready).toBe(false);
  expect(Date.parse(body.expiresAt)).toBeGreaterThan(Date.now());

  expect((await fetch(`${base}/api/recordings/${created.id}`, { method: 'DELETE' })).status).toBe(401);
  const joined = await fetch(`${base}/api/recordings/${created.id}/join`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ invitationToken: created.invitationToken, name: 'Viewer' }),
  });
  expect(joined.status).toBe(201);
  const guest = await joined.json() as { memberToken: string };
  expect((await fetch(`${base}/api/recordings/${created.id}`,
    { method: 'DELETE', headers: auth(guest.memberToken) })).status).toBe(403);

  // A recording past its retention date is gone before the sweep has run.
  await writeFile(join(root, created.id, 'expires'), '2020-01-01T00:00:00.000Z\n');
  expect((await fetch(`${base}/api/recordings/${created.id}`)).status).toBe(404);
  expect((await fetch(`${base}/r/${created.id}`)).status).toBe(404);
  expect(await sweepExpired(root)).toEqual([created.id]);

  const other = await createRecording(base);
  expect((await fetch(`${base}/api/recordings/${other.id}`,
    { method: 'DELETE', headers: auth(other.ownerToken) })).status).toBe(200);
  expect((await fetch(`${base}/api/recordings/${other.id}`)).status).toBe(404);
});

it('accepts an abuse report and rejects an empty reason', async () => {
  const base = await startServer();
  const created = await createRecording(base);
  const reported = await fetch(`${base}/api/recordings/${created.id}/report`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'hosts malware' }),
  });
  expect(reported.status).toBe(202);
  const empty = await fetch(`${base}/api/recordings/${created.id}/report`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: '   ' }),
  });
  expect(empty.status).toBe(400);
});

it('lets a configured operator token take down any recording', async () => {
  process.env.CUTSCENE_ADMIN_TOKEN = 'operator-secret';
  try {
    const base = await startServer();
    const created = await createRecording(base);
    // A stranger and a wrong token are both refused.
    expect((await fetch(`${base}/api/recordings/${created.id}`, { method: 'DELETE' })).status).toBe(401);
    expect((await fetch(`${base}/api/recordings/${created.id}`,
      { method: 'DELETE', headers: auth('not-the-operator') })).status).toBe(401);
    // The operator token deletes regardless of ownership.
    expect((await fetch(`${base}/api/recordings/${created.id}`,
      { method: 'DELETE', headers: auth('operator-secret') })).status).toBe(200);
    expect((await fetch(`${base}/api/recordings/${created.id}`)).status).toBe(404);
  } finally {
    delete process.env.CUTSCENE_ADMIN_TOKEN;
  }
});
