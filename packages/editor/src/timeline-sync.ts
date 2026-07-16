import type { Result } from '@cutscene/trace';
import * as Y from 'yjs';
import type { TimelineDocument, TimelineState } from './timeline-document';

export type TimelineSyncStatus =
  | { state: 'idle' | 'syncing' | 'synced' }
  | { state: 'error'; error: string };

export type TimelineConnection = {
  syncNow: () => Promise<void>;
  flush: () => Promise<void>;
  stop: () => void;
};

type OwnerTarget = { base: string; id: string; token: string };
type SyncOptions = { request?: typeof fetch; pollMs?: number; seed?: TimelineState };

export function parseTimelineOwnerUrl(value: string): Result<OwnerTarget> {
  let url: URL;
  try { url = new URL(value.trim()); } catch { return { ok: false, error: 'Owner review URL is invalid.' }; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, error: 'Owner review URL must use HTTP or HTTPS.' };
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length !== 2 || parts[0] !== 'r' || !parts[1]) return { ok: false, error: 'Owner review URL is invalid.' };
  const token = new URLSearchParams(url.hash.slice(1)).get('token');
  return token ? { ok: true, value: { base: url.origin, id: parts[1], token } }
    : { ok: false, error: 'Owner review URL is missing its token.' };
}

function body(update: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(update.byteLength);
  new Uint8Array(copy).set(update);
  return copy;
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function hasTimelineItems(update: Uint8Array): boolean {
  const document = new Y.Doc();
  try {
    Y.applyUpdate(document, update);
    return document.getArray('timeline').length > 0;
  } finally {
    document.destroy();
  }
}

export async function connectTimelineSync(ownerUrl: string, timeline: TimelineDocument,
  status: (value: TimelineSyncStatus) => void, options: SyncOptions = {}): Promise<Result<TimelineConnection>> {
  const target = parseTimelineOwnerUrl(ownerUrl);
  if (!target.ok) return target;
  const request = options.request ?? fetch;
  const pollMs = options.pollMs ?? 1_500;
  const endpoint = `${target.value.base}/api/recordings/${encodeURIComponent(target.value.id)}/timeline`;
  const headers = { authorization: `Bearer ${target.value.token}` };
  let stopped = false;
  let pending = Promise.resolve();

  const pull = async (): Promise<boolean> => {
    const response = await request(endpoint, { headers });
    if (!response.ok) throw new Error(`Timeline download failed (${response.status}).`);
    const update = new Uint8Array(await response.arrayBuffer());
    const populated = hasTimelineItems(update);
    timeline.applyRemote(update);
    return populated;
  };
  const post = async (update: Uint8Array) => {
    const response = await request(endpoint, { method: 'POST', headers, body: body(update) });
    if (!response.ok) throw new Error(`Timeline upload failed (${response.status}).`);
  };
  const report = async (task: () => Promise<void>) => {
    if (stopped) return;
    status({ state: 'syncing' });
    try { await task(); if (!stopped) status({ state: 'synced' }); }
    catch (cause) { if (!stopped) status({ state: 'error', error: message(cause) }); throw cause; }
  };
  const queue = (update: Uint8Array) => {
    pending = pending.then(() => report(() => post(update))).catch(() => undefined);
  };

  try {
    await report(async () => {
      const populated = await pull();
      if (!populated && options.seed) {
        timeline.initialize(options.seed);
        await post(timeline.encode());
      }
      await pull();
    });
  } catch (cause) {
    return { ok: false, error: `Timeline sync failed: ${message(cause)}` };
  }

  const stopUpdates = timeline.onUpdate((update, local) => { if (local && !stopped) queue(update); });
  const syncNow = () => report(async () => { await pull(); });
  const timer = pollMs > 0 ? setInterval(() => { void syncNow().catch(() => undefined); }, pollMs) : null;
  return { ok: true, value: {
    syncNow,
    flush: () => pending,
    stop: () => {
      stopped = true;
      stopUpdates();
      if (timer !== null) clearInterval(timer);
    },
  } };
}
