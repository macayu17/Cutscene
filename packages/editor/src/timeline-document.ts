import * as Y from 'yjs';
import type { Locator } from '@cutscene/trace';
import type { EditableCallout } from './callouts';
import type { EditableRedaction } from './redactions';
import type { EditableSegment } from './segments';

export type TimelineState = {
  segments: EditableSegment[];
  callouts: EditableCallout[];
  redactions: EditableRedaction[];
};

export type TimelineItem =
  | { kind: 'zoom'; order: number; value: EditableSegment }
  | { kind: 'callout'; order: number; value: EditableCallout }
  | { kind: 'redaction'; order: number; value: EditableRedaction };

export type TimelineKind = TimelineItem['kind'];

export type TimelineDocument = {
  document: Y.Doc;
  read: () => TimelineState;
  initialize: (state: TimelineState) => void;
  upsert: (item: TimelineItem) => void;
  remove: (kind: TimelineKind, id: string) => void;
  observe: (listener: (state: TimelineState) => void) => () => void;
  onUpdate: (listener: (update: Uint8Array, local: boolean) => void) => () => void;
  encode: () => Uint8Array;
  applyRemote: (update: Uint8Array) => void;
  destroy: () => void;
};

const REMOTE = Symbol('remote timeline update');

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function box(value: unknown): value is EditableSegment['focus'] {
  return record(value) && finite(value.x) && finite(value.y) && finite(value.width) && value.width > 0 &&
    finite(value.height) && value.height > 0;
}

function viewport(value: unknown): value is EditableSegment['viewport'] {
  return record(value) && finite(value.width) && value.width > 0 && finite(value.height) && value.height > 0;
}

function locator(value: unknown): value is Locator {
  if (!record(value) || typeof value.type !== 'string' || !finite(value.confidence)) return false;
  if (value.type === 'role') return typeof value.role === 'string' && typeof value.name === 'string';
  return ['testId', 'label', 'text', 'css'].includes(value.type) && typeof value.value === 'string';
}

function itemId(item: TimelineItem): string {
  return item.kind === 'redaction' ? item.value.selector : item.value.id;
}

function write(map: Y.Map<unknown>, item: TimelineItem): void {
  map.set('kind', item.kind);
  map.set('id', itemId(item));
  map.set('order', item.order);
  if (item.kind === 'zoom') {
    map.set('eventId', item.value.eventId);
    map.set('startMs', item.value.startMs);
    map.set('clickMs', item.value.clickMs);
    map.set('endMs', item.value.endMs);
    map.set('focus', { ...item.value.focus });
    map.set('scale', item.value.scale);
    map.set('viewport', { ...item.value.viewport });
  } else if (item.kind === 'callout') {
    map.set('sourceEventId', item.value.sourceEventId);
    map.set('stepId', item.value.anchor.stepId);
    map.set('locators', item.value.anchor.locators.map((value) => ({ ...value })));
    map.set('text', item.value.text);
    map.set('placement', item.value.placement);
  } else {
    map.set('selector', item.value.selector);
    map.set('enabled', item.value.enabled);
  }
}

function readItem(map: Y.Map<unknown>): TimelineItem | null {
  const kind = map.get('kind');
  const id = map.get('id');
  const order = map.get('order');
  if (typeof id !== 'string' || !finite(order)) return null;
  if (kind === 'zoom') {
    const eventId = map.get('eventId');
    const startMs = map.get('startMs');
    const clickMs = map.get('clickMs');
    const endMs = map.get('endMs');
    const focus = map.get('focus');
    const scale = map.get('scale');
    const size = map.get('viewport');
    if ((eventId !== null && typeof eventId !== 'string') || !finite(startMs) || !finite(clickMs) ||
        !finite(endMs) || !box(focus) || !finite(scale) || !viewport(size)) return null;
    return { kind, order, value: {
      id, eventId, startMs, clickMs, endMs, focus: { ...focus }, scale, viewport: { ...size },
    } };
  }
  if (kind === 'callout') {
    const sourceEventId = map.get('sourceEventId');
    const stepId = map.get('stepId');
    const locators = map.get('locators');
    const text = map.get('text');
    if (typeof sourceEventId !== 'string' || typeof stepId !== 'string' || !Array.isArray(locators) ||
        !locators.every(locator) || typeof text !== 'string' || map.get('placement') !== 'auto') return null;
    return { kind, order, value: {
      id, sourceEventId, anchor: { stepId, locators: locators.map((value) => ({ ...value })) },
      text, placement: 'auto',
    } };
  }
  if (kind === 'redaction') {
    const selector = map.get('selector');
    const enabled = map.get('enabled');
    return typeof selector === 'string' && typeof enabled === 'boolean'
      ? { kind, order, value: { selector, enabled } } : null;
  }
  return null;
}

function mapFor(item: TimelineItem): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  write(map, item);
  return map;
}

function items(state: TimelineState): TimelineItem[] {
  return [
    ...state.segments.map((value, order): TimelineItem => ({ kind: 'zoom', order, value })),
    ...state.callouts.map((value, order): TimelineItem => ({ kind: 'callout', order, value })),
    ...state.redactions.map((value, order): TimelineItem => ({ kind: 'redaction', order, value })),
  ];
}

export function createTimelineDocument(): TimelineDocument {
  const document = new Y.Doc();
  const timeline = document.getArray<Y.Map<unknown>>('timeline');
  const read = (): TimelineState => {
    const parsed = timeline.toArray().map(readItem).filter((item): item is TimelineItem => item !== null);
    const ordered = <T extends TimelineItem>(values: T[]) => values.sort((left, right) => left.order - right.order);
    return {
      segments: ordered(parsed.filter((item): item is Extract<TimelineItem, { kind: 'zoom' }> => item.kind === 'zoom'))
        .map(({ value }) => value),
      callouts: ordered(parsed.filter((item): item is Extract<TimelineItem, { kind: 'callout' }> => item.kind === 'callout'))
        .map(({ value }) => value),
      redactions: ordered(parsed.filter((item): item is Extract<TimelineItem, { kind: 'redaction' }> => item.kind === 'redaction'))
        .map(({ value }) => value),
    };
  };
  return {
    document,
    read,
    initialize: (state) => {
      if (timeline.length > 0) return;
      const initial = items(state).map(mapFor);
      if (initial.length > 0) document.transact(() => timeline.insert(0, initial));
    },
    upsert: (item) => document.transact(() => {
      const existing = timeline.toArray().find((map) => map.get('kind') === item.kind && map.get('id') === itemId(item));
      if (existing) write(existing, item);
      else timeline.push([mapFor(item)]);
    }),
    remove: (kind, id) => document.transact(() => {
      const index = timeline.toArray().findIndex((map) => map.get('kind') === kind && map.get('id') === id);
      if (index >= 0) timeline.delete(index, 1);
    }),
    observe: (listener) => {
      const handler = () => listener(read());
      timeline.observeDeep(handler);
      return () => timeline.unobserveDeep(handler);
    },
    onUpdate: (listener) => {
      const handler = (update: Uint8Array, origin: unknown) => listener(update, origin !== REMOTE);
      document.on('update', handler);
      return () => document.off('update', handler);
    },
    encode: () => Y.encodeStateAsUpdate(document),
    applyRemote: (update) => Y.applyUpdate(document, update, REMOTE),
    destroy: () => document.destroy(),
  };
}
