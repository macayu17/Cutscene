import type { TraceEvent } from '@cutscene/trace';

function boundaryRank(event: TraceEvent): number {
  if (event.type === 'system.recordingStart') return -1;
  if (event.type === 'system.recordingStop') return 1;
  return 0;
}

export function orderTraceEvents(events: readonly TraceEvent[]): TraceEvent[] {
  return events.map((event, index) => ({ event, index })).sort((left, right) =>
    left.event.t - right.event.t || boundaryRank(left.event) - boundaryRank(right.event) || left.index - right.index)
    .map(({ event }) => event);
}

export function rollbackCapture(recorder: Pick<MediaRecorder, 'state' | 'stop'> | null,
  streams: readonly MediaStream[], clearState: () => void): void {
  if (recorder && recorder.state !== 'inactive') try { recorder.stop(); } catch { /* Tracks are still stopped below. */ }
  streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
  clearState();
}
