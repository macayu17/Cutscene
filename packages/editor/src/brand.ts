export type BrandFont = 'mono' | 'sans' | 'serif';

export type BrandPreset = {
  id: string;
  name: string;
  color: string;
  font: BrandFont;
  intro: string;
  outro: string;
  watermark: string;
};

export type BrandState = {
  brandPresets: BrandPreset[];
  selectedBrandId: string | null;
};

export const BRAND_STORAGE_KEY = 'cutscene.brand.v1';

const COLOR = /^#[0-9A-Fa-f]{6}$/;
const STATE_KEYS = ['brandPresets', 'selectedBrandId'];
const PRESET_KEYS = ['color', 'font', 'id', 'intro', 'name', 'outro', 'watermark'];

export function brandFontFamily(font: BrandFont): string {
  if (font === 'mono') return '"IBM Plex Mono", monospace';
  if (font === 'sans') return '"IBM Plex Sans", sans-serif';
  return 'Georgia, serif';
}

export function watermarkLayout(frame: { width: number; height: number }) {
  const inset = Math.round(Math.max(frame.width, frame.height) * .02 / 10) * 10;
  const width = Math.floor(frame.width * .24 / 10) * 10;
  const height = Math.round(Math.min(92, Math.max(68, frame.height * .048)));
  return { x: frame.width - inset - width, y: frame.height - inset - height, width, height };
}

export function emptyBrandState(): BrandState {
  return { brandPresets: [], selectedBrandId: null };
}

export function parseBrandState(raw: string | null): BrandState {
  if (raw === null) return emptyBrandState();
  try {
    const value: unknown = JSON.parse(raw);
    if (!hasExactKeys(value, STATE_KEYS) || !Array.isArray(value.brandPresets)) return emptyBrandState();
    const brandPresets = value.brandPresets.map(parsePreset);
    if (brandPresets.some((preset) => preset === null)) return emptyBrandState();
    const validPresets = brandPresets as BrandPreset[];
    if (new Set(validPresets.map(({ id }) => id)).size !== validPresets.length) return emptyBrandState();
    const selectedBrandId = value.selectedBrandId;
    if (selectedBrandId !== null && (typeof selectedBrandId !== 'string' || !validPresets.some((preset) => preset.id === selectedBrandId))) {
      return emptyBrandState();
    }
    return { brandPresets: validPresets, selectedBrandId };
  } catch {
    return emptyBrandState();
  }
}

export function serializeBrandState(state: BrandState): string {
  return JSON.stringify(state);
}

export function addBrandPreset(state: BrandState, id: string): BrandState {
  if (!id.trim() || state.brandPresets.some((preset) => preset.id === id)) {
    return { brandPresets: state.brandPresets, selectedBrandId: state.selectedBrandId };
  }
  const preset: BrandPreset = {
    id,
    name: `Preset ${state.brandPresets.length + 1}`,
    color: '#1E2126',
    font: 'mono',
    intro: '',
    outro: '',
    watermark: '',
  };
  return { brandPresets: [...state.brandPresets, preset], selectedBrandId: id };
}

export function updateBrandPreset(state: BrandState, id: string, patch: Partial<Omit<BrandPreset, 'id'>>): BrandState {
  return {
    brandPresets: state.brandPresets.map((preset) => preset.id === id ? {
      ...preset,
      ...(typeof patch.name === 'string' ? { name: patch.name.trim() || 'Untitled' } : {}),
      ...(typeof patch.color === 'string' && COLOR.test(patch.color) ? { color: patch.color } : {}),
      ...(isBrandFont(patch.font) ? { font: patch.font } : {}),
      ...(typeof patch.intro === 'string' ? { intro: patch.intro.trim() } : {}),
      ...(typeof patch.outro === 'string' ? { outro: patch.outro.trim() } : {}),
      ...(typeof patch.watermark === 'string' ? { watermark: patch.watermark.trim() } : {}),
    } : preset),
    selectedBrandId: state.selectedBrandId,
  };
}

export function selectBrandPreset(state: BrandState, id: string | null): BrandState {
  return {
    brandPresets: state.brandPresets,
    selectedBrandId: id !== null && state.brandPresets.some((preset) => preset.id === id) ? id : null,
  };
}

export function deleteBrandPreset(state: BrandState, id: string): BrandState {
  return {
    brandPresets: state.brandPresets.filter((preset) => preset.id !== id),
    selectedBrandId: state.selectedBrandId === id ? null : state.selectedBrandId,
  };
}

export function selectedBrandPreset(state: BrandState): BrandPreset | null {
  return state.brandPresets.find((preset) => preset.id === state.selectedBrandId) ?? null;
}

function parsePreset(value: unknown): BrandPreset | null {
  if (!hasExactKeys(value, PRESET_KEYS)
    || typeof value.id !== 'string'
    || !value.id.trim()
    || typeof value.name !== 'string'
    || typeof value.color !== 'string'
    || !COLOR.test(value.color)
    || !isBrandFont(value.font)
    || typeof value.intro !== 'string'
    || typeof value.outro !== 'string'
    || typeof value.watermark !== 'string') return null;
  return {
    id: value.id,
    name: value.name.trim() || 'Untitled',
    color: value.color,
    font: value.font,
    intro: value.intro.trim(),
    outro: value.outro.trim(),
    watermark: value.watermark.trim(),
  };
}

function hasExactKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
    && Object.keys(value).sort().join('\0') === keys.join('\0');
}

function isBrandFont(value: unknown): value is BrandFont {
  return value === 'mono' || value === 'sans' || value === 'serif';
}
