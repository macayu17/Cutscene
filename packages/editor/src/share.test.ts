import { afterEach, expect, it, vi } from 'vitest';
import { createShareLink, updateSharedRecording } from './share';

afterEach(() => vi.unstubAllGlobals());

const files = {
  media: new File(['video'], 'media.webm'),
  trace: new File(['{}\n'], 'trace.jsonl'),
  meta: new File(['{"schemaVersion":1}'], 'meta.json'),
};

it('creates a recording and uploads the original bundle files', async () => {
  const id = '12345678-1234-4123-8123-123456789abc';
  const ownerToken = 'owner-secret';
  const invitationToken = 'invite-secret';
  const request = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ id, ownerToken, invitationToken }), { status: 201 }))
    .mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal('fetch', request);

  await expect(createShareLink('https://share.example/', files)).resolves.toEqual({
    ok: true, value: {
      id,
      publicUrl: `https://share.example/r/${id}`,
      reviewerUrl: `https://share.example/r/${id}#invite=invite-secret`,
      ownerUrl: `https://share.example/r/${id}#token=owner-secret`,
    },
  });
  expect(request).toHaveBeenNthCalledWith(1, 'https://share.example/api/recordings', { method: 'POST' });
  expect(request).toHaveBeenNthCalledWith(2, `https://share.example/api/recordings/${id}/media.webm`,
    { method: 'PUT', headers: { authorization: 'Bearer owner-secret' }, body: files.media });
  expect(request).toHaveBeenNthCalledWith(3, `https://share.example/api/recordings/${id}/trace.jsonl`,
    { method: 'PUT', headers: { authorization: 'Bearer owner-secret' }, body: files.trace });
  expect(request).toHaveBeenNthCalledWith(4, `https://share.example/api/recordings/${id}/meta.json`,
    { method: 'PUT', headers: { authorization: 'Bearer owner-secret' }, body: files.meta });
});

it('stops at the failed bundle upload', async () => {
  const id = '12345678-1234-4123-8123-123456789abc';
  const request = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ id, ownerToken: 'owner', invitationToken: 'invite' }), { status: 201 }))
    .mockResolvedValueOnce(new Response(null, { status: 200 }))
    .mockResolvedValueOnce(new Response(null, { status: 400 }));
  vi.stubGlobal('fetch', request);

  await expect(createShareLink('https://share.example', files)).resolves.toEqual({
    ok: false, error: 'Upload trace.jsonl failed (400).',
  });
  expect(request).toHaveBeenCalledTimes(3);
});

it('updates an existing recording from its owner review URL and validates the fragment', async () => {
  const id = '12345678-1234-4123-8123-123456789abc';
  const request = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal('fetch', request);

  await expect(updateSharedRecording(`https://share.example/r/${id}#token=owner-secret`, files)).resolves.toEqual({
    ok: true, value: `https://share.example/r/${id}#token=owner-secret`,
  });
  expect(request).toHaveBeenNthCalledWith(1, `https://share.example/api/recordings/${id}/trace.jsonl`,
    { method: 'PUT', headers: { authorization: 'Bearer owner-secret' }, body: files.trace });
  expect(request).toHaveBeenCalledTimes(3);
  await expect(updateSharedRecording(`https://share.example/r/${id}`, files)).resolves.toEqual({
    ok: false, error: 'Owner review URL is missing its token.',
  });
});
