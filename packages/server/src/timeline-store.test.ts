import { afterEach, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Y from 'yjs';
import { ensureRecording } from './store.ts';
import { listTimelineVersions, mergeTimelineUpdate, readTimelineUpdate, readTimelineVersion } from './timeline-store.ts';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function recording(): Promise<{ root: string; id: string }> {
  const root = await mkdtemp(join(tmpdir(), 'cutscene-timeline-'));
  roots.push(root);
  const id = '12345678-1234-4123-8123-123456789abc';
  await ensureRecording(root, id);
  return { root, id };
}

function update(value: string): Uint8Array {
  const document = new Y.Doc();
  document.getArray<string>('timeline').push([value]);
  return Y.encodeStateAsUpdate(document);
}

function values(binary: Uint8Array): string[] {
  const document = new Y.Doc();
  Y.applyUpdate(document, binary);
  return document.getArray<string>('timeline').toArray();
}

it('writes changed state, lists metadata, and restores the numbered snapshot', async () => {
  const { root, id } = await recording();
  const merged = await mergeTimelineUpdate(root, id, 'member_1', update('zoom_1'), '2026-07-16T10:00:00.000Z');

  expect(merged).toEqual({ ok: true, value: { changed: true, version: 1 } });
  expect(values(await readTimelineUpdate(root, id))).toEqual(['zoom_1']);
  expect(await listTimelineVersions(root, id)).toEqual([{
    v: 1, version: 1, memberId: 'member_1', createdAt: '2026-07-16T10:00:00.000Z',
    bytes: expect.any(Number),
  }]);
  const snapshot = await readTimelineVersion(root, id, 1);
  expect(snapshot).not.toBeNull();
  if (snapshot) expect(values(snapshot)).toEqual(['zoom_1']);
});

it('merges concurrent updates and suppresses duplicate versions', async () => {
  const { root, id } = await recording();
  const left = update('callout_1');
  const right = update('redaction_1');

  const [first, second] = await Promise.all([
    mergeTimelineUpdate(root, id, 'left', left, '2026-07-16T10:00:01.000Z'),
    mergeTimelineUpdate(root, id, 'right', right, '2026-07-16T10:00:02.000Z'),
  ]);
  expect(first.ok && first.value.changed).toBe(true);
  expect(second.ok && second.value.changed).toBe(true);
  expect(values(await readTimelineUpdate(root, id)).sort()).toEqual(['callout_1', 'redaction_1']);

  expect(await mergeTimelineUpdate(root, id, 'right', right, '2026-07-16T10:00:03.000Z'))
    .toEqual({ ok: true, value: { changed: false, version: 2 } });
  expect(await listTimelineVersions(root, id)).toHaveLength(2);
});

it('rejects malformed updates without creating state or history', async () => {
  const { root, id } = await recording();

  expect(await mergeTimelineUpdate(root, id, 'member_1', Uint8Array.from([255, 1]), '2026-07-16T10:00:00.000Z'))
    .toEqual({ ok: false, error: 'timeline update is invalid' });
  expect(await listTimelineVersions(root, id)).toEqual([]);
  expect(values(await readTimelineUpdate(root, id))).toEqual([]);
});
