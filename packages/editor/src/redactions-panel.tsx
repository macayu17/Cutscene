import { useEditorStore } from './store';

export function RedactionsPanel() {
  const redactions = useEditorStore((state) => state.redactions);
  const toggleRedaction = useEditorStore((state) => state.toggleRedaction);
  const deleteRedaction = useEditorStore((state) => state.deleteRedaction);
  return <div className="redaction-controls"><span>REDACTIONS</span>{redactions.length ? redactions.map((redaction) =>
    <label key={redaction.selector}><input type="checkbox" checked={redaction.enabled}
      onChange={() => toggleRedaction(redaction.selector)}/><code>{redaction.selector}</code>
      <button type="button" aria-label={`Delete redaction ${redaction.selector}`}
        onClick={() => deleteRedaction(redaction.selector)}>Delete</button></label>) : <span>none captured</span>}</div>;
}
