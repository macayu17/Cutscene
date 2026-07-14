export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export type Viewport = { width: number; height: number; dpr: number };
export type ScrollPosition = { x: number; y: number };
export type BoundingBox = { x: number; y: number; width: number; height: number };

export type Locator =
  | { type: 'testId'; value: string; confidence: number }
  | { type: 'role'; role: string; name: string; confidence: number }
  | { type: 'label' | 'text' | 'css'; value: string; confidence: number };

export type TargetDescriptor = {
  role: string | null;
  accessibleName: string;
  text: string;
  tagName: string;
  boundingBox: BoundingBox;
  locators: Locator[];
};

export type TraceEventType =
  | 'system.recordingStart'
  | 'system.recordingStop'
  | 'system.clockSync'
  | 'navigation'
  | 'interaction.click'
  | 'interaction.input'
  | 'interaction.scroll'
  | 'viewport.resize'
  | 'interaction.hover'
  | 'annotation.callout'
  | 'interaction.keypress'
  | 'dom.mutation'
  | 'network.request'
  | 'annotation.comment'
  | 'system.checkpoint';

type EventEnvelope = {
  v: 1;
  id: string;
  t: number;
  stepId: string;
  route: string;
  viewport: Viewport;
  scroll: ScrollPosition;
  target?: TargetDescriptor;
};

export type ClockSyncEvent = EventEnvelope & {
  type: 'system.clockSync';
  contentClockMs: number;
  workerClockMs: number;
  mediaTimeMs: number;
};

export type TraceEvent = EventEnvelope & (
  | ClockSyncEvent
  | { type: Exclude<TraceEventType, 'system.clockSync'> }
);

export type RecordingMeta = {
  schemaVersion: 1;
  recordingId: string;
  createdAt: string;
  sessionEpoch: number;
  url: string;
  origin: string;
  viewport: Viewport;
  capture: { width: number; height: number; fps: number };
  media: { mimeType: string; hasAudio: boolean; durationMs: number };
  privacy: {
    maskInputValues: boolean;
    captureNetwork: false;
    maskedSelectors: string[];
  };
  app: { commit: string | null; version: string | null; environment: string | null };
};

const eventTypes = new Set<TraceEventType>([
  'system.recordingStart', 'system.recordingStop', 'system.clockSync', 'navigation',
  'interaction.click', 'interaction.input', 'interaction.scroll', 'viewport.resize',
  'interaction.hover', 'annotation.callout', 'interaction.keypress', 'dom.mutation',
  'network.request', 'annotation.comment', 'system.checkpoint',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasString(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === 'string';
}

function hasNumber(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === 'number' && Number.isFinite(value[key]);
}

function isViewport(value: unknown): value is Viewport {
  return isRecord(value) && hasNumber(value, 'width') && hasNumber(value, 'height') && hasNumber(value, 'dpr');
}

function isScroll(value: unknown): value is ScrollPosition {
  return isRecord(value) && hasNumber(value, 'x') && hasNumber(value, 'y');
}

export function parseTraceEvent(input: unknown): Result<TraceEvent> {
  if (!isRecord(input) || input.v !== 1) return { ok: false, error: 'trace event must have v: 1' };
  if (!hasString(input, 'type') || !eventTypes.has(input.type as TraceEventType)) return { ok: false, error: 'unknown trace event type' };
  if (!hasString(input, 'id') || !hasNumber(input, 't') || !hasString(input, 'stepId') || !hasString(input, 'route')) {
    return { ok: false, error: 'trace event envelope is invalid' };
  }
  if (!isViewport(input.viewport) || !isScroll(input.scroll)) return { ok: false, error: 'trace event coordinates are invalid' };
  if (input.type === 'system.clockSync' &&
      (!hasNumber(input, 'contentClockMs') || !hasNumber(input, 'workerClockMs') || !hasNumber(input, 'mediaTimeMs'))) {
    return { ok: false, error: 'clock sync readings are invalid' };
  }
  return { ok: true, value: input as TraceEvent };
}

export function parseRecordingMeta(input: unknown): Result<RecordingMeta> {
  if (!isRecord(input) || input.schemaVersion !== 1) return { ok: false, error: 'metadata must have schemaVersion: 1' };
  const requiredStrings = ['recordingId', 'createdAt', 'url', 'origin'];
  if (!requiredStrings.every((key) => hasString(input, key)) || !hasNumber(input, 'sessionEpoch')) {
    return { ok: false, error: 'metadata identity is invalid' };
  }
  if (!isViewport(input.viewport) || !isRecord(input.capture) ||
      !hasNumber(input.capture, 'width') || !hasNumber(input.capture, 'height') || !hasNumber(input.capture, 'fps')) {
    return { ok: false, error: 'metadata dimensions are invalid' };
  }
  if (!isRecord(input.media) || !hasString(input.media, 'mimeType') ||
      typeof input.media.hasAudio !== 'boolean' || !hasNumber(input.media, 'durationMs')) {
    return { ok: false, error: 'metadata media is invalid' };
  }
  if (!isRecord(input.privacy) || typeof input.privacy.maskInputValues !== 'boolean' ||
      input.privacy.captureNetwork !== false || !Array.isArray(input.privacy.maskedSelectors) ||
      !input.privacy.maskedSelectors.every((item) => typeof item === 'string')) {
    return { ok: false, error: 'metadata privacy is invalid' };
  }
  if (!isRecord(input.app)) return { ok: false, error: 'metadata app is invalid' };
  return { ok: true, value: input as RecordingMeta };
}
