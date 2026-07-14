import type { BundleData } from './bundle';
import type { TraceEvent } from '@cutscene/trace';
import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { addSegment, automaticSegments, deleteSegment, retargetSegment, retimeSegment, type EditableSegment } from './segments';
import { deriveZoomSegments } from '@cutscene/trace';

export type EditorState = {
  bundle: BundleData | null;
  mediaUrl: string | null;
  media: File | null;
  segments: EditableSegment[];
  selectedSegmentId: string | null;
  selectedEventId: string | null;
  hoveredEventId: string | null;
  playheadMs: number;
  selectionStartMs: number | null;
  selectionEndMs: number | null;
  exportProgress: number | null;
  exportError: string | null;
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
  setExport: (progress: number | null, error?: string | null) => void;
};

const creator = (set: StoreApi<EditorState>['setState']): EditorState => ({
  bundle: null, mediaUrl: null, media: null, segments: [], selectedSegmentId: null,
  selectedEventId: null, hoveredEventId: null, playheadMs: 0, exportProgress: null, exportError: null,
  selectionStartMs: null, selectionEndMs: null,
  load: (bundle, mediaUrl, media) => set({ bundle, mediaUrl, ...(media ? { media } : {}),
    segments: automaticSegments(bundle.events, bundle.clock, bundle.meta.viewport), playheadMs: 0,
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
  setExport: (exportProgress, exportError = null) => set({ exportProgress, exportError }),
});

export function createEditorStore(): StoreApi<EditorState> { return createStore(creator); }
export const useEditorStore: UseBoundStore<StoreApi<EditorState>> = create(creator);

export function eventById(events: readonly TraceEvent[], id: string | null): TraceEvent | null {
  return id ? events.find((event) => event.id === id) ?? null : null;
}
