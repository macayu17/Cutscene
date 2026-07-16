import { expect, it, vi } from 'vitest';
import { loadSharedBrandKit, saveSharedBrandKit } from './brand-kit-sync';

const preset = {
  id: 'brand_1', name: 'Launch', color: '#336699', font: 'mono' as const,
  intro: 'Start', outro: 'End', watermark: 'ACME',
};

it('loads and saves a validated shared brand kit with the member token', async () => {
  const request = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ brandPresets: [preset] }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }))
    .mockResolvedValueOnce(new Response('{}', { status: 200 }));
  const reviewUrl = 'https://share.example/r/recording-1#token=member-secret';

  expect(await loadSharedBrandKit(reviewUrl, request)).toEqual({ ok: true, value: [preset] });
  expect(await saveSharedBrandKit(reviewUrl, [preset], request)).toEqual({ ok: true, value: undefined });
  expect(request).toHaveBeenNthCalledWith(1, 'https://share.example/api/recordings/recording-1/brand-kit', {
    headers: { authorization: 'Bearer member-secret' },
  });
  expect(request).toHaveBeenNthCalledWith(2, 'https://share.example/api/recordings/recording-1/brand-kit', {
    method: 'PUT', headers: { authorization: 'Bearer member-secret', 'content-type': 'application/json' },
    body: JSON.stringify({ brandPresets: [preset] }),
  });
});

it('rejects invalid URLs and malformed server kits', async () => {
  expect(await loadSharedBrandKit('https://share.example/r/recording-1', vi.fn())).toEqual({
    ok: false, error: 'Member review URL is missing its token.',
  });
  const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    brandPresets: [{ ...preset, color: 'blue' }],
  }), { status: 200, headers: { 'content-type': 'application/json' } }));
  expect(await loadSharedBrandKit('https://share.example/r/recording-1#token=secret', request)).toEqual({
    ok: false, error: 'Shared brand kit is invalid.',
  });
});
