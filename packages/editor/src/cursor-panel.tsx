import { useEditorStore } from './store';

export function CursorPanel() {
  const bundle = useEditorStore((state) => state.bundle);
  const settings = useEditorStore((state) => state.cursorSettings);
  const update = useEditorStore((state) => state.updateCursorSettings);
  const hasPointer = bundle?.events.some((event) =>
    (event.type === 'interaction.hover' || event.type === 'interaction.click') && event.pointer) ?? false;
  return <div className="cursor-controls"><strong>CURSOR</strong>{hasPointer ? <>
    <label><input aria-label="Enable cursor" type="checkbox" checked={settings.enabled}
      onChange={(event) => update({ enabled: event.currentTarget.checked })}/>enabled</label>
    <label>smoothing <input aria-label="Cursor smoothing" type="range" min="0" max="100"
      value={settings.smoothing * 100} onChange={(event) => update({ smoothing: Number(event.currentTarget.value) / 100 })}/></label>
    <output>{Math.round(settings.smoothing * 100)}%</output>
    <label>size <input aria-label="Cursor size" type="range" min="12" max="48" value={settings.size}
      onChange={(event) => update({ size: Number(event.currentTarget.value) })}/></label><output>{settings.size}px</output>
    <label><input aria-label="Enable click ripple" type="checkbox" checked={settings.ripple}
      onChange={(event) => update({ ripple: event.currentTarget.checked })}/>ripple</label>
    <label>idle <input aria-label="Cursor idle hide milliseconds" type="number" min="0" max="5000" step="100"
      value={settings.idleMs} onChange={(event) => update({ idleMs: Number(event.currentTarget.value) })}/></label><output>{settings.idleMs}ms</output>
  </> : <span>No pointer data captured.</span>}</div>;
}
