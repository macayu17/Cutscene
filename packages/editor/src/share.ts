import type { Result } from '@cutscene/trace';
import type { BundleFiles } from './bundle';

const UPLOADS = [
  ['media.webm', 'media'],
  ['trace.jsonl', 'trace'],
  ['meta.json', 'meta'],
] as const;

export async function createShareLink(server: string, files: BundleFiles): Promise<Result<string>> {
  let base: string;
  try {
    const url = new URL(server.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, error: 'Share server must use HTTP or HTTPS.' };
    base = url.toString().replace(/\/+$/, '');
  } catch {
    return { ok: false, error: 'Share server URL is invalid.' };
  }

  try {
    const created = await fetch(`${base}/api/recordings`, { method: 'POST' });
    if (!created.ok) return { ok: false, error: `Create recording failed (${created.status}).` };
    const payload: unknown = await created.json();
    const id = typeof payload === 'object' && payload !== null && 'id' in payload && typeof payload.id === 'string'
      ? payload.id : null;
    if (!id) return { ok: false, error: 'Create recording returned an invalid id.' };

    for (const [name, key] of UPLOADS) {
      const response = await fetch(`${base}/api/recordings/${encodeURIComponent(id)}/${name}`, {
        method: 'PUT', body: files[key],
      });
      if (!response.ok) return { ok: false, error: `Upload ${name} failed (${response.status}).` };
    }
    return { ok: true, value: `${base}/r/${encodeURIComponent(id)}` };
  } catch (cause: unknown) {
    return { ok: false, error: `Share server request failed: ${cause instanceof Error ? cause.message : String(cause)}` };
  }
}
