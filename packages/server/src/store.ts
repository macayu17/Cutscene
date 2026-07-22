import { access, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseReviewDocument, type ReviewDocument } from './review.ts';
import { expiryFrom, isExpired } from './limits.ts';

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

// Creating the directory dates it in the same step: a recording with no expiry is
// treated as gone, so the two must never be separable.
export async function ensureRecording(root: string, id: string): Promise<void> {
  await mkdir(join(root, id), { recursive: true });
  if (await readExpiry(root, id) === null) await writeExpiry(root, id);
}

// Both of these gate every route that touches a recording, so retention is enforced
// here rather than at each caller. A recording past its date is gone whether or not
// the sweep has run yet.
export async function recordingExists(root: string, id: string): Promise<boolean> {
  try { await access(join(root, id)); } catch { return false; }
  return recordingLive(root, id);
}

export async function recordingReady(root: string, id: string): Promise<boolean> {
  const files = await Promise.all(BUNDLE_FILES.map(async (file) => {
    try { await access(join(root, id, file)); return true; } catch { return false; }
  }));
  return files.every(Boolean) && await recordingLive(root, id);
}

export async function saveBundleFile(root: string, id: string, file: BundleFile, data: Buffer): Promise<void> {
  await writeFile(join(root, id, file), data);
}

// Every route that serves recorded bytes reads through here, so retention is enforced
// here too. A route that checked liveness separately would eventually forget to.
export async function readBundleFile(root: string, id: string, file: BundleFile): Promise<Buffer | null> {
  if (!(await recordingLive(root, id))) return null;
  try { return await readFile(join(root, id, file)); } catch { return null; }
}

// Retention is one file holding one date, so nothing needs a schema change and an
// operator can read it with cat.
const EXPIRY_FILE = 'expires';

export async function writeExpiry(root: string, id: string, now = new Date()): Promise<void> {
  await writeFile(join(root, id, EXPIRY_FILE), `${expiryFrom(now)}\n`);
}

export async function readExpiry(root: string, id: string): Promise<string | null> {
  try { return (await readFile(join(root, id, EXPIRY_FILE), 'utf8')).trim(); } catch { return null; }
}

/** Expired, or predating retention entirely, both mean gone. */
export async function recordingLive(root: string, id: string, now = new Date()): Promise<boolean> {
  const expiresAt = await readExpiry(root, id);
  return expiresAt !== null && !isExpired(expiresAt, now);
}

export async function deleteRecording(root: string, id: string): Promise<void> {
  await rm(join(root, id), { recursive: true, force: true });
}

export async function recordingBytes(root: string, id: string): Promise<number> {
  let total = 0;
  try {
    for (const entry of await readdir(join(root, id))) {
      try { total += (await stat(join(root, id, entry))).size; } catch { /* raced with a sweep */ }
    }
  } catch { return 0; }
  return total;
}

export async function storeBytes(root: string): Promise<number> {
  let total = 0;
  for (const id of await listRecordings(root)) total += await recordingBytes(root, id);
  return total;
}

export async function listRecordings(root: string): Promise<string[]> {
  try {
    return (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && isValidId(entry.name)).map((entry) => entry.name);
  } catch { return []; }
}

/** Deletes every recording past its retention date. Returns the ids removed. */
export async function sweepExpired(root: string, now = new Date()): Promise<string[]> {
  const removed: string[] = [];
  for (const id of await listRecordings(root)) {
    if (await recordingLive(root, id, now)) continue;
    await deleteRecording(root, id);
    removed.push(id);
  }
  return removed;
}

const reviewWrites = new Map<string, Promise<void>>();

export async function readReview(root: string, id: string): Promise<ReviewDocument | null> {
  try {
    const input: unknown = JSON.parse(await readFile(join(root, id, 'review.json'), 'utf8'));
    const parsed = parseReviewDocument(input);
    return parsed.ok ? parsed.value : null;
  } catch {
    return null;
  }
}

export async function writeReview(root: string, id: string, review: ReviewDocument): Promise<void> {
  const directory = join(root, id);
  const target = join(directory, 'review.json');
  const temporary = join(directory, `.review-${randomUUID()}.tmp`);
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(temporary, JSON.stringify(review));
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function updateReview(root: string, id: string,
  update: (review: ReviewDocument) => ReviewDocument): Promise<ReviewDocument> {
  const key = join(root, id);
  const previous = reviewWrites.get(key) ?? Promise.resolve();
  const operation = previous.catch(() => undefined).then(async () => {
    const current = await readReview(root, id);
    if (!current) throw new Error('review not found');
    const next = update(current);
    await writeReview(root, id, next);
    return next;
  });
  const settled = operation.then(() => undefined, () => undefined);
  reviewWrites.set(key, settled);
  try {
    return await operation;
  } finally {
    if (reviewWrites.get(key) === settled) reviewWrites.delete(key);
  }
}
