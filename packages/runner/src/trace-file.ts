import { readFile } from 'node:fs/promises';
import { parseTraceEvent, type Result, type TraceEvent } from '@cutscene/trace';

export async function readTraceFile(path: string): Promise<Result<TraceEvent[]>> {
  let source: string;
  try {
    source = await readFile(path, 'utf8');
  } catch (cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, error: `cannot read trace: ${detail}` };
  }

  const events: TraceEvent[] = [];
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    if (line.trim().length === 0) {
      continue;
    }
    let input: unknown;
    try {
      input = JSON.parse(line);
    } catch {
      return { ok: false, error: `trace line ${index + 1} is invalid JSON` };
    }
    const event = parseTraceEvent(input);
    if (!event.ok) {
      return { ok: false, error: `trace line ${index + 1}: ${event.error}` };
    }
    events.push(event.value);
  }

  return events.length === 0
    ? { ok: false, error: 'trace has no events' }
    : { ok: true, value: events };
}
