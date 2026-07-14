import type { Result as TraceResult } from '@cutscene/trace';

export type RecorderStatus = {
  recording: boolean;
  tabId: number | null;
  clickCount: number;
  startedAt: number | null;
  recordingId: string | null;
};

export type Result<T = undefined> = TraceResult<T>;
