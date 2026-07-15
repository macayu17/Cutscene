import { useEditorStore } from './store';
import type { BrandFont } from './brand';

export function BrandPanel() {
  const presets = useEditorStore((state) => state.brandPresets);
  const selectedId = useEditorStore((state) => state.selectedBrandId);
  const add = useEditorStore((state) => state.addBrandPreset);
  const update = useEditorStore((state) => state.updateBrandPreset);
  const select = useEditorStore((state) => state.selectBrandPreset);
  const remove = useEditorStore((state) => state.deleteBrandPreset);
  const selected = presets.find(({ id }) => id === selectedId) ?? null;
  return <div className="brand-controls" aria-label="Brand presets">
    <strong>BRAND</strong>
    <select aria-label="Brand preset" value={selectedId ?? ''} onChange={(event) => select(event.currentTarget.value || null)}>
      <option value="">unbranded / none</option>
      {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
    </select>
    <button type="button" onClick={add}>New</button>
    <button type="button" disabled={!selected} onClick={() => { if (selected) remove(selected.id); }}>Delete</button>
    {selected ? <>
      <input key={`${selected.id}-name`} aria-label="Preset name" defaultValue={selected.name} onChange={(event) => update(selected.id, { name: event.currentTarget.value })}/>
      <input aria-label="Brand colour" type="color" value={selected.color} onChange={(event) => update(selected.id, { color: event.currentTarget.value })}/>
      <select aria-label="Brand font" value={selected.font} onChange={(event) => update(selected.id, { font: event.currentTarget.value as BrandFont })}>
        <option value="mono">Mono</option><option value="sans">Sans</option><option value="serif">Serif</option>
      </select>
      <input key={`${selected.id}-intro`} aria-label="Intro text" placeholder="intro" defaultValue={selected.intro} onChange={(event) => update(selected.id, { intro: event.currentTarget.value })}/>
      <input key={`${selected.id}-outro`} aria-label="Outro text" placeholder="outro" defaultValue={selected.outro} onChange={(event) => update(selected.id, { outro: event.currentTarget.value })}/>
      <input key={`${selected.id}-watermark`} aria-label="Watermark text" placeholder="watermark" defaultValue={selected.watermark} onChange={(event) => update(selected.id, { watermark: event.currentTarget.value })}/>
    </> : null}
  </div>;
}
