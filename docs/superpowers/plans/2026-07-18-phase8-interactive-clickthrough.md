# Phase 8 Linear Interactive Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export a recording as a local ZIP whose video pauses at every recorded click and advances only through the matching hotspot.

**Architecture:** Reuse the existing MP4 renderer for the pixels and privacy treatments. A pure editor module derives camera-transformed hotspot steps, renders a self-contained player, and packages `index.html` with `demo.mp4` through the existing ZIP writer.

**Tech Stack:** React, TypeScript, Vitest, Playwright, native HTML video, Canvas-free CSS overlays, existing ffmpeg.wasm and ZIP writer.

---

### Task 1: Share the privacy-safe target label

**Files:**
- Modify: `packages/trace/src/docs.ts`
- Modify: `packages/trace/src/docs.test.ts`

- [ ] **Step 1: Add a failing label test**

Add assertions that an accessible name wins, `[MASKED]` falls back to role, and
masked text is never returned.

```ts
expect(targetLabel(target({ accessibleName: 'Save', text: 'ignored' }))).toBe('Save');
expect(targetLabel(target({ accessibleName: '[MASKED]', text: '[MASKED]', role: 'textbox' }))).toBe('textbox');
```

- [ ] **Step 2: Run the focused test and confirm the missing export fails**

Run: `pnpm --filter @cutscene/trace test -- docs.test.ts`

- [ ] **Step 3: Export the existing rule instead of duplicating it**

Rename the private `labelOf` function and its caller:

```ts
export function targetLabel(target: TargetDescriptor): string {
  const accessibleName = target.accessibleName.trim();
  if (accessibleName && accessibleName !== '[MASKED]') return accessibleName;
  const text = target.text.trim();
  if (text && text !== '[MASKED]') return text;
  return target.role ?? target.tagName.toLowerCase();
}
```

- [ ] **Step 4: Run the focused test and commit**

Run: `pnpm --filter @cutscene/trace test -- docs.test.ts`

Commit: `git commit -am "refactor(trace): share safe target labels"`

### Task 2: Derive hotspots and build the static player archive

**Files:**
- Create: `packages/editor/src/interactive.ts`
- Create: `packages/editor/src/interactive-player.ts`
- Create: `packages/editor/src/interactive.test.ts`

- [ ] **Step 1: Write failing manifest tests**

Cover click-only filtering, fitted media time plus intro offset, camera-transformed
box coordinates, chronological order, masked label fallback, and no-click error.

```ts
const result = deriveInteractiveManifest(meta, events, clock, segments, 1_500);
expect(result.ok && result.value.steps).toEqual([{
  eventId: 'click-1', timeMs: 3_500, label: 'Save',
  box: { x: 690, y: 405, width: 540, height: 270 },
}]);
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `pnpm --filter @cutscene/editor test -- interactive.test.ts`

- [ ] **Step 3: Implement the minimal manifest derivation**

`interactive.ts` defines `InteractiveManifest`, `InteractiveStep`, and:

```ts
export function deriveInteractiveManifest(
  meta: RecordingMeta,
  events: readonly TraceEvent[],
  clock: MediaClockFit,
  segments: readonly EditableSegment[],
  introMs: number,
): Result<InteractiveManifest>
```

Filter only click events with targets. Use `mapBoxToCapture`, `cameraAt`, and
`cameraMatrix` to map each box into a fixed 1920x1080 output. Clamp every box to
the output bounds and return `No clickable trace events captured.` when empty.

- [ ] **Step 4: Add failing player and archive tests**

Assert that generated HTML contains the v1 manifest and player controls, escapes
`</script>`, contains no locator/value payload, and that the ZIP contains both
`index.html` and `demo.mp4` names with the supplied media bytes.

- [ ] **Step 5: Implement the standalone player**

`interactive-player.ts` exports:

```ts
export function renderInteractivePlayer(manifest: InteractiveManifest): string
```

The returned document has only native HTML/CSS/JS. It starts on a user gesture,
uses `requestVideoFrameCallback` with `timeupdate` fallback, seeks to the exact
step time before displaying the hotspot, ignores wrong clicks, supports keyboard
activation, restarts, replays, and reports media/playback failures directly.

- [ ] **Step 6: Package the rendered MP4 with the existing ZIP writer**

```ts
export async function interactiveArchive(media: Blob, manifest: InteractiveManifest): Promise<Uint8Array> {
  return zipStore([
    { name: 'index.html', data: new TextEncoder().encode(renderInteractivePlayer(manifest)) },
    { name: 'demo.mp4', data: new Uint8Array(await media.arrayBuffer()) },
  ]);
}
```

- [ ] **Step 7: Run focused tests and commit**

Run: `pnpm --filter @cutscene/editor test -- interactive.test.ts`

Commit: `git add packages/editor/src/interactive* && git commit -m "feat(editor): build interactive demo archives"`

### Task 3: Add the editor export action

**Files:**
- Modify: `packages/editor/src/App.tsx`
- Modify: `README.md`

- [ ] **Step 1: Add the export handler**

Render the existing MP4 first, derive the manifest with a 1.5 second intro offset
only when `brand?.intro.trim()` is non-empty, build the archive, and download
`<recording-id>-interactive.zip`. Reuse the current export progress and error
state.

```ts
const runInteractive = async () => {
  if (!media) return;
  setExport(0);
  try {
    const rendered = await exportRecording(/* existing MP4 arguments */);
    const manifest = deriveInteractiveManifest(bundle.meta, bundle.events, bundle.clock,
      segments, brand?.intro.trim() ? 1_500 : 0);
    if (!manifest.ok) throw new Error(manifest.error);
    zip(await interactiveArchive(rendered, manifest.value),
      `${bundle.meta.recordingId}-interactive.zip`);
    setExport(null);
  } catch (cause: unknown) {
    setExport(null, cause instanceof Error ? cause.message : String(cause));
  }
};
```

- [ ] **Step 2: Add one exact button**

Add `Export interactive demo` beside the other exports. Do not add a panel,
settings, or dependency.

- [ ] **Step 3: Document use and commit**

Update `What works today` and `Record and edit` to say the ZIP must be extracted
and `index.html` opened with `demo.mp4` beside it.

Run: `pnpm --filter @cutscene/editor typecheck && pnpm --filter @cutscene/editor build`

Commit: `git add packages/editor/src/App.tsx README.md && git commit -m "feat(editor): export linear click-through demos"`

### Task 4: Prove the player in Chromium

**Files:**
- Modify: `packages/editor/package.json`
- Create: `packages/editor/playwright.config.ts`
- Create: `packages/editor/e2e/interactive.spec.ts`
- Modify: `package.json`

- [ ] **Step 1: Add the existing Playwright package as an editor dev dependency**

Use the same version already installed by the runner. Add an `e2e` script and add
the editor E2E command to the root sequence.

- [ ] **Step 2: Write a browser test for every interaction state**

Serve a generated player with a small fixture MP4. Assert Start begins playback,
wrong clicks keep the step unchanged, every hotspot advances in order, completion
appears, Replay returns to step one, and keyboard activation works.

- [ ] **Step 3: Measure hotspot geometry**

For each step, compare `getBoundingClientRect()` with the expected percentage
box on the actual video content surface. Record the maximum edge error and require
it to be at most 4 pixels.

- [ ] **Step 4: Run focused and full verification**

Run:

```powershell
pnpm --filter @cutscene/editor test
pnpm --filter @cutscene/editor typecheck
pnpm --filter @cutscene/editor build
pnpm --filter @cutscene/editor e2e
pnpm test
pnpm typecheck
pnpm build
pnpm e2e
```

- [ ] **Step 5: Commit**

Commit: `git add package.json pnpm-lock.yaml packages/editor/package.json packages/editor/playwright.config.ts packages/editor/e2e && git commit -m "test(editor): verify interactive player flow"`

### Task 5: Record real evidence and finish repository cleanup

**Files:**
- Modify: `STATUS.md`

- [ ] **Step 1: Export the TodoMVC acceptance bundle**

Load `artifacts/phase7-enter-bundle/5461e858-ecc8-4efb-b4b5-2e513554026f`,
download the interactive ZIP, extract it, and serve it locally.

- [ ] **Step 2: Run the real-browser acceptance flow**

Activate all real hotspots, record click count, order, maximum edge error, wrong
click result, Replay result, page errors, artifact sizes, and SHA-256 hashes.
Search `index.html` for configured input values, `locators`, `comments`, and raw
trace-event keys.

- [ ] **Step 3: Update status truthfully**

Record the measured Phase 8 interactive-demo evidence. Keep Phase 8 current
because the unrelated long-tail items remain deferred.

- [ ] **Step 4: Verify contributor and attachment cleanup**

Confirm the requested attachment path no longer exists. Query GitHub's live
contributors endpoint and require only `macayu17`; remove any Claude co-author
trailers from public history only if the live endpoint or contributor page still
attributes contributions to Claude.

- [ ] **Step 5: Final commit and push**

Run `git diff --check`, confirm a clean worktree after committing, push `main`,
and verify `origin/main` equals local `HEAD`.
