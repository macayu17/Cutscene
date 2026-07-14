# Element-anchored Callouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add locally edited, element-anchored callouts that match in preview, GIF, and MP4.

**Architecture:** Keep callouts as editor state anchored by `stepId` and ranked locators, with the current event id as a local resolver. Put timing and placement in one pure editor module shared by React preview and export preparation; rasterize callout cards with native Canvas and overlay them after FFmpeg zoom rendering.

**Tech Stack:** TypeScript, React, Zustand, Canvas 2D, FFmpeg WASM, Vitest

---

### Task 1: Callout model, timing, and placement

**Files:**
- Create: `packages/editor/src/callouts.ts`
- Create: `packages/editor/src/callouts.test.ts`

- [ ] **Step 1: Write failing tests for the complete pure model**

Test that `addCallout` rejects events without targets or matching segments,
stores `stepId` and locators, and keeps one callout per step. Test
`calloutWindow` from click to zoom hold end. Test `placeCallout` chooses top,
falls back below near the top edge, never overlaps the target, and stays inside
the frame.

```ts
expect(addCallout([], event, segment)[0]).toMatchObject({
  sourceEventId: event.id,
  anchor: { stepId: event.stepId, locators: event.target?.locators },
  text: event.target?.accessibleName,
  placement: 'auto',
});
expect(calloutWindow(callout, [segment])).toEqual({ startMs: 2_000, endMs: 2_900 });
expect(placeCallout({ x: 400, y: 300, width: 100, height: 40 },
  { width: 1_000, height: 560 }, { width: 240, height: 72 })).toEqual({ x: 330, y: 216, width: 240, height: 72 });
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --filter @cutscene/editor test -- callouts.test.ts`
Expected: FAIL because `./callouts` does not exist.

- [ ] **Step 3: Implement the minimal pure model**

```ts
export type EditableCallout = {
  id: string;
  sourceEventId: string;
  anchor: { stepId: string; locators: Locator[] };
  text: string;
  placement: 'auto';
};

export function calloutWindow(callout: EditableCallout, segments: readonly EditableSegment[]) {
  const segment = segments.find(({ eventId }) => eventId === callout.sourceEventId);
  return segment ? { startMs: segment.clickMs, endMs: cameraTiming(segment).exitStartMs } : null;
}
```

Implement `addCallout`, `updateCallout`, `deleteCallout`, `activeCallout`, and
the top/bottom/right/left `placeCallout` search without adding configuration or
dependencies.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `pnpm --filter @cutscene/editor test -- callouts.test.ts`
Expected: all callout model tests pass.

### Task 2: Editor controls and preview

**Files:**
- Create: `packages/editor/src/callouts-panel.tsx`
- Modify: `packages/editor/src/store.ts`
- Modify: `packages/editor/src/timeline.tsx`
- Modify: `packages/editor/src/video.tsx`
- Modify: `packages/editor/src/style.css`
- Test: `packages/editor/src/callouts.test.ts`

- [ ] **Step 1: Add failing tests for target transformation**

Add a test for `calloutLayout(event, segment, capture, output, cardSize)` proving
that the recorded target is mapped through capture coordinates and the stable
click camera before placement.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @cutscene/editor test -- callouts.test.ts`
Expected: FAIL because `calloutLayout` is missing.

- [ ] **Step 3: Implement shared target transformation**

Use existing `mapBoxToCapture`, `cameraAt`, and `cameraMatrix`; transform all
four rectangle edges and pass the result to `placeCallout`.

- [ ] **Step 4: Wire minimal Zustand actions**

Add `callouts`, `selectedCalloutId`, `addCallout`, `updateCallout`, and
`deleteCallout`. Reset callouts on recording load. `addCallout` uses the current
selected event and its matching zoom segment.

- [ ] **Step 5: Add controls and preview**

Render `CalloutsPanel` below `SegmentsPanel`. Use one `Add callout` button, one
plain text input, and one `Delete` button. Render the active callout as a sibling
of `.video-transform`, using `calloutLayout` and a native `ResizeObserver`.
Use graphite fill, one amber anchor rule, no transition, and visible keyboard
focus.

- [ ] **Step 6: Verify focused tests, typecheck, and build**

Run:

```powershell
pnpm --filter @cutscene/editor test -- callouts.test.ts
pnpm --filter @cutscene/editor typecheck
pnpm --filter @cutscene/editor build
```

Expected: all commands exit `0`.

### Task 3: Export callout cards

**Files:**
- Create: `packages/editor/src/callout-render.ts`
- Create: `packages/editor/src/callout-render.test.ts`
- Modify: `packages/editor/src/export.ts`
- Modify: `packages/editor/src/export.test.ts`
- Modify: `packages/editor/src/App.tsx`

- [ ] **Step 1: Write failing tests for wrapping and FFmpeg overlays**

Test pure `wrapCalloutText` line wrapping. Extend export tests with one overlay
and assert an extra PNG input, `overlay=`, a bounded `between(t,...)` enable
expression, overlay-before-palette order for GIF, and `[out]` video mapping for
MP4.

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
pnpm --filter @cutscene/editor test -- callout-render.test.ts export.test.ts
```

Expected: FAIL because wrapping and overlay inputs are not implemented.

- [ ] **Step 3: Implement native Canvas rasterization**

`renderCalloutCard(text, { width, height })` creates a transparent canvas, draws
a square graphite panel, a 3px amber anchor rule, and at most three wrapped
monospace lines, then returns PNG bytes. No font or drawing dependency.

- [ ] **Step 4: Extend the export plan**

Add this optional input type:

```ts
export type ExportOverlay = {
  filename: string;
  x: number;
  y: number;
  startSeconds: number;
  endSeconds: number;
};
```

When overlays exist, build a filter chain from the zoomed base through each
`overlay=...:enable='between(t,start,end)':eof_action=repeat`. For GIF, generate
the single global palette after all overlays. For MP4, map filtered video and
optional source audio.

- [ ] **Step 5: Prepare callouts during export**

For each callout, resolve its event and segment, choose output-specific card
dimensions, compute `calloutLayout`, rasterize its PNG, write it to FFmpeg, and
pass its `ExportOverlay` to `buildExportPlan`. Update `App` to pass callouts and
events to `exportRecording`.

- [ ] **Step 6: Verify export tests, typecheck, and build**

Run:

```powershell
pnpm --filter @cutscene/editor test -- callout-render.test.ts export.test.ts
pnpm --filter @cutscene/editor typecheck
pnpm --filter @cutscene/editor build
```

Expected: all commands exit `0`.

### Task 4: Real browser and export proof

**Files:**
- Create locally: `artifacts/screenshots/phase3-callout-preview.png`
- Create locally: `artifacts/phase3-callout.mp4`
- Modify: `STATUS.md`

- [ ] **Step 1: Verify the real editor**

Load `artifacts/phase1-acceptance-v2`, select a click, add and edit a callout,
seek through its window, and capture the preview screenshot. Confirm the card
does not cover the amber target box or leave the video frame.

- [ ] **Step 2: Export a short MP4**

Export a short recording with the callout and inspect it with `ffprobe` and a
frame screenshot. Confirm the callout appears during the same hold interval as
preview.

- [ ] **Step 3: Record Phase 3 implementation status**

Add a `Phase 3 progress` section to `STATUS.md` marking element-anchored
callouts implemented while leaving the phase active; the Phase 3 exit criterion
still requires repeat real-world use.

### Task 5: Full verification and versioning

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run the full repository checks**

```powershell
pnpm test
pnpm typecheck
pnpm build
pnpm e2e
git diff --check
```

Expected: every command exits `0`.

- [ ] **Step 2: Commit and push**

```powershell
git add packages/editor STATUS.md docs/superpowers
git commit -m "feat: add element-anchored callouts"
git push -u origin phase-3
```
