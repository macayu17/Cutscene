import { appendFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import * as Y from 'yjs';
import type { Result } from '@cutscene/trace';

export const MAX_TIMELINE_BYTES = 5 * 1024 * 1024;

export type TimelineVersion = {
  v: 1;
  version: number;
  memberId: string;
  createdAt: string;
  bytes: number;
};

type MergeResult = { changed: boolean; version: number };

const writes = new Map<string, Promise<void>>();

function timelinePath(root: string, id: string): string {
  return join(root, id, 'timeline.bin');
}

function versionPath(root: string, id: string, version: number): string {
  return join(root, id, 'timeline-versions', `${String(version).padStart(6, '0')}.bin`);
}

function historyPath(root: string, id: string): string {
  return join(root, id, 'timeline-history.jsonl');
}

function isMissing(cause: unknown): boolean {
  return typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'ENOENT';
}

function isVersion(value: unknown): value is TimelineVersion {
  return typeof value === 'object' && value !== null &&
    (value as { v?: unknown }).v === 1 && Number.isInteger((value as { version?: unknown }).version) &&
    typeof (value as { memberId?: unknown }).memberId === 'string' &&
    typeof (value as { createdAt?: unknown }).createdAt === 'string' &&
    Number.isInteger((value as { bytes?: unknown }).bytes);
}

async function atomicWrite(file: string, data: Uint8Array): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, data);
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function readTimelineUpdate(root: string, id: string): Promise<Uint8Array> {
  try { return await readFile(timelinePath(root, id)); } catch (cause) {
    if (!isMissing(cause)) throw cause;
    const document = new Y.Doc();
    try { return Y.encodeStateAsUpdate(document); } finally { document.destroy(); }
  }
}

export async function listTimelineVersions(root: string, id: string): Promise<TimelineVersion[]> {
  let text: string;
  try { text = await readFile(historyPath(root, id), 'utf8'); } catch (cause) {
    if (isMissing(cause)) return [];
    throw cause;
  }
  return text.split(/\r?\n/).flatMap((line) => {
    if (!line.trim()) return [];
    let value: unknown;
    try { value = JSON.parse(line); } catch { throw new Error('timeline history is invalid'); }
    if (!isVersion(value)) throw new Error('timeline history is invalid');
    return [value];
  });
}

export async function readTimelineVersion(root: string, id: string, version: number): Promise<Uint8Array | null> {
  if (!Number.isInteger(version) || version < 1) return null;
  try { return await readFile(versionPath(root, id, version)); } catch (cause) {
    if (isMissing(cause)) return null;
    throw cause;
  }
}

async function merge(root: string, id: string, memberId: string, update: Uint8Array,
  createdAt: string): Promise<Result<MergeResult>> {
  if (update.length === 0 || update.length > MAX_TIMELINE_BYTES) return { ok: false, error: 'timeline update is invalid' };
  const document = new Y.Doc();
  try {
    try {
      Y.applyUpdate(document, await readTimelineUpdate(root, id));
    } catch {
      return { ok: false, error: 'stored timeline is invalid' };
    }
    const before = Buffer.from(Y.encodeStateVector(document));
    try { Y.applyUpdate(document, update); } catch { return { ok: false, error: 'timeline update is invalid' }; }
    const versions = await listTimelineVersions(root, id);
    const currentVersion = versions.at(-1)?.version ?? 0;
    if (before.equals(Buffer.from(Y.encodeStateVector(document)))) {
      return { ok: true, value: { changed: false, version: currentVersion } };
    }
    const merged = Y.encodeStateAsUpdate(document);
    if (merged.length > MAX_TIMELINE_BYTES) return { ok: false, error: 'timeline document is too large' };
    const version = currentVersion + 1;
    const metadata: TimelineVersion = { v: 1, version, memberId, createdAt, bytes: merged.length };
    await atomicWrite(versionPath(root, id, version), merged);
    await atomicWrite(timelinePath(root, id), merged);
    await appendFile(historyPath(root, id), `${JSON.stringify(metadata)}\n`);
    return { ok: true, value: { changed: true, version } };
  } finally {
    document.destroy();
  }
}

export async function mergeTimelineUpdate(root: string, id: string, memberId: string,
  update: Uint8Array, createdAt: string): Promise<Result<MergeResult>> {
  const key = join(root, id);
  const previous = writes.get(key) ?? Promise.resolve();
  const operation = previous.catch(() => undefined).then(() => merge(root, id, memberId, update, createdAt));
  const settled = operation.then(() => undefined, () => undefined);
  writes.set(key, settled);
  try {
    return await operation;
  } finally {
    if (writes.get(key) === settled) writes.delete(key);
  }
}
