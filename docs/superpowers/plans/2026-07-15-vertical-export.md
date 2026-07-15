# Vertical 9:16 Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a separate 1080×1920 MP4 export that smoothly crops and pans the recorded raster around active traced elements.

**Architecture:** Reuse the existing zoom segments and cubic strength timing, but derive a fixed exact-ratio portrait crop instead of applying segment zoom. Redactions stay in capture space before the crop; callouts are mapped through the crop and drawn in portrait output space.

**Tech Stack:** TypeScript, React, Vitest, ffmpeg.wasm, existing Zustand editor state

---

### Task 1: Shared portrait crop math

**Files:**
- Modify: `packages/editor/src/camera.ts`
- Test: `packages/editor/src/camera.test.ts`

- [ ] **Step 1: Write failing crop tests**

Add tests for the exact crop, cubic midpoint, focus peak, and edge clamp:

```ts
expect(portraitCropAt(0, [], { width: 1920, height: 1080 }))
  .toEqual({ x: 663, y: 12, width: 594, height: 1056 });
expect(portraitCropAt(1_675, [segment], { width: 1920, height: 1080 }).x)
  .toBeCloseTo(825);
expect(portraitCropAt(2_000, [{ ...segment, focus: { x: 0, y: 0, width: 320, height: 200 } }],
  { width: 1920, height: 1080 }).y).toBe(0);
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `pnpm --filter @cutscene/editor test -- camera.test.ts`

Expected: FAIL because `portraitCropAt` does not exist.

- [ ] **Step 3: Implement the minimum crop helper**

Add to `camera.ts`:

```ts
export type CropRect = { x: number; y: number; width: number; height: number };

export function portraitCropAt(timeMs: number, segments: readonly EditableSegment[], capture: Size): CropRect {
  const unit = Math.floor(Math.min(capture.width / 9, capture.height / 16) / 2) * 2;
  if (unit < 2) throw new Error('Capture is too small for 9:16 export.');
  const width = unit * 9;
  const height = unit * 16;
  const segment = segments.find((candidate) => timeMs >= candidate.startMs && timeMs <= candidate.endMs);
  const strength = segment ? segmentStrength(segment, timeMs) : 0;
  const focus = segment ? mapBoxToCapture(segment.focus, segment.viewport, capture) : null;
  const centerX = capture.width / 2 + strength * ((focus ? focus.x + focus.width / 2 : capture.width / 2) - capture.width / 2);
  const centerY = capture.height / 2 + strength * ((focus ? focus.y + focus.height / 2 : capture.height / 2) - capture.height / 2);
  return { x: Math.min(Math.max(centerX - width / 2, 0), capture.width - width),
    y: Math.min(Math.max(centerY - height / 2, 0), capture.height - height), width, height };
}
```

- [ ] **Step 4: Run GREEN**

Run: `pnpm --filter @cutscene/editor test -- camera.test.ts`

Expected: all camera tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/editor/src/camera.ts packages/editor/src/camera.test.ts
git commit -m "feat(editor): add portrait crop camera"
```

### Task 2: Map callouts through the portrait crop

**Files:**
- Modify: `packages/editor/src/callouts.ts`
- Test: `packages/editor/src/callouts.test.ts`

- [ ] **Step 1: Write the failing portrait-layout test**

```ts
const crop = portraitCropAt(segment.clickMs, [segment], { width: 1920, height: 1080 });
const layout = calloutLayout(event, segment, { width: 1920, height: 1080 },
  { width: 1080, height: 1920 }, calloutSize({ width: 1080, height: 1920 }), crop);
expect(layout?.card.x).toBeGreaterThanOrEqual(0);
expect(layout?.card.y).toBeGreaterThanOrEqual(0);
expect((layout?.card.x ?? 0) + (layout?.card.width ?? 0)).toBeLessThanOrEqual(1080);
expect((layout?.card.y ?? 0) + (layout?.card.height ?? 0)).toBeLessThanOrEqual(1920);
```

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @cutscene/editor test -- callouts.test.ts`

Expected: FAIL because `calloutLayout` does not accept a crop.

- [ ] **Step 3: Add the crop-space branch**

Extend `calloutLayout` with `crop?: CropRect`. When supplied, map the capture box directly:

```ts
const target = crop ? {
  x: (captureBox.x - crop.x) / crop.width * output.width,
  y: (captureBox.y - crop.y) / crop.height * output.height,
  width: captureBox.width / crop.width * output.width,
  height: captureBox.height / crop.height * output.height,
} : existingTarget;
```

Keep the existing 16:9 path byte-for-byte equivalent.

- [ ] **Step 4: Run GREEN**

Run: `pnpm --filter @cutscene/editor test -- callouts.test.ts`

Expected: all callout tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/editor/src/callouts.ts packages/editor/src/callouts.test.ts
git commit -m "feat(editor): place callouts in portrait crop"
```

### Task 3: Build and expose the vertical MP4 export

**Files:**
- Modify: `packages/editor/src/export.ts`
- Modify: `packages/editor/src/App.tsx`
- Test: `packages/editor/src/export.test.ts`

- [ ] **Step 1: Write failing export-plan tests**

```ts
const plan = buildExportPlan('vertical', segments, meta, [overlay], [redaction]);
const command = plan.args.join(' ');
expect(command).toContain('crop=594:1056');
expect(command).toContain('scale=1080:1920');
expect(command).toContain('setsar=1');
expect(command.indexOf('boxblur=')).toBeLessThan(command.indexOf('crop=594:1056'));
expect(command.indexOf('scale=1080:1920')).toBeLessThan(command.indexOf('[base][1:v]overlay='));
expect(plan.args).toEqual(expect.arrayContaining(['-map', '[out]', '-map', '0:a?']));
```

Also assert the existing GIF and MP4 test plans are unchanged.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @cutscene/editor test -- export.test.ts`

Expected: FAIL because `vertical` is not an export format.

- [ ] **Step 3: Add the portrait filter branch**

Extend `ExportFormat` with `vertical`. Add a filter builder that reuses the existing `strength(segment, 't')`, maps focus centres with `mapBoxToCapture`, clamps dynamic crop `x` and `y`, escapes expression commas, and returns:

```text
fps=60,crop=594:1056:x='...':y='...',scale=1080:1920:flags=lanczos,setsar=1
```

Use the existing redaction and overlay chains. Return `output.mp4`, H.264,
`yuv420p`, optional audio mapping, and `+faststart`.

In `exportRecording`, use `{ width: 1080, height: 1920 }` for vertical callouts and pass `portraitCropAt(segment.clickMs, [segment], meta.capture)` to `calloutLayout`.

In `App.tsx`, add:

```tsx
<button disabled={exportProgress !== null} onClick={() => void runExport('vertical')}>Export 9:16 MP4</button>
```

Download `vertical` using an `.mp4` suffix.

- [ ] **Step 4: Run GREEN and typecheck**

Run:

```bash
pnpm --filter @cutscene/editor test -- export.test.ts callouts.test.ts camera.test.ts
pnpm --filter @cutscene/editor typecheck
```

Expected: all focused tests and typecheck pass.

- [ ] **Step 5: Commit**

```bash
git add packages/editor/src/export.ts packages/editor/src/export.test.ts packages/editor/src/App.tsx
git commit -m "feat(editor): export intelligent 9:16 MP4"
```

### Task 4: Real export evidence and completion checks

**Files:**
- Modify: `STATUS.md`
- Local ignored artifacts: `artifacts/phase3-vertical.mp4`, `artifacts/screenshots/phase3-vertical-*.png`

- [ ] **Step 1: Build and export a real bundle**

Run the editor against the existing short Phase 3 bundle, create a vertical MP4 through the real browser UI, and save it as `artifacts/phase3-vertical.mp4`.

- [ ] **Step 2: Inspect the output**

Run:

```bash
ffprobe -v error -show_entries stream=width,height,avg_frame_rate,codec_name,pix_fmt -show_entries format=duration,size -of json artifacts/phase3-vertical.mp4
```

Expected: 1080×1920, 60 fps, H.264, yuv420p, playable duration and non-zero size.

Extract and inspect rest, peak-pan, and return frames. Confirm the active element remains inside the crop, motion reaches the expected centre, redaction remains attached, and callout is inside the portrait frame without covering its target.

- [ ] **Step 3: Record measured evidence**

Mark `9:16 intelligent crop export` complete in `STATUS.md` and record output dimensions, fps, duration, size, crop dimensions, sampled target-centre errors, and artifact paths. Keep Phase 3 active.

- [ ] **Step 4: Run full verification**

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm e2e
git diff --check
```

Expected: all commands pass.

- [ ] **Step 5: Review, commit, and push**

Perform an independent read-only code review, fix any Critical or Important findings with a failing regression test, then:

```bash
git add STATUS.md
git commit -m "docs: record vertical export evidence"
git push origin phase-3
```

Do not create a PR. Phase 3 remains active for brand presets, cursor treatment, and its external repeat-use exit criterion.
