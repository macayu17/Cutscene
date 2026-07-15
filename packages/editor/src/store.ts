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
  load: (bundle: BundleData, mediaUrl: string, media?: File) => void;
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
};

const creator = (set: StoreApi<EditorState>['setState']): EditorState => ({
  ...readBrandState(),
  bundle: null, mediaUrl: null, media: null, segments: [], callouts: [], redactions: [], redactionBoxes: [], selectedSegmentId: null,
  selectedEventId: null, hoveredEventId: null, playheadMs: 0, exportProgress: null, exportError: null,
  selectionStartMs: null, selectionEndMs: null,
  cursorSettings: DEFAULT_CURSOR_SETTINGS,
  load: (bundle, mediaUrl, media) => set({ bundle, mediaUrl, ...(media ? { media } : {}),
    segments: automaticSegments(bundle.events, bundle.clock, bundle.meta.viewport), callouts: [],
    redactions: deriveRedactions(bundle.meta, bundle.events),
    redactionBoxes: deriveRedactionIntervals(bundle.events, bundle.clock, bundle.meta.media.durationMs), playheadMs: 0,
    selectedEventId: null, hoveredEventId: null, selectedSegmentId: null }),
  selectEvent: (selectedEventId, playheadMs) => set({ selectedEventId, playheadMs }),
  hoverEvent: (hoveredEventId) => set({ hoveredEventId }),
  setPlayhead: (playheadMs) => set({ playheadMs }),
  setBound: (bound) => set((state) => bound === 'start' ? { selectionStartMs: state.playheadMs } : { selectionEndMs: state.playheadMs }),
  selectSegment: (selectedSegmentId) => set({ selectedSegmentId }),
  addSegment: () => set((state) => state.bundle ? { segments: addSegment(state.segments, state.playheadMs, state.bundle.meta.viewport) } : {}),
  deleteSegment: () => set((state) => state.selectedSegmentId ? { segments: deleteSegment(state.segments, state.selectedSegmentId), selectedSegmentId: null } : {}),
  retimeSegment: (startMs, endMs) => set((state) => state.selectedSegmentId ? { segments: retimeSegment(state.segments, state.selectedSegmentId, startMs, endMs) } : {}),
  retargetSegment: () => set((state) => {
    if (!state.bundle || !state.selectedSegmentId || !state.selectedEventId) return {};
    const event = eventById(state.bundle.events, state.selectedEventId);
    if (!event?.target) return {};
    const derived = deriveZoomSegments([{ t: state.bundle.clock.toMediaTime(event.t), box: event.target.boundingBox, scroll: event.scroll,
      viewport: event.viewport }], state.bundle.meta.viewport)[0];
    return derived ? { segments: retargetSegment(state.segments, state.selectedSegmentId, event.id, derived.focus, event.viewport) } : {};
  }),
  addCallout: () => set((state) => {
    if (!state.bundle || !state.selectedEventId) return {};
    const event = eventById(state.bundle.events, state.selectedEventId);
    const segment = state.segments.find(({ eventId }) => eventId === state.selectedEventId);
    return event && segment ? { callouts: addCalloutEdit(state.callouts, event, segment) } : {};
  }),
  updateCallout: (id, text) => set((state) => ({ callouts: updateCalloutEdit(state.callouts, id, text) })),
  deleteCallout: (id) => set((state) => ({ callouts: deleteCalloutEdit(state.callouts, id) })),
  toggleRedaction: (selector) => set((state) => ({ redactions: toggleRedactionEdit(state.redactions, selector) })),
  deleteRedaction: (selector) => set((state) => ({ redactions: deleteRedactionEdit(state.redactions, selector) })),
  setExport: (exportProgress, exportError = null) => set({ exportProgress, exportError }),
  addBrandPreset: () => set((state) => persistBrandState(addBrandPresetEdit(state, crypto.randomUUID()))),
  updateBrandPreset: (id, patch) => set((state) => persistBrandState(updateBrandPresetEdit(state, id, patch))),
  selectBrandPreset: (id) => set((state) => persistBrandState(selectBrandPresetEdit(state, id))),
  deleteBrandPreset: (id) => set((state) => persistBrandState(deleteBrandPresetEdit(state, id))),
  updateCursorSettings: (patch) => set((state) => ({ cursorSettings: updateCursorSettingsEdit(state.cursorSettings, patch) })),
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
