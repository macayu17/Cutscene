# Selector Redaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture configured CSS-selector geometry and render matching visual blur in editor preview, GIF, and MP4.

**Architecture:** Add one compact versioned redaction sample to the shared trace, emitted only when selector geometry changes. Derive editor tracks and time intervals with pure functions. Preview blurs inside the existing video transform; FFmpeg blurs source pixels before the existing zoom and callout stages.

**Tech Stack:** TypeScript, Chrome MV3 APIs, React, Zustand, CSS backdrop filters, ffmpeg.wasm, Vitest, Playwright.

---

### Task 1: Version the redaction trace sample

**Files:**
- Modify: `packages/trace/src/schema.ts`
- Modify: `packages/trace/src/schema.test.ts`

- [ ] Add a failing schema test for `annotation.redaction` with `selector`, `instanceId`, `visible`, and optional `box`; assert malformed selectors/visibility/boxes fail and old metadata still parses.
- [ ] Run `pnpm --filter @cutscene/trace test -- schema.test.ts` and confirm the new sample is rejected.
- [ ] Add `RedactionSampleEvent`, include it in `TraceEvent`, and add optional `visualRedactionSelectors` validation to `RecordingMeta.privacy`.
- [ ] Run the focused trace test and typecheck.

```ts
export type RedactionSampleEvent = EventEnvelope & {
  type: 'annotation.redaction';
  selector: string;
  instanceId: string;
  visible: boolean;
  box?: BoundingBox;
};
```

### Task 2: Capture configured selector geometry

**Files:**
- Modify: `packages/extension/control.html`
- Modify: `packages/extension/src/style.css`
- Modify: `packages/extension/src/control.ts`
- Modify: `packages/extension/src/background.ts`
- Modify: `packages/extension/src/content.ts`
- Modify: `packages/extension/src/offscreen.ts`
- Modify: `packages/extension/e2e/capture.spec.ts`

- [ ] Extend the capture E2E to enter `.todo-list li`, then assert metadata contains the selector and redaction samples contain boxes but no text/value/target.
- [ ] Run the focused E2E and confirm it fails before implementation.
- [ ] Pass trimmed newline-separated selectors through `recording.start` and `session.start`; validate them with `querySelectorAll` before tab capture begins.
- [ ] In the content script, assign stable instance ids with a `WeakMap`, compare visible boxes per animation frame, emit only appearances/moves/disappearances, and stop the loop with the session.
- [ ] Persist the configured list in `meta.privacy.visualRedactionSelectors` and rerun the E2E.

```ts
const selectors = input.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
```

### Task 3: Derive editable tracks and preview blur

**Files:**
- Create: `packages/editor/src/redactions.ts`
- Create: `packages/editor/src/redactions.test.ts`
- Create: `packages/editor/src/redactions-panel.tsx`
- Modify: `packages/editor/src/store.ts`
- Modify: `packages/editor/src/timeline.tsx`
- Modify: `packages/editor/src/video.tsx`
- Modify: `packages/editor/src/style.css`

- [ ] Write failing unit tests for track derivation, enable/delete edits, clock mapping, appearance/move/disappearance, and multiple instances.
- [ ] Run `pnpm --filter @cutscene/editor test -- redactions.test.ts` and confirm missing APIs fail.
- [ ] Implement `deriveRedactions`, `redactionBoxesAt`, `toggleRedaction`, `deleteRedaction`, and the smallest Zustand actions.
- [ ] Render active source-coordinate boxes inside `.video-transform` and add a compact selector row with enabled checkbox and Delete.
- [ ] Run focused tests, editor typecheck, and build.

```ts
export type EditableRedaction = { selector: string; enabled: boolean };
export type RedactionBox = { selector: string; instanceId: string; startMs: number; endMs: number; box: BoundingBox };
```

### Task 4: Blur before zoom in GIF and MP4

**Files:**
- Modify: `packages/editor/src/redactions.ts`
- Modify: `packages/editor/src/redactions.test.ts`
- Modify: `packages/editor/src/export.ts`
- Modify: `packages/editor/src/export.test.ts`
- Modify: `packages/editor/src/App.tsx`

- [ ] Add failing export-plan tests proving blur crop/overlay filters precede `zoompan`, callouts follow zoom, hidden samples produce no interval, and GIF palette generation remains last and singular.
- [ ] Compile enabled redaction boxes to source-capture coordinates and FFmpeg intervals.
- [ ] Build a source filter chain that splits, crops, box-blurs, and overlays each interval before the existing zoom filter; reuse the unchanged callout overlay chain afterward.
- [ ] Pass redactions and clock from `App`, then run focused tests, typecheck, and build.

```text
[0:v]split[clean][patch];[patch]crop=...,boxblur=10[blur];
[clean][blur]overlay=...:enable='between(t,start,end)'[redacted];
[redacted]fps=...,zoompan=...[base]
```

### Task 5: Measure, review, and version

**Files:**
- Modify: `STATUS.md`
- Modify: `README.md`

- [ ] Record a short real TodoMVC bundle with `.todo-list li`, including a scroll or element movement.
- [ ] Load it in the production editor and capture a preview screenshot with blur visible.
- [ ] Export GIF and MP4, inspect frames before and after movement, and record dimensions, rates, durations, and sizes in `STATUS.md`.
- [ ] Run `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm e2e`, and `git diff --check`.
- [ ] Review the complete diff for stale boxes, trace leakage, and preview/export ordering.
- [ ] Commit and push `phase-3` without creating a PR. Keep Phase 3 active because its repeat-use exit criterion is external.
