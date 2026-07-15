import { type MediaClockFit, type TraceEvent } from '@cutscene/trace';
import type { EditableSegment } from './segments';
import type { EditableRedaction, RedactionBox } from './redactions';
import type { CursorSettings } from './cursor';
import { exportRecording, type ExportMeta } from './export';
import { zipStore, type ZipEntry } from './zip';

// One GIF per zoom step, each trimmed to its segment window. The full-flow GIF
// is the existing 'gif' export; this produces the per-step variants for docs.
// Unbranded and callout-free by design: these are documentation snippets.

export async function exportStepGifs(media: Blob, segments: readonly EditableSegment[], meta: ExportMeta,
  events: readonly TraceEvent[], clock: MediaClockFit, redactions: readonly EditableRedaction[],
  redactionBoxes: readonly RedactionBox[], cursorSettings: CursorSettings,
  progress: (value: number) => void): Promise<{ archive: Uint8Array; count: number }> {
  const ordered = [...segments].sort((a, b) => a.startMs - b.startMs);
  const entries: ZipEntry[] = [];
  for (const [index, segment] of ordered.entries()) {
    const blob = await exportRecording(media, 'gif', [segment], meta, [], events, clock,
      redactions, redactionBoxes, null, cursorSettings,
      (value) => progress((index + value) / ordered.length),
      { startSeconds: segment.startMs / 1_000, endSeconds: segment.endMs / 1_000 });
    entries.push({ name: `step-${String(index + 1).padStart(2, '0')}.gif`, data: new Uint8Array(await blob.arrayBuffer()) });
  }
  return { archive: zipStore(entries), count: entries.length };
}
