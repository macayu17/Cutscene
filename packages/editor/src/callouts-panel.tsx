import { eventById, useEditorStore } from './store';

export function CalloutsPanel() {
  const bundle = useEditorStore((state) => state.bundle);
  const segments = useEditorStore((state) => state.segments);
  const callouts = useEditorStore((state) => state.callouts);
  const selectedEventId = useEditorStore((state) => state.selectedEventId);
  const addCallout = useEditorStore((state) => state.addCallout);
  const updateCallout = useEditorStore((state) => state.updateCallout);
  const deleteCallout = useEditorStore((state) => state.deleteCallout);
  if (!bundle) return null;
  const event = eventById(bundle.events, selectedEventId);
  const callout = callouts.find(({ sourceEventId }) => sourceEventId === selectedEventId);
  const canAdd = Boolean(event?.target && segments.some(({ eventId }) => eventId === selectedEventId) && !callout);
  return <div className="callout-controls">
    <button type="button" disabled={!canAdd} onClick={addCallout}>Add callout</button>
    <label>text <input type="text" value={callout?.text ?? ''} disabled={!callout}
      onChange={(input) => callout && updateCallout(callout.id, input.currentTarget.value)}/></label>
    <button type="button" disabled={!callout} onClick={() => callout && deleteCallout(callout.id)}>Delete</button>
    <span>{callout ? `anchor · ${event?.target?.accessibleName || event?.stepId}` : 'select a zoomed event'}</span>
  </div>;
}
