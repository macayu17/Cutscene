# Local Brand Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add named local export presets for colour, built-in font, intro, outro, and text watermark without changing unbranded exports.

**Architecture:** Keep validated preset data in Zustand and `localStorage`. Render brand text with the existing browser Canvas-to-PNG pattern, then reuse the current FFmpeg image-input and overlay path; concatenate optional fixed-duration cards before the existing final GIF palette or MP4 encode.

**Tech Stack:** React, TypeScript, Zustand, browser Canvas, localStorage, ffmpeg.wasm, Vitest

---

### Task 1: Validated local preset state

**Files:**
- Create: `packages/editor/src/brand.ts`
- Create: `packages/editor/src/brand.test.ts`
- Modify: `packages/editor/src/store.ts`

- [ ] **Step 1: Write failing model tests**

Test the desired public API:

```ts
const first = addBrandPreset(emptyBrandState(), 'brand_1');
expect(first.selectedBrandId).toBe('brand_1');
expect(first.brandPresets[0]).toMatchObject({ name: 'Preset 1', color: '#1E2126', font: 'mono' });
expect(updateBrandPreset(first, 'brand_1', { name: '  Docs  ', color: '#336699' }).brandPresets[0]?.name).toBe('Docs');
expect(deleteBrandPreset(first, 'brand_1')).toEqual(emptyBrandState());
expect(parseBrandState('{broken')).toEqual(emptyBrandState());
expect(parseBrandState(JSON.stringify({ brandPresets: [{ color: 'red' }], selectedBrandId: 'x' }))).toEqual(emptyBrandState());
expect(parseBrandState(serializeBrandState(first))).toEqual(first);
```

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @cutscene/editor test -- brand.test.ts`

Expected: FAIL because `brand.ts` does not exist.

- [ ] **Step 3: Implement the minimum model**

Create `BrandFont`, `BrandPreset`, and `BrandState`, plus:

```ts
export const BRAND_STORAGE_KEY = 'cutscene.brand.v1';
export function emptyBrandState(): BrandState;
export function parseBrandState(raw: string | null): BrandState;
export function serializeBrandState(state: BrandState): string;
export function addBrandPreset(state: BrandState, id: string): BrandState;
export function updateBrandPreset(state: BrandState, id: string, patch: Partial<Omit<BrandPreset, 'id'>>): BrandState;
export function selectBrandPreset(state: BrandState, id: string | null): BrandState;
export function deleteBrandPreset(state: BrandState, id: string): BrandState;
export function selectedBrandPreset(state: BrandState): BrandPreset | null;
```

Validate exact keys and values at the localStorage boundary. Accept only
`#RRGGBB` colours and `mono`, `sans`, or `serif`. Trim text on update, using
`Untitled` for a blank name. Do not add a generic schema library.

Add `brandPresets`, `selectedBrandId`, `addBrandPreset`, `updateBrandPreset`,
`selectBrandPreset`, and `deleteBrandPreset` to `EditorState`. Read once from
localStorage when the store is created and write after each brand action. Keep
brand state unchanged when a recording loads. Guard unavailable or throwing
localStorage with the empty state.

- [ ] **Step 4: Run GREEN**

Run: `pnpm --filter @cutscene/editor test -- brand.test.ts && pnpm --filter @cutscene/editor typecheck`

Expected: brand tests and typecheck pass.

- [ ] **Step 5: Commit**

```bash
git add packages/editor/src/brand.ts packages/editor/src/brand.test.ts packages/editor/src/store.ts
git commit -m "feat(editor): persist local brand presets"
```

### Task 2: Brand editor row and preview watermark

**Files:**
- Create: `packages/editor/src/brand-panel.tsx`
- Modify: `packages/editor/src/timeline.tsx`
- Modify: `packages/editor/src/video.tsx`
- Modify: `packages/editor/src/style.css`

- [ ] **Step 1: Write a failing layout test**

Add to `brand.test.ts`:

```ts
expect(brandFontFamily('mono')).toBe('"IBM Plex Mono", monospace');
expect(brandFontFamily('sans')).toBe('"IBM Plex Sans", sans-serif');
expect(brandFontFamily('serif')).toBe('Georgia, serif');
expect(watermarkLayout({ width: 1920, height: 1080 })).toEqual({ x: 1420, y: 972, width: 460, height: 68 });
expect(watermarkLayout({ width: 1080, height: 1920 })).toEqual({ x: 790, y: 1788, width: 250, height: 92 });
```

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @cutscene/editor test -- brand.test.ts`

Expected: FAIL because the font and layout helpers do not exist.

- [ ] **Step 3: Implement helpers and controls**

Add `brandFontFamily(font)` and a deterministic `watermarkLayout(frame)` to
`brand.ts`. Use a 2% frame inset, a width near 24% of the frame, and a bounded
height; return integer output pixels matching the assertions.

Create a `BrandPanel` which reads the brand actions from Zustand and renders:

```tsx
<div className="brand-controls" aria-label="Brand presets">
  <strong>BRAND</strong>
  <select aria-label="Brand preset">...</select>
  <button type="button">New</button>
  <button type="button" disabled={!selected}>Delete</button>
  {selected ? <><input aria-label="Preset name"/><input aria-label="Brand colour" type="color"/>
    <select aria-label="Brand font">...</select><input aria-label="Intro text"/>
    <input aria-label="Outro text"/><input aria-label="Watermark text"/></> : null}
</div>
```

Generate ids with `crypto.randomUUID()`. Fields update immediately. Mount the
panel after `RedactionsPanel`. Add a lower-right `.brand-watermark` in
`VideoView`, outside `.video-transform`, only when the selected watermark is
non-empty. Style the row with the same borders, sizes, and cold graphite colours
as the existing edit rows. Use the preset colour only on the watermark itself.

- [ ] **Step 4: Run GREEN**

Run: `pnpm --filter @cutscene/editor test -- brand.test.ts && pnpm --filter @cutscene/editor typecheck`

Expected: tests and typecheck pass.

- [ ] **Step 5: Commit**

```bash
git add packages/editor/src/brand.ts packages/editor/src/brand.test.ts packages/editor/src/brand-panel.tsx packages/editor/src/timeline.tsx packages/editor/src/video.tsx packages/editor/src/style.css
git commit -m "feat(editor): edit and preview brand presets"
```

### Task 3: Render and export brand assets

**Files:**
- Create: `packages/editor/src/brand-render.ts`
- Modify: `packages/editor/src/export.ts`
- Modify: `packages/editor/src/export.test.ts`
- Modify: `packages/editor/src/App.tsx`

- [ ] **Step 1: Write failing export-plan tests**

Use metadata with `media: { durationMs: 3_000, hasAudio: true }`, a watermark
overlay, and `{ introFilename: 'intro.png', outroFilename: 'outro.png',
introSeconds: 1.5, outroSeconds: 1.5 }`. Assert:

```ts
expect(command).toContain('-loop 1 -t 1.5 -i intro.png');
expect(command).toContain('-loop 1 -t 1.5 -i outro.png');
expect(command).toContain('concat=n=3:v=1:a=0');
expect(command).toContain('adelay=1500:all=1,apad=pad_dur=1.5[audio]');
expect(plan.args).toEqual(expect.arrayContaining(['-map', '[audio]']));
expect(command.indexOf('overlay=')).toBeLessThan(command.indexOf('concat=n=3'));
expect(command.match(/palettegen/g)).toHaveLength(1);
```

Keep the current unbranded GIF, MP4, and vertical assertions unchanged.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @cutscene/editor test -- export.test.ts`

Expected: FAIL because branded card inputs are not supported.

- [ ] **Step 3: Add Canvas renderers and the smallest filter branch**

In `brand-render.ts`, export:

```ts
export async function renderBrandCard(text: string, preset: BrandPreset, size: Size): Promise<Uint8Array>;
export async function renderBrandWatermark(text: string, preset: BrandPreset, size: Size): Promise<Uint8Array>;
```

Use browser Canvas and `toBlob('image/png')`, the existing font-family mapping,
centred card text, and a transparent watermark canvas. Choose `#16181C` or
`#FFFFFF` text by relative luminance against the preset colour. Throw the same
plain Canvas/PNG errors used by callout rendering.

Extend `ExportMeta` with optional media duration/audio fields and add:

```ts
export type BrandExportCards = {
  introFilename?: string;
  outroFilename?: string;
  introSeconds: number;
  outroSeconds: number;
};
```

Pass optional cards as the final `buildExportPlan` argument. Only the branded
branch adds looped PNG inputs and a video-only concat. Apply redaction and
camera first, callouts and watermark next, then concatenate cards. Generate the
GIF palette after concat. For MP4 with source audio, delay audio by intro time
and pad it by outro time; without cards, retain the existing optional audio map
exactly.

Extend `exportRecording` with `brand: BrandPreset | null`. Render non-empty
intro/outro at the selected output size, and render the watermark at
`watermarkLayout(outputSize)`. Write those PNGs beside current callout PNGs.
Pass the watermark through `ExportOverlay` for the full source duration and the
cards through `BrandExportCards`.

In `App.tsx`, pass `selectedBrandPreset({ brandPresets, selectedBrandId })` to
all three export formats. Do not change filenames or button labels.

- [ ] **Step 4: Run GREEN**

Run: `pnpm --filter @cutscene/editor test -- export.test.ts brand.test.ts && pnpm --filter @cutscene/editor typecheck`

Expected: focused tests and typecheck pass.

- [ ] **Step 5: Commit**

```bash
git add packages/editor/src/brand-render.ts packages/editor/src/export.ts packages/editor/src/export.test.ts packages/editor/src/App.tsx
git commit -m "feat(editor): export local brand presets"
```

### Task 4: Real evidence and handoff

**Files:**
- Modify: `STATUS.md`
- Local ignored artifacts: `artifacts/phase3-brand.gif`, `artifacts/phase3-brand.mp4`, `artifacts/phase3-brand-9x16.mp4`, `artifacts/screenshots/phase3-brand-*.png`

- [ ] **Step 1: Verify persistence in the real editor**

Create two named presets, reload the editor, and confirm both remain selectable
and the selected preset remains selected.

- [ ] **Step 2: Export all three formats through the browser UI**

Use a preset with non-empty intro, outro, and watermark. Save the resulting GIF,
MP4, and 9:16 MP4 under the artifact paths above.

- [ ] **Step 3: Measure and inspect**

Use `ffprobe` for dimensions, codec, fps, duration, size, and audio start/duration.
Extract intro, source, and outro frames. Confirm the watermark is inside the
safe area, does not move with zoom/crop, and the source audio begins 1.5 seconds
after the intro.

- [ ] **Step 4: Record evidence without closing Phase 3**

Mark only `local brand presets` complete in `STATUS.md` and add measured values,
persistence results, and artifact paths. Keep Phase 3 active for cursor treatment
and repeat use on another project.

- [ ] **Step 5: Run full verification**

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm e2e
git diff --check
```

- [ ] **Step 6: Review, commit, and push**

Run independent spec and code-quality reviews, fix all Critical and Important
findings with a failing regression test, commit the evidence, and push
`phase-3`. Do not open a PR.
