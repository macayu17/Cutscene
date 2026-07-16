import type { BundleData } from './bundle';
import type { TraceEvent } from '@cutscene/trace';
import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { addSegment, automaticSegments, deleteSegment, retargetSegment, retimeSegment, type EditableSegment } from './segments';
import { deriveZoomSegments } from '@cutscene/trace';
import { addCallout as addCalloutEdit, deleteCallout as deleteCalloutEdit, updateCallout as updateCalloutEdit,
  type EditableCallout } from './callouts';
import { deleteRedaction as deleteRedactionEdit, deriveRedactionIntervals, deriveRedactions,
  toggleRedaction as toggleRedactionEdit, type EditableRedaction, type RedactionBox } from './redactions';
import { BRAND_STORAGE_KEY, addBrandPreset as addBrandPresetEdit, deleteBrandPreset as deleteBrandPresetEdit,
  emptyBrandState, parseBrandState, selectBrandPreset as selectBrandPresetEdit, serializeBrandState,
  updateBrandPreset as updateBrandPresetEdit, type BrandPreset, type BrandState } from './brand';
import { DEFAULT_CURSOR_SETTINGS, updateCursorSettings as updateCursorSettingsEdit, type CursorSettings } from './cursor';
import { parseCaptions, type CaptionCue } from '@cutscene/trace';
import { createTimelineDocument, type TimelineDocument } from './timeline-document';
import { connectTimelineSync, type TimelineConnection, type TimelineSyncStatus } from './timeline-sync';
import { loadSharedBrandKit, saveSharedBrandKit as saveBrandKit } from './brand-kit-sync';

export type BrandKitStatus = { state: 'idle' | 'syncing' | 'synced' } | { state: 'error'; error: string };

export type EditorState = {
  bundle: BundleData | null;
  mediaUrl: string | null;
  media: File | null;
  segments: EditableSegment[];
  callouts: EditableCallout[];
  redactions: EditableRedaction[];
  redactionBoxes: RedactionBox[];
  selectedSegmentId: string | null;
  selectedEventId: string | null;
  hoveredEventId: string | null;
  playheadMs: number;
  selectionStartMs: number | null;
  selectionEndMs: number | null;
  exportProgress: number | null;
  exportError: string | null;
  brandPresets: BrandPreset[];
  selectedBrandId: string | null;
  cursorSettings: CursorSettings;
  captions: CaptionCue[];
  captionError: string | null;
  timelineDocument: TimelineDocument | null;
  timelineConnection: TimelineConnection | null;
  timelineSyncStatus: TimelineSyncStatus;
  sharedReviewUrl: string | null;
  brandKitStatus: BrandKitStatus;
  loadCaptions: (text: string) => void;
  load: (bundle: BundleData, mediaUrl: string, media?: File) => void;
  releaseMedia: () => void;
  selectEvent: (id: string, mediaTimeMs: number) => void;
  hoverEvent: (id: string | null) => void;
  setPlayhead: (value: number) => void;
  setBound: (bound: 'start' | 'end') => void;
  selectSegment: (id: string | null) => void;
  addSegment: () => void;
  deleteSegment: () => void;
  retimeSegment: (startMs: number, endMs: number) => void;
  retargetSegment: () => void;
  addCallout: () => void;
  updateCallout: (id: string, text: string) => void;
  deleteCallout: (id: string) => void;
  toggleRedaction: (selector: string) => void;
  deleteRedaction: (selector: string) => void;
  setExport: (progress: number | null, error?: string | null) => void;
  addBrandPreset: () => void;
  updateBrandPreset: (id: string, patch: Partial<Omit<BrandPreset, 'id'>>) => void;
  selectBrandPreset: (id: string | null) => void;
  deleteBrandPreset: (id: string) => void;
  updateCursorSettings: (patch: Partial<CursorSettings>) => void;
  connectSharedTimeline: (ownerUrl: string) => Promise<void>;
  disconnectSharedTimeline: () => void;
  reloadSharedBrandKit: () => Promise<void>;
  saveSharedBrandKit: () => Promise<void>;
};

const creator = (set: StoreApi<EditorState>['setState'], get: StoreApi<EditorState>['getState']): EditorState => ({
  ...readBrandState(),
  bundle: null, mediaUrl: null, media: null, segments: [], callouts: [], redactions: [], redactionBoxes: [], selectedSegmentId: null,
  selectedEventId: null, hoveredEventId: null, playheadMs: 0, exportProgress: null, exportError: null,
  selectionStartMs: null, selectionEndMs: null,
  cursorSettings: DEFAULT_CURSOR_SETTINGS,
  captions: [], captionError: null,
  timelineDocument: null, timelineConnection: null, timelineSyncStatus: { state: 'idle' },
  sharedReviewUrl: null, brandKitStatus: { state: 'idle' },
  loadCaptions: (text) => set(() => {
    const parsed = parseCaptions(text);
    return parsed.ok ? { captions: parsed.value, captionError: null } : { captions: [], captionError: parsed.error };
  }),
  load: (bundle, mediaUrl, media) => {
    get().disconnectSharedTimeline();
    const previous = get().mediaUrl;
    set({ bundle, mediaUrl, ...(media ? { media } : {}), segments: automaticSegments(bundle.events, bundle.clock, bundle.meta.viewport),
      callouts: [], redactions: deriveRedactions(bundle.meta, bundle.events),
      redactionBoxes: deriveRedactionIntervals(bundle.events, bundle.clock, bundle.meta.media.durationMs), playheadMs: 0,
      captions: [], captionError: null,
      selectedEventId: null, hoveredEventId: null, selectedSegmentId: null });
    if (previous && previous !== mediaUrl) URL.revokeObjectURL(previous);
  },
  releaseMedia: () => {
    const mediaUrl = get().mediaUrl;
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    set({ mediaUrl: null, media: null });
  },
  selectEvent: (selectedEventId, playheadMs) => set({ selectedEventId, playheadMs }),
  hoverEvent: (hoveredEventId) => set({ hoveredEventId }),
  setPlayhead: (playheadMs) => set({ playheadMs }),
  setBound: (bound) => set((state) => bound === 'start' ? { selectionStartMs: state.playheadMs } : { selectionEndMs: state.playheadMs }),
  selectSegment: (selectedSegmentId) => set({ selectedSegmentId }),
  addSegment: () => {
    const state = get();
    if (!state.bundle) return;
    const segments = addSegment(state.segments, state.playheadMs, state.bundle.meta.viewport);
    const added = segments.find((segment) => !state.segments.some(({ id }) => id === segment.id));
    if (state.timelineDocument && added) state.timelineDocument.upsert({ kind: 'zoom', order: segments.indexOf(added), value: added });
    else set({ segments });
  },
  deleteSegment: () => {
    const state = get();
    if (!state.selectedSegmentId) return;
    if (state.timelineDocument) state.timelineDocument.remove('zoom', state.selectedSegmentId);
    else set({ segments: deleteSegment(state.segments, state.selectedSegmentId) });
    set({ selectedSegmentId: null });
  },
  retimeSegment: (startMs, endMs) => {
    const state = get();
    if (!state.selectedSegmentId) return;
    const segments = retimeSegment(state.segments, state.selectedSegmentId, startMs, endMs);
    const changed = segments.find(({ id }) => id === state.selectedSegmentId);
    if (state.timelineDocument && changed) state.timelineDocument.upsert({ kind: 'zoom', order: segments.indexOf(changed), value: changed });
    else set({ segments });
  },
  retargetSegment: () => {
    const state = get();
    if (!state.bundle || !state.selectedSegmentId || !state.selectedEventId) return;
    const event = eventById(state.bundle.events, state.selectedEventId);
    if (!event?.target) return;
    const derived = deriveZoomSegments([{ t: state.bundle.clock.toMediaTime(event.t), box: event.target.boundingBox, scroll: event.scroll,
      viewport: event.viewport }], state.bundle.meta.viewport)[0];
    if (!derived) return;
    const segments = retargetSegment(state.segments, state.selectedSegmentId, event.id, derived.focus, event.viewport);
    const changed = segments.find(({ id }) => id === state.selectedSegmentId);
    if (state.timelineDocument && changed) state.timelineDocument.upsert({ kind: 'zoom', order: segments.indexOf(changed), value: changed });
    else set({ segments });
  },
  addCallout: () => {
    const state = get();
    if (!state.bundle || !state.selectedEventId) return;
    const event = eventById(state.bundle.events, state.selectedEventId);
    const segment = state.segments.find(({ eventId }) => eventId === state.selectedEventId);
    if (!event || !segment) return;
    const callouts = addCalloutEdit(state.callouts, event, segment);
    const added = callouts.find((callout) => !state.callouts.some(({ id }) => id === callout.id));
    if (state.timelineDocument && added) state.timelineDocument.upsert({ kind: 'callout', order: callouts.indexOf(added), value: added });
    else set({ callouts });
  },
  updateCallout: (id, text) => {
    const state = get();
    const callouts = updateCalloutEdit(state.callouts, id, text);
    const changed = callouts.find((callout) => callout.id === id);
    if (state.timelineDocument && changed) state.timelineDocument.upsert({ kind: 'callout', order: callouts.indexOf(changed), value: changed });
    else set({ callouts });
  },
  deleteCallout: (id) => {
    const state = get();
    if (state.timelineDocument) state.timelineDocument.remove('callout', id);
    else set({ callouts: deleteCalloutEdit(state.callouts, id) });
  },
  toggleRedaction: (selector) => {
    const state = get();
    const redactions = toggleRedactionEdit(state.redactions, selector);
    const changed = redactions.find((redaction) => redaction.selector === selector);
    if (state.timelineDocument && changed) state.timelineDocument.upsert({ kind: 'redaction', order: redactions.indexOf(changed), value: changed });
    else set({ redactions });
  },
  deleteRedaction: (selector) => {
    const state = get();
    if (state.timelineDocument) state.timelineDocument.remove('redaction', selector);
    else set({ redactions: deleteRedactionEdit(state.redactions, selector) });
  },
  setExport: (exportProgress, exportError = null) => set({ exportProgress, exportError }),
  addBrandPreset: () => set((state) => persistBrandState(addBrandPresetEdit(state, crypto.randomUUID()))),
  updateBrandPreset: (id, patch) => set((state) => persistBrandState(updateBrandPresetEdit(state, id, patch))),
  selectBrandPreset: (id) => set((state) => persistBrandState(selectBrandPresetEdit(state, id))),
  deleteBrandPreset: (id) => set((state) => persistBrandState(deleteBrandPresetEdit(state, id))),
  updateCursorSettings: (patch) => set((state) => ({ cursorSettings: updateCursorSettingsEdit(state.cursorSettings, patch) })),
  connectSharedTimeline: async (ownerUrl) => {
    get().disconnectSharedTimeline();
    const state = get();
    const timelineDocument = createTimelineDocument();
    const seed = { segments: state.segments, callouts: state.callouts, redactions: state.redactions };
    const stopObserving = timelineDocument.observe(({ segments, callouts, redactions }) => set({ segments, callouts, redactions }));
    set({ timelineDocument, timelineSyncStatus: { state: 'syncing' } });
    const connected = await connectTimelineSync(ownerUrl, timelineDocument,
      (timelineSyncStatus) => set({ timelineSyncStatus }), { seed });
    if (!connected.ok) {
      stopObserving();
      timelineDocument.destroy();
      set({ timelineDocument: null, timelineConnection: null,
        timelineSyncStatus: { state: 'error', error: connected.error } });
      return;
    }
    if (get().timelineDocument !== timelineDocument) {
      connected.value.stop();
      stopObserving();
      timelineDocument.destroy();
      return;
    }
    const connection = connected.value;
    set({ timelineConnection: { ...connection, stop: () => { connection.stop(); stopObserving(); } },
      sharedReviewUrl: ownerUrl });
    await get().reloadSharedBrandKit();
  },
  disconnectSharedTimeline: () => {
    const state = get();
    state.timelineConnection?.stop();
    state.timelineDocument?.destroy();
    set({ timelineDocument: null, timelineConnection: null, timelineSyncStatus: { state: 'idle' },
      sharedReviewUrl: null, brandKitStatus: { state: 'idle' } });
  },
  reloadSharedBrandKit: async () => {
    const reviewUrl = get().sharedReviewUrl;
    if (!reviewUrl) return;
    set({ brandKitStatus: { state: 'syncing' } });
    const loaded = await loadSharedBrandKit(reviewUrl);
    if (!loaded.ok) { set({ brandKitStatus: { state: 'error', error: loaded.error } }); return; }
    if (loaded.value.length > 0) {
      const selectedBrandId = loaded.value.some(({ id }) => id === get().selectedBrandId)
        ? get().selectedBrandId : loaded.value[0]?.id ?? null;
      set({ ...persistBrandState({ brandPresets: loaded.value, selectedBrandId }), brandKitStatus: { state: 'synced' } });
      return;
    }
    set({ brandKitStatus: { state: 'synced' } });
  },
  saveSharedBrandKit: async () => {
    const state = get();
    if (!state.sharedReviewUrl) return;
    set({ brandKitStatus: { state: 'syncing' } });
    const saved = await saveBrandKit(state.sharedReviewUrl, state.brandPresets);
    set({ brandKitStatus: saved.ok ? { state: 'synced' } : { state: 'error', error: saved.error } });
  },
});

export function createEditorStore(): StoreApi<EditorState> { return createStore(creator); }
export const useEditorStore: UseBoundStore<StoreApi<EditorState>> = create(creator);

export function eventById(events: readonly TraceEvent[], id: string | null): TraceEvent | null {
  return id ? events.find((event) => event.id === id) ?? null : null;
}

function readBrandState(): BrandState {
  try {
    return parseBrandState(typeof localStorage === 'undefined' ? null : localStorage.getItem(BRAND_STORAGE_KEY));
  } catch {
    return emptyBrandState();
  }
}

function persistBrandState(state: BrandState): BrandState {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(BRAND_STORAGE_KEY, serializeBrandState(state));
  } catch {
    // Storage can be disabled without disabling in-memory editing.
  }
  return state;
}
