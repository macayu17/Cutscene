import type { Box, Size } from './measurement';

export type ClickEvent = {
  v: 1;
  id: string;
  t: number;
  type: 'interaction.click';
  route: string;
  viewport: Size & { dpr: number };
  scroll: { x: number; y: number };
  target: {
    role: string | null;
    accessibleName: string;
    testId: string | null;
    tagName: string;
    boundingBox: Box;
  };
};

export type ClockSyncEvent = {
  v: 1;
  id: string;
  t: number;
  type: 'system.clockSync';
  contentClockMs: number;
  workerClockMs: number;
  mediaTimeMs: number;
};

export type SystemEvent = {
  v: 1;
  id: string;
  t: number;
  type: 'system.recordingStart' | 'system.recordingStop';
};

export type TraceEvent = ClickEvent | ClockSyncEvent | SystemEvent;

export type Result<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export type RecorderStatus = {
  recording: boolean;
  tabId: number | null;
  clickCount: number;
  startedAt: number | null;
};
