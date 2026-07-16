import { afterEach, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { createEditorStore } from './store';
import { createTimelineDocument } from './timeline-document';

afterEach(() => vi.unstubAllGlobals());

const segment = {
  id: 'zoom_1', eventId: 'event_1', startMs: 1_000, clickMs: 1_400, endMs: 2_200,
  focus: { x: 100, y: 120, width: 400, height: 240 }, scale: 1.8,
  viewport: { width: 1280, height: 800 },
};

it('binds local editor actions and remote timeline updates without replacing the store', async () => {
  const server = new Y.Doc();
  const request = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST') {
      Y.applyUpdate(server, new Uint8Array(await new Response(init.body).arrayBuffer()));
      return new Response(JSON.stringify({ changed: true, version: 1 }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    const update = Y.encodeStateAsUpdate(server);
    const body = new ArrayBuffer(update.byteLength);
    new Uint8Array(body).set(update);
    return new Response(body, { status: 200, headers: { 'content-type': 'application/octet-stream' } });
  });
  vi.stubGlobal('fetch', request);
  const store = createEditorStore();
  store.setState({ segments: [segment], callouts: [], redactions: [], selectedSegmentId: 'zoom_1' });

  await store.getState().connectSharedTimeline('https://share.example/r/123#token=secret');
  store.getState().retimeSegment(900, 2_800);
  await store.getState().timelineConnection?.flush();
  const serverView = createTimelineDocument();
  serverView.applyRemote(Y.encodeStateAsUpdate(server));
  expect(serverView.read().segments[0]).toMatchObject({ startMs: 900, endMs: 2_800 });

  const remote = createTimelineDocument();
  remote.applyRemote(Y.encodeStateAsUpdate(server));
  remote.upsert({ kind: 'redaction', order: 0, value: { selector: '.secret', enabled: true } });
  Y.applyUpdate(server, remote.encode());
  await store.getState().timelineConnection?.syncNow();
  expect(store.getState().redactions).toEqual([{ selector: '.secret', enabled: true }]);
  expect(store.getState().timelineSyncStatus).toEqual({ state: 'synced' });

  store.getState().disconnectSharedTimeline();
  expect(store.getState().timelineSyncStatus).toEqual({ state: 'idle' });
  serverView.destroy();
  remote.destroy();
  server.destroy();
});
