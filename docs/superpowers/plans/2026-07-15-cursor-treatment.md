# Cursor Treatment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture real pointer samples and render configurable smoothing, size, click ripple, and idle hiding in preview and every export format.

**Architecture:** Extend v1 trace events with an optional viewport point, sampled by the content script at no more than 30Hz. Derive one deterministic smoothed capture-space path in the editor and use it both for animation-frame preview and FFmpeg image-overlay expressions.

**Tech Stack:** TypeScript, React, Zustand, browser Canvas, ffmpeg.wasm, Vitest, Playwright

---

### Task 1: Pointer trace and capture

**Files:**
- Modify: `packages/trace/src/schema.ts`
- Modify: `packages/trace/src/schema.test.ts`
- Create: `packages/extension/src/pointer.ts`
- Create: `packages/extension/src/pointer.test.ts`
- Modify: `packages/extension/src/content.ts`
- Modify: `packages/extension/e2e/capture.spec.ts`

- [ ] **Step 1: Write failing schema and throttle tests**

Add tests proving:

```ts
expect(parseTraceEvent({ ...envelope, type: 'interaction.hover', pointer: { x: 12, y: 34 } }).ok).toBe(true);
expect(parseTraceEvent({ ...envelope, type: 'interaction.hover' })).toEqual({ ok: false, error: 'pointer sample is invalid' });
expect(parseTraceEvent({ ...envelope, type: 'interaction.click' }).ok).toBe(true);
expect(parseTraceEvent({ ...envelope, type: 'interaction.click', pointer: { x: NaN, y: 2 } })).toEqual({ ok: false, error: 'pointer sample is invalid' });
expect(shouldSamplePointer(100, 133)).toBe(false);
expect(shouldSamplePointer(100, 134)).toBe(true);
```

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm --filter @cutscene/trace test -- schema.test.ts
pnpm --filter @cutscene/extension test -- pointer.test.ts
```

Expected: FAIL because pointer validation and the throttle helper do not exist.

- [ ] **Step 3: Implement the minimum schema and sampler**

Add `PointerPosition`, a required pointer-bearing `interaction.hover` event, and
an optional pointer on `interaction.click`. Validate finite x/y when pointer is
required or present. Keep old pointer-less clicks valid.

In `pointer.ts` export:

```ts
export const POINTER_SAMPLE_INTERVAL_MS = 1000 / 30;
export function shouldSamplePointer(lastAt: number, now: number): boolean {
  return now - lastAt >= POINTER_SAMPLE_INTERVAL_MS;
}
```

In the content script, extend `emit` with an optional point. Record exact
`clientX/clientY` on clicks. Listen to mouse-only `pointermove`, emit
`interaction.hover` only while capture is ready and the throttle passes, and
reset the last-sample time on session start/stop.

- [ ] **Step 4: Extend and run the capture E2E**

Move the Playwright mouse across at least five known points during recording.
Assert hover samples exist, contain only finite pointer coordinates and no
target/text/value, consecutive sample times respect the interval within 1ms,
and the click pointer matches the scripted click point inside its target box.

Run: `pnpm --filter @cutscene/extension e2e`

Expected: one capture test passes.

- [ ] **Step 5: Commit**

```bash
git add packages/trace/src/schema.ts packages/trace/src/schema.test.ts packages/extension/src/pointer.ts packages/extension/src/pointer.test.ts packages/extension/src/content.ts packages/extension/e2e/capture.spec.ts
git commit -m "feat(extension): capture real pointer samples"
```

### Task 2: Cursor model, controls, and smooth preview

**Files:**
- Create: `packages/editor/src/cursor.ts`
- Create: `packages/editor/src/cursor.test.ts`
- Create: `packages/editor/src/cursor-panel.tsx`
- Modify: `packages/editor/src/store.ts`
- Modify: `packages/editor/src/timeline.tsx`
- Modify: `packages/editor/src/video.tsx`
- Modify: `packages/editor/src/style.css`

- [ ] **Step 1: Write failing cursor-model tests**

Test these public behaviours:

```ts
expect(DEFAULT_CURSOR_SETTINGS).toEqual({ enabled: true, smoothing: .7, size: 24, ripple: true, idleMs: 1200 });
expect(deriveCursorSamples(events, clock, capture)).toMatchObject([
  { timeMs: 100, x: 300, y: 200, click: false },
  { timeMs: 200, x: 450, y: 250, click: true },
]);
expect(smoothCursorSamples(path, 1).find(({ click }) => click)).toMatchObject({ x: 450, y: 250 });
expect(cursorAt(path, 150, { ...DEFAULT_CURSOR_SETTINGS, smoothing: 0 })).toMatchObject({ x: 375, y: 225, visible: true });
expect(cursorAt(path, 1500, { ...DEFAULT_CURSOR_SETTINGS, idleMs: 500 })?.visible).toBe(false);
expect(cursorAt(path, 350, DEFAULT_CURSOR_SETTINGS)?.rippleProgress).toBeCloseTo(.375);
```

Also test camera mapping at rest and peak zoom, malformed settings clamping, and
merged idle ranges.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @cutscene/editor test -- cursor.test.ts`

Expected: FAIL because `cursor.ts` does not exist.

- [ ] **Step 3: Implement the deterministic model and store state**

Create `CursorSettings`, `CursorSample`, `DEFAULT_CURSOR_SETTINGS`,
`deriveCursorSamples`, `smoothCursorSamples`, `cursorAt`, `cursorVisibleRanges`,
and `mapCursorToOutput`. Reuse `mapBoxToCapture`, the media clock, `cameraAt`,
and `cameraMatrix`. Preserve click samples exactly during smoothing.

Add `cursorSettings` and `updateCursorSettings(patch)` to Zustand. Clamp
smoothing 0-1, size 12-48, and idleMs 0-5000. Do not persist or add another
storage format.

- [ ] **Step 4: Add the controls and animation-frame preview**

Mount a `CURSOR` row after `BRAND`. If there are no pointer events, render
`No pointer data captured.` Otherwise render accessible enabled, smoothing,
size, ripple, and idle controls. Increase only the fixed desktop timeline row
enough to show the new line.

In `VideoView`, derive/smooth the path when bundle or smoothing changes. Add a
cursor SVG and ripple element outside `.video-transform`. Update their position,
size, visibility, and ripple scale/opacity inside the existing animation-frame
sync so motion is not limited by Zustand's 50ms playhead publishing interval.

- [ ] **Step 5: Run GREEN and commit**

Run:

```bash
pnpm --filter @cutscene/editor test -- cursor.test.ts timeline.test.ts
pnpm --filter @cutscene/editor typecheck
```

Expected: focused tests and typecheck pass.

```bash
git add packages/editor/src/cursor.ts packages/editor/src/cursor.test.ts packages/editor/src/cursor-panel.tsx packages/editor/src/store.ts packages/editor/src/timeline.tsx packages/editor/src/video.tsx packages/editor/src/style.css
git commit -m "feat(editor): preview cursor treatment"
```

### Task 3: Cursor overlays in every export

**Files:**
- Create: `packages/editor/src/cursor-render.ts`
- Create: `packages/editor/src/cursor-export.ts`
- Create: `packages/editor/src/cursor-export.test.ts`
- Modify: `packages/editor/src/export.ts`
- Modify: `packages/editor/src/export.test.ts`
- Modify: `packages/editor/src/App.tsx`

- [ ] **Step 1: Write failing expression and export tests**

Test that a two-point path produces a shallow clamped-ramp expression rather
than nested per-point `if`, merged idle ranges produce the expected enable
expression, click phases cover `[0,.1)`, `[.1,.2)`, `[.2,.3)`, `[.3,.4]`, and
rest/peak/portrait output positions match numeric camera calculations.

Extend export-plan tests to assert dynamic cursor x/y/enable expressions appear
after callout/watermark overlays, before brand concat and the single GIF palette.
Assert a no-pointer or disabled cursor produces the exact existing plan.

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm --filter @cutscene/editor test -- cursor-export.test.ts export.test.ts
```

Expected: FAIL because cursor rendering/export helpers do not exist.

- [ ] **Step 3: Render five reusable PNG assets**

In `cursor-render.ts`, draw one cold-grey arrow with dark outline and four amber
ring phases with increasing diameter and decreasing alpha. Return PNG bytes and
plain Canvas/encoding errors. Size is final output pixels.

- [ ] **Step 4: Build dynamic overlays without deep nesting**

In `cursor-export.ts`, build the pointer coordinate expression as:

```text
v0 + (v1-v0)*clip((t-t0)/(t1-t0),0,1) + ...
```

Use FFmpeg `min(max(value,0),1)` for clip. Map capture-space pointer expressions
through the existing zoom or portrait crop expressions. Return one dynamic
arrow overlay plus four 100ms ring overlays per click, reusing the five asset
files. Merged idle ranges control arrow visibility.

Extend `ExportOverlay` to accept numeric or expression x/y and an explicit
enable expression. Keep existing numeric callout/watermark command strings
unchanged. Prepare/write cursor assets in `exportRecording`, append cursor
overlays after existing overlays, and pass settings from `App`.

- [ ] **Step 5: Run GREEN and commit**

Run:

```bash
pnpm --filter @cutscene/editor test -- cursor-export.test.ts export.test.ts cursor.test.ts
pnpm --filter @cutscene/editor typecheck
```

Expected: focused tests and typecheck pass.

```bash
git add packages/editor/src/cursor-render.ts packages/editor/src/cursor-export.ts packages/editor/src/cursor-export.test.ts packages/editor/src/export.ts packages/editor/src/export.test.ts packages/editor/src/App.tsx
git commit -m "feat(editor): export cursor treatment"
```

### Task 4: Measured capture and export evidence

**Files:**
- Modify: `STATUS.md`
- Local ignored artifacts: `artifacts/phase3-cursor-bundle/`, `artifacts/phase3-cursor.gif`, `artifacts/phase3-cursor.mp4`, `artifacts/phase3-cursor-9x16.mp4`, `artifacts/screenshots/phase3-cursor-*.png`

- [ ] **Step 1: Record a known path on TodoMVC**

Run the real extension for at least six seconds. Move through known coordinates,
click near an element edge, then stop moving for longer than the configured idle
delay. Save the complete bundle.

- [ ] **Step 2: Report trace measurements**

Measure recording duration, hover sample count, maximum observed sample rate,
precise click coordinate error, and absence of target/text/value on hover events.

- [ ] **Step 3: Export and inspect all formats**

Load the bundle in the real editor, set a non-default size and idle delay, and
export GIF, MP4, and 9:16 MP4 through the browser UI. Extract movement, click,
ripple-phase, and idle frames. Measure rendered pointer-tip error, cursor size,
ripple duration, and the first frame on which idle hiding occurs.

- [ ] **Step 4: Record evidence without closing Phase 3**

Mark only `cursor treatment` complete in `STATUS.md`. Keep Phase 3 active because
repeat use on a different project is still required.

- [ ] **Step 5: Run full verification and handoff**

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm e2e
git diff --check
```

Run final independent spec/code/Ponytail review, fix all Critical and Important
findings with failing regressions, commit evidence, and push `phase-3`. Do not
open a PR.
