import { useEditorStore } from './store';

export function RedactionsPanel() {
  const redactions = useEditorStore((state) => state.redactions);
  const toggleRedaction = useEditorStore((state) => state.toggleRedaction);
  const deleteRedaction = useEditorStore((state) => state.deleteRedaction);
  return <div className="redaction-controls"><span>REDACTIONS</span>{redactions.length ? redactions.map((redaction) =>
    <span className="redaction-control" key={redaction.selector}><label><input type="checkbox" checked={redaction.enabled}
      onChange={() => toggleRedaction(redaction.selector)}/><code>{redaction.selector}</code></label>
      <button type="button" aria-label={`Delete redaction ${redaction.selector}`}
        onClick={() => deleteRedaction(redaction.selector)}>Delete</button></span>) : <span>none captured</span>}</div>;
}
