import type { Result } from '@cutscene/trace';
import { parseBrandPresets, type BrandPreset } from './brand';

type Target = { endpoint: string; token: string };

function target(value: string): Result<Target> {
  let url: URL;
  try { url = new URL(value.trim()); } catch { return { ok: false, error: 'Member review URL is invalid.' }; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'Member review URL must use HTTP or HTTPS.' };
  }
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length !== 2 || parts[0] !== 'r' || !parts[1]) {
    return { ok: false, error: 'Member review URL is invalid.' };
  }
  const token = new URLSearchParams(url.hash.slice(1)).get('token');
  return token ? { ok: true, value: {
    endpoint: `${url.origin}/api/recordings/${encodeURIComponent(parts[1])}/brand-kit`, token,
  } } : { ok: false, error: 'Member review URL is missing its token.' };
}

function failure(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export async function loadSharedBrandKit(reviewUrl: string,
  request: typeof fetch = fetch): Promise<Result<BrandPreset[]>> {
  const parsed = target(reviewUrl);
  if (!parsed.ok) return parsed;
  try {
    const response = await request(parsed.value.endpoint, {
      headers: { authorization: `Bearer ${parsed.value.token}` },
    });
    if (!response.ok) return { ok: false, error: `Load shared brand kit failed (${response.status}).` };
    const payload: unknown = await response.json();
    const presets = typeof payload === 'object' && payload !== null && 'brandPresets' in payload
      ? parseBrandPresets(payload.brandPresets) : null;
    return presets ? { ok: true, value: presets } : { ok: false, error: 'Shared brand kit is invalid.' };
  } catch (cause) {
    return { ok: false, error: `Load shared brand kit failed: ${failure(cause)}` };
  }
}

export async function saveSharedBrandKit(reviewUrl: string, brandPresets: BrandPreset[],
  request: typeof fetch = fetch): Promise<Result<undefined>> {
  const parsed = target(reviewUrl);
  if (!parsed.ok) return parsed;
  try {
    const response = await request(parsed.value.endpoint, {
      method: 'PUT',
      headers: { authorization: `Bearer ${parsed.value.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ brandPresets }),
    });
    return response.ok ? { ok: true, value: undefined }
      : { ok: false, error: `Save shared brand kit failed (${response.status}).` };
  } catch (cause) {
    return { ok: false, error: `Save shared brand kit failed: ${failure(cause)}` };
  }
}
