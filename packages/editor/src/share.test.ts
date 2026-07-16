import { afterEach, expect, it, vi } from 'vitest';
import { createShareLink } from './share';

afterEach(() => vi.unstubAllGlobals());

const files = {
  media: new File(['video'], 'media.webm'),
  trace: new File(['{}\n'], 'trace.jsonl'),
  meta: new File(['{"schemaVersion":1}'], 'meta.json'),
};

it('creates a recording and uploads the original bundle files', async () => {
  const id = '12345678-1234-4123-8123-123456789abc';
  const request = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ id }), { status: 201 }))
    .mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal('fetch', request);

  await expect(createShareLink('https://share.example/', files)).resolves.toEqual({
    ok: true, value: `https://share.example/r/${id}`,
  });
  expect(request).toHaveBeenNthCalledWith(1, 'https://share.example/api/recordings', { method: 'POST' });
  expect(request).toHaveBeenNthCalledWith(2, `https://share.example/api/recordings/${id}/media.webm`,
    { method: 'PUT', body: files.media });
  expect(request).toHaveBeenNthCalledWith(3, `https://share.example/api/recordings/${id}/trace.jsonl`,
    { method: 'PUT', body: files.trace });
  expect(request).toHaveBeenNthCalledWith(4, `https://share.example/api/recordings/${id}/meta.json`,
    { method: 'PUT', body: files.meta });
});

it('stops at the failed bundle upload', async () => {
  const id = '12345678-1234-4123-8123-123456789abc';
  const request = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ id }), { status: 201 }))
    .mockResolvedValueOnce(new Response(null, { status: 200 }))
    .mockResolvedValueOnce(new Response(null, { status: 400 }));
  vi.stubGlobal('fetch', request);

  await expect(createShareLink('https://share.example', files)).resolves.toEqual({
    ok: false, error: 'Upload trace.jsonl failed (400).',
  });
  expect(request).toHaveBeenCalledTimes(3);
});
