import type { Result } from '@cutscene/trace';
import type { BundleFiles } from './bundle';

const UPLOADS = [
  ['media.webm', 'media'],
  ['trace.jsonl', 'trace'],
  ['meta.json', 'meta'],
] as const;
type Upload = (typeof UPLOADS)[number];

export type ShareLinks = { id: string; publicUrl: string; reviewerUrl: string; ownerUrl: string; expiresAt: string | null };

function field(value: unknown, key: string): string | null {
  return typeof value === 'object' && value !== null && key in value &&
    typeof (value as Record<string, unknown>)[key] === 'string' ? (value as Record<string, string>)[key] ?? null : null;
}

async function upload(base: string, id: string, token: string, files: BundleFiles,
  uploads: readonly Upload[] = UPLOADS): Promise<Result<undefined>> {
  for (const [name, key] of uploads) {
    const response = await fetch(`${base}/api/recordings/${encodeURIComponent(id)}/${name}`, {
      method: 'PUT', headers: { authorization: `Bearer ${token}` }, body: files[key],
    });
    if (!response.ok) return { ok: false, error: `Upload ${name} failed (${response.status}).` };
  }
  return { ok: true, value: undefined };
}

export async function createShareLink(server: string, files: BundleFiles): Promise<Result<ShareLinks>> {
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
    const id = field(payload, 'id');
    const ownerToken = field(payload, 'ownerToken');
    const invitationToken = field(payload, 'invitationToken');
    if (!id || !ownerToken || !invitationToken) return { ok: false, error: 'Create recording returned invalid review credentials.' };
    const uploaded = await upload(base, id, ownerToken, files);
    if (!uploaded.ok) return uploaded;
    const publicUrl = `${base}/r/${encodeURIComponent(id)}`;
    return { ok: true, value: {
      id,
      publicUrl,
      expiresAt: field(payload, 'expiresAt'),
      reviewerUrl: `${publicUrl}#invite=${encodeURIComponent(invitationToken)}`,
      ownerUrl: `${publicUrl}#token=${encodeURIComponent(ownerToken)}`,
    } };
  } catch (cause: unknown) {
    return { ok: false, error: `Share server request failed: ${cause instanceof Error ? cause.message : String(cause)}` };
  }
}

export async function updateSharedRecording(ownerReviewUrl: string, files: BundleFiles): Promise<Result<string>> {
  let url: URL;
  try { url = new URL(ownerReviewUrl.trim()); } catch { return { ok: false, error: 'Owner review URL is invalid.' }; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, error: 'Owner review URL must use HTTP or HTTPS.' };
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length !== 2 || parts[0] !== 'r' || !parts[1]) return { ok: false, error: 'Owner review URL is invalid.' };
  const token = new URLSearchParams(url.hash.slice(1)).get('token');
  if (!token) return { ok: false, error: 'Owner review URL is missing its token.' };
  const base = url.origin;
  try {
    const uploaded = await upload(base, parts[1], token, files,
      [['trace.jsonl', 'trace'], ['media.webm', 'media'], ['meta.json', 'meta']]);
    return uploaded.ok ? { ok: true, value: url.toString() } : uploaded;
  } catch (cause: unknown) {
    return { ok: false, error: `Share server request failed: ${cause instanceof Error ? cause.message : String(cause)}` };
  }
}
