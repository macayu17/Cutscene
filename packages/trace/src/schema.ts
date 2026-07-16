export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export type Viewport = { width: number; height: number; dpr: number };
export type ScrollPosition = { x: number; y: number };
export type BoundingBox = { x: number; y: number; width: number; height: number };
export type PointerPosition = { x: number; y: number };

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
  value?: string;
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
  | 'annotation.redaction'
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

export type RedactionSampleEvent = EventEnvelope & {
  type: 'annotation.redaction';
  selector: string;
  instanceId: string;
  visible: boolean;
  box?: BoundingBox;
};

export type CalloutEvent = Omit<EventEnvelope, 'target'> & {
  type: 'annotation.callout';
  anchor: { stepId: string; locators: Locator[] };
  text: string;
  placement: 'auto';
  target?: never;
};

export type CommentEvent = Omit<EventEnvelope, 'target'> & {
  type: 'annotation.comment';
  anchor: { stepId: string; locators: Locator[]; mediaTimeMs: number };
  body: string;
  target?: never;
};

type NonCalloutTraceEvent = ClockSyncEvent | RedactionSampleEvent |
  (Omit<EventEnvelope, 'target'> & { type: 'interaction.hover'; pointer: PointerPosition; target?: never }) |
  (EventEnvelope & { type: 'interaction.click'; pointer?: PointerPosition }) |
  (EventEnvelope & { type: Exclude<TraceEventType,
    'system.clockSync' | 'annotation.redaction' | 'annotation.callout' | 'annotation.comment' |
    'interaction.hover' | 'interaction.click'> });

export type TraceEvent = NonCalloutTraceEvent | CalloutEvent | CommentEvent;
export type ParsedTraceEvent = TraceEvent;

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
    visualRedactionSelectors?: string[];
  };
  app: { commit: string | null; version: string | null; environment: string | null };
};

const eventTypes = new Set<TraceEventType>([
  'system.recordingStart', 'system.recordingStop', 'system.clockSync', 'navigation',
  'interaction.click', 'interaction.input', 'interaction.scroll', 'viewport.resize',
  'interaction.hover', 'annotation.callout', 'annotation.redaction', 'interaction.keypress', 'dom.mutation',
  'network.request', 'annotation.comment', 'system.checkpoint',
]);
const redactionKeys = new Set(['v', 'id', 't', 'type', 'stepId', 'route', 'viewport', 'scroll',
  'selector', 'instanceId', 'visible', 'box']);
const targetKeys = new Set(['role', 'accessibleName', 'text', 'tagName', 'boundingBox', 'locators', 'value']);
const calloutKeys = new Set(['v', 'id', 't', 'type', 'stepId', 'route', 'viewport', 'scroll',
  'anchor', 'text', 'placement']);
const commentKeys = new Set(['v', 'id', 't', 'type', 'stepId', 'route', 'viewport', 'scroll',
  'anchor', 'body']);
const locatorValueKeys = new Set(['type', 'value', 'confidence']);
const locatorRoleKeys = new Set(['type', 'role', 'name', 'confidence']);
const anchorKeys = new Set(['stepId', 'locators']);
const commentAnchorKeys = new Set(['stepId', 'locators', 'mediaTimeMs']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasString(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === 'string';
}

function hasNumber(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === 'number' && Number.isFinite(value[key]);
}

function hasPositiveNumber(value: Record<string, unknown>, key: string): boolean {
  const number = value[key];
  return typeof number === 'number' && Number.isFinite(number) && number > 0;
}

function isViewport(value: unknown): value is Viewport {
  return isRecord(value) && hasPositiveNumber(value, 'width') &&
    hasPositiveNumber(value, 'height') && hasPositiveNumber(value, 'dpr');
}

function isScroll(value: unknown): value is ScrollPosition {
  return isRecord(value) && hasNumber(value, 'x') && hasNumber(value, 'y');
}

function isBox(value: unknown): value is BoundingBox {
  return isRecord(value) && hasNumber(value, 'x') && hasNumber(value, 'y') &&
    hasPositiveNumber(value, 'width') && hasPositiveNumber(value, 'height');
}

function isPointer(value: unknown): value is PointerPosition {
  return isRecord(value) && hasNumber(value, 'x') && hasNumber(value, 'y');
}

function hasOnlyKeys(value: Record<string, unknown>, keys: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => keys.has(key));
}

function isLocator(value: unknown): value is Locator {
  if (!isRecord(value) || !hasNumber(value, 'confidence') || typeof value.type !== 'string') return false;
  if (value.type === 'role') {
    return hasString(value, 'role') && hasString(value, 'name') &&
      hasOnlyKeys(value, locatorRoleKeys);
  }
  return ['testId', 'label', 'text', 'css'].includes(value.type) && hasString(value, 'value') &&
    hasOnlyKeys(value, locatorValueKeys);
}

function isLocators(value: unknown): value is Locator[] {
  return Array.isArray(value) && value.every(isLocator);
}

function isTarget(value: unknown): value is TargetDescriptor {
  return isRecord(value) && (value.role === null || hasString(value, 'role')) &&
    hasString(value, 'accessibleName') && hasString(value, 'text') && hasString(value, 'tagName') &&
    isBox(value.boundingBox) && value.boundingBox.width > 0 && value.boundingBox.height > 0 &&
    isLocators(value.locators) && (value.value === undefined || typeof value.value === 'string') &&
    hasOnlyKeys(value, targetKeys);
}

function isCallout(value: Record<string, unknown>): boolean {
  const anchor = value.anchor;
  return isRecord(anchor) && typeof anchor.stepId === 'string' && anchor.stepId.length > 0 &&
    isLocators(anchor.locators) && hasOnlyKeys(anchor, anchorKeys) &&
    typeof value.text === 'string' && value.text.trim().length > 0 && value.placement === 'auto' &&
    hasOnlyKeys(value, calloutKeys);
}

function isComment(value: Record<string, unknown>): boolean {
  const anchor = value.anchor;
  return isRecord(anchor) && typeof anchor.stepId === 'string' && anchor.stepId.length > 0 &&
    isLocators(anchor.locators) && typeof anchor.mediaTimeMs === 'number' && Number.isFinite(anchor.mediaTimeMs) &&
    anchor.mediaTimeMs >= 0 &&
    hasOnlyKeys(anchor, commentAnchorKeys) && typeof value.body === 'string' && value.body.trim().length > 0 &&
    hasOnlyKeys(value, commentKeys);
}

function isPositiveDimensions(value: unknown, keys: readonly string[]): value is Record<string, number> {
  if (!isRecord(value)) return false;
  return keys.every((key) => {
    const dimension = value[key];
    return typeof dimension === 'number' && Number.isFinite(dimension) && dimension > 0;
  });
}

function hasValidIdentity(value: Record<string, unknown>): boolean {
  if (typeof value.recordingId !== 'string' || value.recordingId.trim().length === 0 ||
      typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt)) ||
      new Date(value.createdAt).toISOString() !== value.createdAt || typeof value.url !== 'string' ||
      typeof value.origin !== 'string' || !hasNumber(value, 'sessionEpoch')) return false;
  try {
    const url = new URL(value.url);
    const origin = new URL(value.origin);
    return (url.protocol === 'http:' || url.protocol === 'https:') &&
      (origin.protocol === 'http:' || origin.protocol === 'https:') &&
      url.origin === value.origin && origin.origin === value.origin;
  } catch {
    return false;
  }
}

function hasValidMedia(value: unknown): boolean {
  return isRecord(value) && typeof value.mimeType === 'string' && value.mimeType.length > 0 &&
    typeof value.hasAudio === 'boolean' && typeof value.durationMs === 'number' &&
    Number.isFinite(value.durationMs) && value.durationMs >= 0;
}

function hasValidApp(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return ['commit', 'version', 'environment'].every((key) => {
    const field = value[key];
    return field === null || (typeof field === 'string' && field.length > 0);
  });
}

export function parseTraceEvent(input: unknown): Result<ParsedTraceEvent> {
  if (!isRecord(input) || input.v !== 1) return { ok: false, error: 'trace event must have v: 1' };
  if (!hasString(input, 'type') || !eventTypes.has(input.type as TraceEventType)) return { ok: false, error: 'unknown trace event type' };
  if (!hasString(input, 'id') || !hasNumber(input, 't') || !hasString(input, 'stepId') || !hasString(input, 'route')) {
    return { ok: false, error: 'trace event envelope is invalid' };
  }
  if (!isViewport(input.viewport) || !isScroll(input.scroll)) return { ok: false, error: 'trace event coordinates are invalid' };
  if ((input.type === 'interaction.hover' && !isPointer(input.pointer)) ||
      (input.type === 'interaction.click' && input.pointer !== undefined && !isPointer(input.pointer))) {
    return { ok: false, error: 'pointer sample is invalid' };
  }
  if (input.type === 'interaction.hover' && 'target' in input) return { ok: false, error: 'hover sample is invalid' };
  if (input.type === 'annotation.callout' && !isCallout(input)) {
    return { ok: false, error: 'callout annotation is invalid' };
  }
  if (input.type === 'annotation.comment' && !isComment(input)) {
    return { ok: false, error: 'comment annotation is invalid' };
  }
  if (input.type === 'system.clockSync' &&
      (!hasNumber(input, 'contentClockMs') || !hasNumber(input, 'workerClockMs') || !hasNumber(input, 'mediaTimeMs'))) {
    return { ok: false, error: 'clock sync readings are invalid' };
  }
  if (input.type === 'annotation.redaction' &&
      (typeof input.selector !== 'string' || input.selector.length === 0 || typeof input.instanceId !== 'string' ||
       input.instanceId.length === 0 || typeof input.visible !== 'boolean' ||
       (input.visible ? !isBox(input.box) : input.box !== undefined) ||
       Object.keys(input).some((key) => !redactionKeys.has(key)))) {
    return { ok: false, error: 'redaction sample is invalid' };
  }
  if (input.target !== undefined && !isTarget(input.target)) return { ok: false, error: 'trace event target is invalid' };
  return { ok: true, value: input as ParsedTraceEvent };
}

export function parseRecordingMeta(input: unknown): Result<RecordingMeta> {
  if (!isRecord(input) || input.schemaVersion !== 1) return { ok: false, error: 'metadata must have schemaVersion: 1' };
  if (!hasValidIdentity(input)) {
    return { ok: false, error: 'metadata identity is invalid' };
  }
  if (!isPositiveDimensions(input.viewport, ['width', 'height', 'dpr']) ||
      !isPositiveDimensions(input.capture, ['width', 'height', 'fps'])) {
    return { ok: false, error: 'metadata dimensions are invalid' };
  }
  if (!hasValidMedia(input.media)) {
    return { ok: false, error: 'metadata media is invalid' };
  }
  if (!isRecord(input.privacy) || typeof input.privacy.maskInputValues !== 'boolean' ||
      input.privacy.captureNetwork !== false || !Array.isArray(input.privacy.maskedSelectors) ||
      !input.privacy.maskedSelectors.every((item) => typeof item === 'string') ||
      (input.privacy.visualRedactionSelectors !== undefined &&
       (!Array.isArray(input.privacy.visualRedactionSelectors) ||
        !input.privacy.visualRedactionSelectors.every((item) => typeof item === 'string' && item.length > 0)))) {
    return { ok: false, error: 'metadata privacy is invalid' };
  }
  if (!hasValidApp(input.app)) return { ok: false, error: 'metadata app is invalid' };
  return { ok: true, value: input as RecordingMeta };
}
