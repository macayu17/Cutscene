import type { Result as TraceResult } from '@cutscene/trace';

export type RecorderStatus = {
  recording: boolean;
  tabId: number | null;
  clickCount: number;
  startedAt: number | null;
  recordingId: string | null;
  // A screen recording has no content script, so the stop path must not message the tab.
  source: 'tab' | 'screen';
};

export type Result<T = undefined> = TraceResult<T>;

/** A start that loses the race must be refused, never by tearing down the winner. */
export const RECORDER_BUSY = 'A recording is already active.';
