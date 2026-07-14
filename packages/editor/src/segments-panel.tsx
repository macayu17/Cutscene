import { useEditorStore } from './store';

export function SegmentsPanel() {
  const { bundle, segments, selectedSegmentId, selectedEventId, selectSegment, addSegment, deleteSegment, retimeSegment, retargetSegment } = useEditorStore();
  if (!bundle) return null;
  const selected = segments.find(({ id }) => id === selectedSegmentId);
  return <div className="segment-row">
    <div className="segment-lane" aria-label="Zoom segments">{segments.map((segment) => <button key={segment.id} className="segment"
      aria-pressed={segment.id === selectedSegmentId} aria-label={`Zoom from ${(segment.startMs / 1_000).toFixed(1)} to ${(segment.endMs / 1_000).toFixed(1)} seconds`}
      style={{ left: `${segment.startMs / bundle.meta.media.durationMs * 100}%`, width: `${Math.max(.5, (segment.endMs - segment.startMs) / bundle.meta.media.durationMs * 100)}%` }}
      onClick={() => selectSegment(segment.id)}/>)}</div>
    <div className="segment-controls"><button type="button" onClick={addSegment}>Add zoom</button><button type="button" disabled={!selected} onClick={deleteSegment}>Delete</button>
      <label>in <input type="number" min="0" step="100" value={selected?.startMs ?? 0} disabled={!selected} onChange={(event) => selected && retimeSegment(Number(event.currentTarget.value), selected.endMs)}/> ms</label>
      <label>out <input type="number" min="0" step="100" value={selected?.endMs ?? 0} disabled={!selected} onChange={(event) => selected && retimeSegment(selected.startMs, Number(event.currentTarget.value))}/> ms</label>
      <button type="button" disabled={!selected || !selectedEventId} onClick={retargetSegment}>Target selected event</button></div>
  </div>;
}
