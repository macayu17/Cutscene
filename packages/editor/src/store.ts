import type { BundleData } from './bundle';
import type { TraceEvent } from '@cutscene/trace';
import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

export type EditorState = {
  bundle: BundleData | null;
  mediaUrl: string | null;
  selectedEventId: string | null;
  hoveredEventId: string | null;
  playheadMs: number;
  selectionStartMs: number | null;
  selectionEndMs: number | null;
  load: (bundle: BundleData, mediaUrl: string) => void;
  selectEvent: (id: string, mediaTimeMs: number) => void;
  hoverEvent: (id: string | null) => void;
  setPlayhead: (value: number) => void;
  setBound: (bound: 'start' | 'end') => void;
};

const creator = (set: StoreApi<EditorState>['setState']): EditorState => ({
  bundle: null, mediaUrl: null, selectedEventId: null, hoveredEventId: null, playheadMs: 0,
  selectionStartMs: null, selectionEndMs: null,
  load: (bundle, mediaUrl) => set({ bundle, mediaUrl, playheadMs: 0, selectedEventId: null, hoveredEventId: null }),
  selectEvent: (selectedEventId, playheadMs) => set({ selectedEventId, playheadMs }),
  hoverEvent: (hoveredEventId) => set({ hoveredEventId }),
  setPlayhead: (playheadMs) => set({ playheadMs }),
  setBound: (bound) => set((state) => bound === 'start' ? { selectionStartMs: state.playheadMs } : { selectionEndMs: state.playheadMs }),
});

export function createEditorStore(): StoreApi<EditorState> { return createStore(creator); }
export const useEditorStore: UseBoundStore<StoreApi<EditorState>> = create(creator);

export function eventById(events: readonly TraceEvent[], id: string | null): TraceEvent | null {
  return id ? events.find((event) => event.id === id) ?? null : null;
}
