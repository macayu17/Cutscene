import { expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createId, ensureRecording, isBundleFile, isValidId, recordingReady, saveBundleFile,
  readReview, updateReview, validateBundleFile, writeReview } from './store.ts';
import { createReviewDocument } from './review.ts';

const meta = {
  schemaVersion: 1, recordingId: 'rec_1', createdAt: '2026-07-16T09:00:00.000Z', sessionEpoch: 1,
  url: 'https://app.example.com/x', origin: 'https://app.example.com',
  viewport: { width: 1440, height: 900, dpr: 2 }, capture: { width: 2880, height: 1800, fps: 30 },
  media: { mimeType: 'video/webm', hasAudio: false, durationMs: 1000 },
  privacy: { maskInputValues: true, captureNetwork: false, maskedSelectors: [] },
  app: { commit: null, version: null, environment: null },
};
const buf = (value: unknown) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));

it('accepts only real UUID ids and rejects traversal', () => {
  expect(isValidId(createId())).toBe(true);
  expect(isValidId('../etc')).toBe(false);
  expect(isValidId('9837ddbe-884a-4dcc-a3ae-ffa17137382c')).toBe(true);
  expect(isValidId('9837ddbe/884a')).toBe(false);
});

it('allowlists exactly the three bundle files', () => {
  expect(isBundleFile('media.webm')).toBe(true);
  expect(isBundleFile('meta.json')).toBe(true);
  expect(isBundleFile('trace.jsonl')).toBe(true);
  expect(isBundleFile('../../secret')).toBe(false);
  expect(isBundleFile('index.html')).toBe(false);
});

it('rejects meta that is not JSON or not schemaVersion 1', () => {
  expect(validateBundleFile('meta.json', buf(meta)).ok).toBe(true);
  expect(validateBundleFile('meta.json', buf('{not json')).ok).toBe(false);
  expect(validateBundleFile('meta.json', buf({ ...meta, schemaVersion: 2 })).ok).toBe(false);
});

it('rejects a non-JSON trace line and reports which one', () => {
  const good = `${JSON.stringify({ v: 1, type: 'navigation' })}\n`;
  expect(validateBundleFile('trace.jsonl', buf(good)).ok).toBe(true);
  const bad = validateBundleFile('trace.jsonl', buf(`${good}{oops`));
  expect(bad.ok).toBe(false);
  expect(bad.ok === false && bad.error).toContain('line 2');
});

it('treats media bytes as opaque', () => {
  expect(validateBundleFile('media.webm', Buffer.from([0x1a, 0x45, 0xdf, 0xa3])).ok).toBe(true);
  expect(validateBundleFile('media.webm', Buffer.alloc(0))).toEqual({ ok: false, error: 'media.webm is empty' });
});

it('publishes only a complete recording bundle', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cutscene-server-'));
  const id = createId();
  try {
    await ensureRecording(root, id);
    expect(await recordingReady(root, id)).toBe(false);
    await saveBundleFile(root, id, 'media.webm', Buffer.from([1]));
    await saveBundleFile(root, id, 'trace.jsonl', buf('{}\n'));
    expect(await recordingReady(root, id)).toBe(false);
    await saveBundleFile(root, id, 'meta.json', buf(meta));
    expect(await recordingReady(root, id)).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('serialises review updates without dropping concurrent changes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cutscene-server-review-'));
  const id = createId();
  const review = createReviewDocument({
    teamId: 'team_1', ownerId: 'owner', ownerName: 'Owner', ownerToken: 'owner-secret',
    invitationId: 'invite_1', invitationToken: 'invite-secret', now: '2026-07-16T10:00:00.000Z',
  });
  try {
    await ensureRecording(root, id);
    await writeReview(root, id, review);
    await Promise.all(['first', 'second'].map((resource) => updateReview(root, id, (current) => ({
      ...current,
      presence: [...current.presence, { memberId: resource, resource, expiresAt: '2026-07-16T10:01:00.000Z' }],
    }))));

    expect((await readReview(root, id))?.presence.map(({ resource }) => resource).sort())
      .toEqual(['first', 'second']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
