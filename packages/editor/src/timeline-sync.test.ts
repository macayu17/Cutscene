import { afterEach, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { connectTimelineSync, parseTimelineOwnerUrl } from './timeline-sync';
import { createTimelineDocument, type TimelineState } from './timeline-document';

afterEach(() => vi.useRealTimers());

const empty: TimelineState = { segments: [], callouts: [], redactions: [] };
const segment = {
  id: 'zoom_1', eventId: 'event_1', startMs: 1_000, clickMs: 1_400, endMs: 2_200,
  focus: { x: 100, y: 120, width: 400, height: 240 }, scale: 1.8,
  viewport: { width: 1280, height: 800 },
};

it('parses only a token-bearing owner review URL', () => {
  expect(parseTimelineOwnerUrl('https://share.example/r/123#token=secret')).toEqual({
    ok: true, value: { base: 'https://share.example', id: '123', token: 'secret' },
  });
  expect(parseTimelineOwnerUrl('https://share.example/r/123')).toEqual({
    ok: false, error: 'Owner review URL is missing its token.',
  });
});

it('seeds, uploads local edits, merges remote edits, and does not echo them', async () => {
  const server = new Y.Doc();
  let posts = 0;
  const request = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posts += 1;
      Y.applyUpdate(server, new Uint8Array(await new Response(init.body).arrayBuffer()));
      return new Response(JSON.stringify({ changed: true, version: posts }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    const encoded = Y.encodeStateAsUpdate(server);
    const responseBody = new ArrayBuffer(encoded.byteLength);
    new Uint8Array(responseBody).set(encoded);
    return new Response(responseBody, {
      status: 200, headers: { 'content-type': 'application/octet-stream' },
    });
  });
  const timeline = createTimelineDocument();
  const statuses: string[] = [];
  const connected = await connectTimelineSync('https://share.example/r/123#token=secret', timeline,
    (status) => statuses.push(status.state), { request, pollMs: 0, seed: { ...empty, segments: [segment] } });
  expect(connected.ok).toBe(true);
  if (!connected.ok) return;
  expect(posts).toBe(1);
  expect(statuses.at(-1)).toBe('synced');

  timeline.upsert({ kind: 'callout', order: 0, value: {
    id: 'callout_1', sourceEventId: 'event_1', anchor: { stepId: 'step_1', locators: [] },
    text: 'Export PDF', placement: 'auto',
  } });
  await connected.value.flush();
  expect(posts).toBe(2);

  const remote = createTimelineDocument();
  remote.applyRemote(Y.encodeStateAsUpdate(server));
  remote.upsert({ kind: 'redaction', order: 0, value: { selector: '.secret', enabled: true } });
  Y.applyUpdate(server, remote.encode());
  await connected.value.syncNow();
  await connected.value.flush();
  expect(timeline.read()).toMatchObject({
    segments: [segment], callouts: [{ id: 'callout_1' }], redactions: [{ selector: '.secret', enabled: true }],
  });
  expect(posts).toBe(2);

  const secondTimeline = createTimelineDocument();
  const secondConnection = await connectTimelineSync('https://share.example/r/123#token=secret', secondTimeline,
    () => undefined, { request, pollMs: 0, seed: { ...empty, segments: [segment] } });
  expect(secondConnection.ok).toBe(true);
  expect(secondTimeline.read().segments).toEqual([segment]);
  expect(posts).toBe(2);

  connected.value.stop();
  if (secondConnection.ok) secondConnection.value.stop();
  timeline.destroy();
  secondTimeline.destroy();
  remote.destroy();
  server.destroy();
});

it('converges edits from two connected timelines', async () => {
  const server = new Y.Doc();
  const request = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST') {
      Y.applyUpdate(server, new Uint8Array(await new Response(init.body).arrayBuffer()));
      return new Response('{}', { status: 200 });
    }
    const update = Y.encodeStateAsUpdate(server);
    return new Response(update.slice().buffer, { status: 200 });
  });
  const initial = { ...empty, segments: [segment], redactions: [{ selector: '.secret', enabled: true }] };
  const left = createTimelineDocument();
  const right = createTimelineDocument();
  const leftConnection = await connectTimelineSync('https://share.example/r/123#token=secret', left,
    () => undefined, { request, pollMs: 0, seed: initial });
  const rightConnection = await connectTimelineSync('https://share.example/r/123#token=secret', right,
    () => undefined, { request, pollMs: 0, seed: initial });
  expect(leftConnection.ok && rightConnection.ok).toBe(true);
  if (!leftConnection.ok || !rightConnection.ok) return;

  left.upsert({ kind: 'zoom', order: 1, value: { ...segment, id: 'zoom_2' } });
  right.upsert({ kind: 'redaction', order: 0, value: { selector: '.secret', enabled: false } });
  await Promise.all([leftConnection.value.flush(), rightConnection.value.flush()]);
  await Promise.all([leftConnection.value.syncNow(), rightConnection.value.syncNow()]);

  expect(left.read()).toMatchObject({ segments: [{ id: 'zoom_1' }, { id: 'zoom_2' }],
    redactions: [{ selector: '.secret', enabled: false }] });
  expect(right.read()).toEqual(left.read());
  leftConnection.value.stop();
  rightConnection.value.stop();
  left.destroy();
  right.destroy();
  server.destroy();
});
