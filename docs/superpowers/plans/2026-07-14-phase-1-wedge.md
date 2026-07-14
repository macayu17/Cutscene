# Phase 1 Wedge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture the complete v1 semantic trace, edit element-locked zooms, and export a legible sub-3 MB README GIF.

**Architecture:** A pnpm workspace contains a DOM-free `trace` library, a small MV3 capture extension, and a single-page local editor. Capture and playback share trace, clock, coordinate, privacy, and zoom rules; browser APIs own recording/storage and ffmpeg.wasm owns export.

**Tech Stack:** TypeScript, pnpm, Vite, MV3, React, Zustand, Vitest, Playwright, ffmpeg.wasm, plain CSS.

---

### Task 1: Workspace and trace contract

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`
- Create: `packages/trace/package.json`, `packages/trace/tsconfig.json`
- Create: `packages/trace/src/index.ts`, `packages/trace/src/schema.ts`
- Test: `packages/trace/src/schema.test.ts`

- [ ] Write a failing schema test that parses every Phase 1 event type, requires `v: 1`, and round-trips `meta.json`.
- [ ] Run `pnpm --filter @cutscene/trace test`; expect failure because the schema API is absent.
- [ ] Implement strict discriminated v1 types plus small runtime parsers returning `{ ok, value } | { ok, error }`; no schema dependency.
- [ ] Run the trace test; expect pass.
- [ ] Commit `feat(trace): add versioned recording schema`.

### Task 2: Privacy, locators, clocks, coordinates, and zooms

**Files:**
- Create: `packages/trace/src/privacy.ts`, `locators.ts`, `clock.ts`, `coordinates.ts`, `zoom.ts`
- Test: matching `*.test.ts` files in `packages/trace/src/`

- [ ] Write failing tests proving passwords never produce targets, values are `[MASKED]`, sensitive text is masked, and explicit unmask selectors are narrow.
- [ ] Implement one event-construction privacy function and run its test to green.
- [ ] Write failing tests for descending locator confidence and CSS-last ordering; implement the minimum DOM-observation-to-locator function and run green.
- [ ] Write failing clock-fit tests with offset, drift, and invalid marker sets; implement least-squares mapping and run green.
- [ ] Write failing coordinate tests for equal-size, scaled, and letterboxed captures plus scroll staleness; implement one central transform and run green.
- [ ] Write failing zoom tests for padding/aspect, 2.5x cap, 320 CSS px floor, pre/post timing, merge, and scroll suppression; implement deterministic derivation and run green.
- [ ] Run `pnpm --filter @cutscene/trace test && pnpm --filter @cutscene/trace typecheck`; expect all pass.
- [ ] Commit `feat(trace): add semantic capture models`.

### Task 3: Production capture extension

**Files:**
- Create: `packages/extension/package.json`, `tsconfig.json`, `vite.config.ts`, `manifest.ts`
- Create: `packages/extension/control.html`, `offscreen.html`
- Create: `packages/extension/src/background.ts`, `content.ts`, `control.ts`, `offscreen.ts`, `storage.ts`, `messages.ts`, `style.css`
- Test: `packages/extension/e2e/capture.spec.ts`

- [ ] Write a failing Playwright assertion for a bundle containing `media.webm`, `trace.jsonl`, `meta.json`, all Phase 1 event kinds exercised by the fixture, ranked locators, scroll, app-null fields, and no raw input secret.
- [ ] Configure the minimal MV3 extension with `activeTab`, `tabCapture`, `offscreen`, `storage`, and downloads permissions.
- [ ] Adapt the proven Phase 0 stream-ID/offscreen recorder flow without importing the spike.
- [ ] Emit complete safe trace events for start/stop, sync, navigation, click, input, scroll, and resize; use the shared trace constructors.
- [ ] Store finalized bundles in native IndexedDB and expose disk downloads.
- [ ] Run `pnpm --filter @cutscene/extension typecheck && pnpm --filter @cutscene/extension build`.
- [ ] Run the focused Playwright capture; expect a playable recording and complete safe trace.
- [ ] Commit `feat(extension): capture versioned recording bundles`.

### Task 4: Editor and trace lane

**Files:**
- Create: `packages/editor/package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`
- Create: `packages/editor/src/main.tsx`, `App.tsx`, `store.ts`, `tokens.css`, `style.css`
- Create: `packages/editor/src/bundle.ts`, `timeline.tsx`, `video.tsx`
- Test: `packages/editor/src/bundle.test.ts`, `timeline.test.tsx`

- [ ] Write failing bundle tests for valid load, malformed JSONL, missing media/meta, and invalid clock fit.
- [ ] Implement local bundle loading and Zustand state with no router or component library.
- [ ] Write failing interaction tests: hover tick selects its box, click tick seeks, arrows seek, `[` and `]` set bounds, stale boxes stay hidden.
- [ ] Build the fixed 32 px bar / 240 px event list / video / waveform-and-trace layout with binding tokens and semantic amber only.
- [ ] Use video time as the only playback clock and the shared mapping/coordinate functions for overlays.
- [ ] Run editor tests, typecheck, and build; expect pass.
- [ ] Commit `feat(editor): add semantic trace playback`.

### Task 5: Zoom editing and export

**Files:**
- Create: `packages/editor/src/segments.tsx`, `packages/editor/src/export.ts`, `packages/editor/src/export.worker.ts`
- Modify: `packages/editor/src/App.tsx`, `store.ts`, `timeline.tsx`, `style.css`
- Test: `packages/editor/src/export.test.ts`

- [ ] Write failing state tests for automatic segments plus add, delete, retime, and re-target only.
- [ ] Implement those four operations over the shared deterministic zoom model.
- [ ] Write a failing export-plan test asserting 800 px, 12-15 fps, global palette with Bayer/diff GIF settings, and 1080p H.264 yuv420p MP4.
- [ ] Implement one ffmpeg.wasm worker that consumes the same segments used by preview and reports progress/errors as values.
- [ ] Verify reduced motion, keyboard focus, exact technical copy, and no forbidden design patterns.
- [ ] Run editor tests, typecheck, and build; expect pass.
- [ ] Commit `feat(editor): add element-locked zoom export`.

### Task 6: Phase 1 acceptance gate

**Files:**
- Create only after measurement: `docs/phase-1-evidence.md`
- Modify only after all gates pass: `STATUS.md`
- Delete only after production replacement passes: `packages/spike/`

- [ ] Record a real third-party DOM application for at least 60 seconds with at least 15 target clicks.
- [ ] Export an 800 px GIF and measure bytes; require under 3,000,000 bytes and manually confirm zoomed text is legible.
- [ ] Sample ten zooms, decode frames accurately, and report signed errors; require maximum absolute error at most one frame.
- [ ] Render the same footage side by side with cursor zoom left and element-locked zoom right; get an uninformed human check that the difference is obvious within ten seconds.
- [ ] Run `pnpm test && pnpm typecheck && pnpm build && pnpm e2e`; expect zero failures.
- [ ] If any gate fails, record the numbers and stop at Phase 1.
- [ ] If every gate passes, write the evidence, advance `STATUS.md` to Phase 2, delete the spike, commit, and push `main`.
