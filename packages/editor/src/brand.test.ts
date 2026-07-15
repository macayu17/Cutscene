import { afterEach, expect, it, vi } from 'vitest';
import {
  BRAND_STORAGE_KEY,
  addBrandPreset,
  brandFontFamily,
  deleteBrandPreset,
  emptyBrandState,
  parseBrandState,
  selectBrandPreset,
  selectedBrandPreset,
  serializeBrandState,
  updateBrandPreset,
  watermarkLayout,
} from './brand';
import { createEditorStore } from './store';

afterEach(() => vi.unstubAllGlobals());

it('maps brand fonts and watermark bounds deterministically', () => {
  expect(brandFontFamily('mono')).toBe('"IBM Plex Mono", monospace');
  expect(brandFontFamily('sans')).toBe('"IBM Plex Sans", sans-serif');
  expect(brandFontFamily('serif')).toBe('Georgia, serif');
  expect(watermarkLayout({ width: 1920, height: 1080 })).toEqual({ x: 1420, y: 972, width: 460, height: 68 });
  expect(watermarkLayout({ width: 1080, height: 1920 })).toEqual({ x: 790, y: 1788, width: 250, height: 92 });
});

it('adds, selects, updates, and deletes presets consistently', () => {
  const first = addBrandPreset(emptyBrandState(), 'brand_1');
  const second = addBrandPreset(first, 'brand_2');

  expect(first).toEqual({
    brandPresets: [{
      id: 'brand_1', name: 'Preset 1', color: '#1E2126', font: 'mono', intro: '', outro: '', watermark: '',
    }],
    selectedBrandId: 'brand_1',
  });
  expect(second.brandPresets[1]?.name).toBe('Preset 2');
  expect(selectedBrandPreset(selectBrandPreset(second, 'brand_1'))?.id).toBe('brand_1');
  expect(selectBrandPreset(second, 'missing').selectedBrandId).toBeNull();

  const updated = updateBrandPreset(first, 'brand_1', {
    name: '  Docs  ', intro: '  Start  ', outro: '  End  ', watermark: '  ACME  ', color: '#336699', font: 'sans',
  });
  expect(updated.brandPresets[0]).toMatchObject({ name: 'Docs', intro: 'Start', outro: 'End', watermark: 'ACME', color: '#336699', font: 'sans' });
  expect(deleteBrandPreset(first, 'brand_1')).toEqual(emptyBrandState());
  expect(deleteBrandPreset(selectBrandPreset(second, 'brand_1'), 'brand_2').selectedBrandId).toBe('brand_1');
});

it('uses Untitled for a blank updated name and ignores an invalid colour', () => {
  const first = addBrandPreset(emptyBrandState(), 'brand_1');
  const updated = updateBrandPreset(first, 'brand_1', { name: '   ', color: 'red' });

  expect(updated.brandPresets[0]?.name).toBe('Untitled');
  expect(updated.brandPresets[0]?.color).toBe('#1E2126');
});

it('falls back to empty state for corrupt JSON and invalid or inexact shapes', () => {
  expect(parseBrandState('{broken')).toEqual(emptyBrandState());
  expect(parseBrandState(JSON.stringify({ brandPresets: [{ color: 'red' }], selectedBrandId: 'x' }))).toEqual(emptyBrandState());
  expect(parseBrandState(JSON.stringify({ brandPresets: [], selectedBrandId: null, extra: true }))).toEqual(emptyBrandState());
  expect(parseBrandState(JSON.stringify({
    brandPresets: [{ id: 'brand_1', name: 'Docs', color: '#336699', font: 'mono', intro: '', outro: '', watermark: '' }],
    selectedBrandId: 'missing',
  }))).toEqual(emptyBrandState());
});

it('rejects blank and duplicate preset ids', () => {
  const preset = { name: 'Docs', color: '#336699', font: 'mono', intro: '', outro: '', watermark: '' };
  expect(parseBrandState(JSON.stringify({
    brandPresets: [{ ...preset, id: '  ' }], selectedBrandId: null,
  }))).toEqual(emptyBrandState());
  expect(parseBrandState(JSON.stringify({
    brandPresets: [{ ...preset, id: 'same' }, { ...preset, id: 'same' }], selectedBrandId: 'same',
  }))).toEqual(emptyBrandState());

  const first = addBrandPreset(emptyBrandState(), 'same');
  expect(addBrandPreset(first, 'same')).toEqual(first);
  expect(addBrandPreset(first, '  ')).toEqual(first);
});

it('round trips valid state', () => {
  const state = addBrandPreset(emptyBrandState(), 'brand_1');
  expect(parseBrandState(serializeBrandState(state))).toEqual(state);
});

it('loads and persists brand state through editor store actions', () => {
  const saved = addBrandPreset(emptyBrandState(), 'saved');
  const values = new Map([[BRAND_STORAGE_KEY, serializeBrandState(saved)]]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  vi.stubGlobal('crypto', { randomUUID: () => 'created' });

  const store = createEditorStore();
  expect(store.getState()).toMatchObject(saved);
  store.getState().addBrandPreset();
  store.getState().updateBrandPreset('created', { name: ' New ' });
  store.getState().selectBrandPreset('saved');
  store.getState().deleteBrandPreset('created');

  expect(parseBrandState(values.get(BRAND_STORAGE_KEY) ?? null)).toEqual({
    brandPresets: [saved.brandPresets[0]], selectedBrandId: 'saved',
  });
});

it('reloads exact brand state after update and selection actions', () => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  vi.stubGlobal('crypto', { randomUUID: () => 'created' });

  const store = createEditorStore();
  store.getState().addBrandPreset();
  store.getState().updateBrandPreset('created', { name: 'Docs' });
  store.getState().selectBrandPreset('created');

  expect(createEditorStore().getState()).toMatchObject({
    brandPresets: [{
      id: 'created', name: 'Docs', color: '#1E2126', font: 'mono', intro: '', outro: '', watermark: '',
    }],
    selectedBrandId: 'created',
  });
});

it('survives unavailable or throwing storage', () => {
  vi.stubGlobal('localStorage', {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
  });
  vi.stubGlobal('crypto', { randomUUID: () => 'created' });

  const store = createEditorStore();
  expect(store.getState()).toMatchObject(emptyBrandState());
  expect(() => store.getState().addBrandPreset()).not.toThrow();
  expect(store.getState().selectedBrandId).toBe('created');
});
