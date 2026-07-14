import { fitMediaClock, parseRecordingMeta, parseTraceEvent, type MediaClockFit, type RecordingMeta, type Result, type TraceEvent } from '@cutscene/trace';

export type BundleData = { meta: RecordingMeta; events: TraceEvent[]; clock: MediaClockFit };

export function pageEventAt(events: readonly TraceEvent[], traceTimeMs: number): TraceEvent | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event && event.t <= traceTimeMs && !event.type.startsWith('system.')) return event;
  }
  return null;
}

export function parseBundle(metaText: string, traceText: string): Result<BundleData> {
  let metaInput: unknown;
  try { metaInput = JSON.parse(metaText); } catch { return { ok: false, error: 'meta.json is invalid JSON' }; }
  const meta = parseRecordingMeta(metaInput);
  if (!meta.ok) return meta;
  const events: TraceEvent[] = [];
  for (const [index, line] of traceText.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let input: unknown;
    try { input = JSON.parse(line); } catch { return { ok: false, error: `trace line ${index + 1} is invalid JSON` }; }
    const event = parseTraceEvent(input);
    if (!event.ok) return { ok: false, error: `trace line ${index + 1}: ${event.error}` };
    events.push(event.value);
  }
  const clock = fitMediaClock(events.filter((event) => event.type === 'system.clockSync').map((event) => ({ t: event.t, mediaTimeMs: event.mediaTimeMs })));
  return clock.ok ? { ok: true, value: { meta: meta.value, events, clock: clock.value } } : clock;
}

export async function readBundleFiles(files: readonly File[]): Promise<Result<BundleData & { mediaUrl: string; media: File }>> {
  const media = files.find((file) => file.name === 'media.webm');
  const trace = files.find((file) => file.name === 'trace.jsonl');
  const meta = files.find((file) => file.name === 'meta.json');
  const missing = [['media.webm', media], ['trace.jsonl', trace], ['meta.json', meta]].filter(([, file]) => !file).map(([name]) => name);
  if (!media || !trace || !meta) return { ok: false, error: `Missing ${missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(', ')} and ${missing.at(-1)}`}.` };
  const parsed = parseBundle(await meta.text(), await trace.text());
  return parsed.ok ? { ok: true, value: { ...parsed.value, mediaUrl: URL.createObjectURL(media), media } } : parsed;
}
