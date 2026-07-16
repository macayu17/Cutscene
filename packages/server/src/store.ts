import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

// The filesystem is the store: one directory per recording, the id is the share
// link. No database. The id is an unguessable UUID, which is the only access
// control this wedge has — a public link and nothing more.

export const BUNDLE_FILES = ['media.webm', 'trace.jsonl', 'meta.json'] as const;
export type BundleFile = (typeof BUNDLE_FILES)[number];

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function createId(): string {
  return randomUUID();
}

export function isValidId(id: string): boolean {
  return ID.test(id);
}

export function isBundleFile(name: string): name is BundleFile {
  return (BUNDLE_FILES as readonly string[]).includes(name);
}

// Lightweight structural check at the upload boundary. The editor that produces
// a bundle already validates it against the full @cutscene/trace schema; the
// server only needs to reject non-JSON garbage and non-Cutscene payloads without
// coupling its runtime to the schema package. media is opaque bytes.
// ponytail: JSON + schemaVersion, not full schema re-validation. Deepen only if
// bundles start arriving from something other than the editor.
export function validateBundleFile(file: BundleFile, data: Buffer): Result<undefined> {
  if (file === 'media.webm' && data.length === 0) return { ok: false, error: 'media.webm is empty' };
  if (file === 'meta.json') {
    let json: unknown;
    try { json = JSON.parse(data.toString('utf8')); } catch { return { ok: false, error: 'meta.json is not valid JSON' }; }
    if (!json || typeof json !== 'object' || (json as { schemaVersion?: unknown }).schemaVersion !== 1) {
      return { ok: false, error: 'meta.json is not a Cutscene bundle (schemaVersion 1)' };
    }
    return { ok: true, value: undefined };
  }
  if (file === 'trace.jsonl') {
    for (const [index, line] of data.toString('utf8').split(/\r?\n/).entries()) {
      if (!line.trim()) continue;
      try { JSON.parse(line); } catch { return { ok: false, error: `trace line ${index + 1} is not valid JSON` }; }
    }
    return { ok: true, value: undefined };
  }
  return { ok: true, value: undefined };
}

export async function ensureRecording(root: string, id: string): Promise<void> {
  await mkdir(join(root, id), { recursive: true });
}

export async function recordingExists(root: string, id: string): Promise<boolean> {
  try { await access(join(root, id)); return true; } catch { return false; }
}

export async function recordingReady(root: string, id: string): Promise<boolean> {
  const files = await Promise.all(BUNDLE_FILES.map(async (file) => {
    try { await access(join(root, id, file)); return true; } catch { return false; }
  }));
  return files.every(Boolean);
}

export async function saveBundleFile(root: string, id: string, file: BundleFile, data: Buffer): Promise<void> {
  await writeFile(join(root, id, file), data);
}

export async function readBundleFile(root: string, id: string, file: BundleFile): Promise<Buffer | null> {
  try { return await readFile(join(root, id, file)); } catch { return null; }
}
