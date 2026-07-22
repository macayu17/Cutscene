import type { RecordingMeta } from '@cutscene/trace';

// The extension writes here when a recording stops; the editor page, which is
// served from the same extension origin, reads it back. Nothing crosses the disk.
const databaseName = 'cutscene';
const storeName = 'recordings';
const retained = 5;

export type RecordingRecord = { id: string; media: Blob; trace: Blob; meta: RecordingMeta };
export type RecordingSummary = { id: string; url: string; createdAt: string; durationMs: number; bytes: number };

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return database().then((db) => new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = work(transaction.objectStore(storeName));
    transaction.oncomplete = () => { db.close(); resolve(request.result); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  }));
}

export function summarize(record: RecordingRecord): RecordingSummary {
  return { id: record.id, url: record.meta.url, createdAt: record.meta.createdAt,
    durationMs: record.meta.media.durationMs, bytes: record.media.size };
}

/** Newest first, and the ids beyond the retention cap. Pure so it can be tested without IndexedDB. */
export function retain(summaries: readonly RecordingSummary[], cap = retained):
  { keep: RecordingSummary[]; evict: string[] } {
  const ordered = [...summaries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { keep: ordered.slice(0, cap), evict: ordered.slice(cap).map((summary) => summary.id) };
}

/** Everything held, newest first. Listing must not hide a record the user could delete. */
export async function listRecordings(): Promise<RecordingSummary[]> {
  const records = await run<RecordingRecord[]>('readonly', (store) => store.getAll() as IDBRequest<RecordingRecord[]>);
  return records.map(summarize).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function readRecording(id: string): Promise<RecordingRecord | undefined> {
  return run<RecordingRecord | undefined>('readonly', (store) => store.get(id) as IDBRequest<RecordingRecord | undefined>);
}

export function deleteRecording(id: string): Promise<undefined> {
  return run<undefined>('readwrite', (store) => store.delete(id));
}

export async function saveBundle(id: string, media: Blob, trace: Blob, meta: RecordingMeta): Promise<void> {
  // Evict first: the quota this write needs is the space the oldest recordings hold,
  // and losing the take being written to keep five old ones is the wrong trade.
  const held = await run<RecordingRecord[]>('readonly', (store) => store.getAll() as IDBRequest<RecordingRecord[]>);
  const existing = held.map(summarize).filter((summary) => summary.id !== id);
  for (const evicted of retain([...existing, summarize({ id, media, trace, meta })]).evict) await deleteRecording(evicted);
  await run('readwrite', (store) => store.put({ id, media, trace, meta } satisfies RecordingRecord));
}

/** The three files the editor's existing bundle reader expects, rebuilt from one stored record. */
export function recordingFiles(record: RecordingRecord): File[] {
  return [
    new File([record.media], 'media.webm', { type: record.media.type }),
    new File([record.trace], 'trace.jsonl', { type: 'application/x-ndjson' }),
    new File([`${JSON.stringify(record.meta, null, 2)}\n`], 'meta.json', { type: 'application/json' }),
  ];
}

/** True on the extension's own editor page, where stored recordings are reachable. */
export function inExtension(): boolean {
  const runtime = (globalThis as { chrome?: { runtime?: { id?: string } } }).chrome?.runtime;
  return typeof runtime?.id === 'string';
}
