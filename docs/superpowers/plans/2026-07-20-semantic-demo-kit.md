# Semantic Demo Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Cutscene visibly DOM-aware and add one primary export that packages the existing video, GIF, interactive guide, documentation, screenshots, and Playwright skeleton.

**Architecture:** Keep the editor as a single React page. Add one pure semantic-summary helper and one demo-kit module that orchestrates the existing exporters and assembles their results with the existing dependency-free ZIP writer; `App` owns only UI state and download behavior. The Phase 7 runner remains a separate local CLI.

**Tech Stack:** React 19, TypeScript strict, Zustand, ffmpeg.wasm, plain CSS, Vitest, Playwright, native `details`/`summary`.

---

### Task 1: Semantic summary model

**Files:**
- Modify: `packages/editor/src/timeline.tsx`
- Modify: `packages/editor/src/timeline.test.ts`

- [ ] **Step 1: Write the failing summary test**

Add this test and the `TraceEvent` type import to `timeline.test.ts`:

```ts
import type { TraceEvent } from '@cutscene/trace';
import { semanticSummary } from './timeline';

it('summarizes human steps, boxed clicks, and generated zooms', () => {
  const events = [
    { type: 'navigation', stepId: 'step_0' },
    { type: 'interaction.click', stepId: 'step_1', target: { boundingBox: {} } },
    { type: 'interaction.input', stepId: 'step_1', target: { boundingBox: {} } },
    { type: 'interaction.hover', stepId: 'step_1', target: { boundingBox: {} } },
  ] as unknown as TraceEvent[];

  expect(semanticSummary(events, 3)).toEqual({ events: 3, steps: 2, targets: 1, zooms: 3 });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm --filter @cutscene/editor test -- timeline.test.ts`

Expected: FAIL because `semanticSummary` is not exported.

- [ ] **Step 3: Implement the smallest summary helper**

Add the type import and function to `timeline.tsx` beside the existing event predicates:

```ts
import type { TraceEvent } from '@cutscene/trace';

export type SemanticSummary = {
  events: number;
  steps: number;
  targets: number;
  zooms: number;
};

export function semanticSummary(events: readonly TraceEvent[], zooms: number): SemanticSummary {
  const human = events.filter(isHumanEvent);
  return {
    events: human.length,
    steps: new Set(human.map(({ stepId }) => stepId)).size,
    targets: human.filter((event) => event.type === 'interaction.click' && event.target).length,
    zooms,
  };
}
```

- [ ] **Step 4: Verify GREEN**

Run: `pnpm --filter @cutscene/editor test -- timeline.test.ts`

Expected: all editor tests pass, including the new summary test.

- [ ] **Step 5: Commit**

```powershell
git add -- packages/editor/src/timeline.tsx packages/editor/src/timeline.test.ts
git commit -m "feat(editor): summarize semantic recording structure"
```

### Task 2: Demo-kit archive and orchestration

**Files:**
- Create: `packages/editor/src/demo-kit.ts`
- Create: `packages/editor/src/demo-kit.test.ts`

- [ ] **Step 1: Write the failing archive test**

Create `demo-kit.test.ts` with a store-method ZIP reader that verifies names and
privacy without adding a ZIP dependency:

```ts
import { expect, it } from 'vitest';
import type { InteractiveManifest } from './interactive';
import { demoKitArchive } from './demo-kit';

function names(zip: Uint8Array): string[] {
  const out: string[] = [];
  let offset = 0;
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  while (offset + 30 <= zip.length && view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    out.push(new TextDecoder().decode(zip.subarray(offset + 30, offset + 30 + nameLength)));
    offset += 30 + nameLength + extraLength + size;
  }
  return out;
}

it('packages the six publishable artifact groups without raw recording data', async () => {
  const manifest: InteractiveManifest = {
    v: 1,
    recordingId: 'rec_kit',
    width: 1_920,
    height: 1_080,
    steps: [{ eventId: 'click', timeMs: 500, label: 'Save',
      box: { x: 10, y: 20, width: 30, height: 40 } }],
  };
  const archive = await demoKitArchive({
    mp4: new Blob([new TextEncoder().encode('ftyp')], { type: 'video/mp4' }),
    gif: new Blob([new TextEncoder().encode('GIF89a')], { type: 'image/gif' }),
    manifest,
    rendered: {
      steps: [{ index: 1, stepId: 'step_1', eventId: 'click', t: 500, route: '/',
        action: 'Click **Save**.', screenshot: 'screenshots/step-01.png',
        box: { x: 10, y: 20, width: 30, height: 40 } }],
      shots: [{ name: 'screenshots/step-01.png', data: new Uint8Array([137, 80, 78, 71]) }],
    },
    meta: { recordingId: 'rec_kit', url: 'https://example.com/' },
    skeleton: "await page.getByRole('button', { name: 'Save' }).click();",
  });

  expect(names(archive)).toEqual([
    'index.html', 'demo.mp4', 'demo.gif', 'docs.md',
    'screenshots/step-01.png', 'playwright.spec.ts',
  ]);
  const text = new TextDecoder().decode(archive);
  expect(text).toContain('GIF89a');
  expect(text).toContain('ftyp');
  expect(text).toContain("getByRole('button'");
  expect(text).not.toContain('raw-secret');
  expect(text).not.toContain('locators');
  expect(text).not.toContain('annotation.comment');
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm --filter @cutscene/editor test -- demo-kit.test.ts`

Expected: FAIL because `./demo-kit` does not exist.

- [ ] **Step 3: Implement archive assembly and exporter orchestration**

Create `demo-kit.ts` with the complete implementation below:

```ts
import { deriveDocSteps, generatePlaywrightSkeleton, renderDocMarkdown, type MediaClockFit,
  type RecordingMeta, type TraceEvent } from '@cutscene/trace';
import type { BrandPreset } from './brand';
import type { EditableCallout } from './callouts';
import type { CursorSettings } from './cursor';
import { renderStepShots, type RenderedSteps } from './docs-export';
import { exportRecording } from './export';
import { deriveInteractiveManifest, renderInteractivePlayer, type InteractiveManifest } from './interactive';
import type { EditableRedaction, RedactionBox } from './redactions';
import type { EditableSegment } from './segments';
import { zipStore } from './zip';

export type DemoKitInput = {
  media: Blob;
  video: HTMLVideoElement;
  meta: RecordingMeta;
  events: readonly TraceEvent[];
  clock: MediaClockFit;
  segments: readonly EditableSegment[];
  callouts: readonly EditableCallout[];
  redactions: readonly EditableRedaction[];
  redactionBoxes: readonly RedactionBox[];
  brand: BrandPreset | null;
  cursorSettings: CursorSettings;
  progress: (value: number) => void;
};

export type DemoKitArchiveInput = {
  mp4: Blob;
  gif: Blob;
  manifest: InteractiveManifest;
  rendered: RenderedSteps;
  meta: Pick<RecordingMeta, 'recordingId' | 'url'>;
  skeleton: string;
};

export async function demoKitArchive(input: DemoKitArchiveInput): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  return zipStore([
    { name: 'index.html', data: encoder.encode(renderInteractivePlayer(input.manifest)) },
    { name: 'demo.mp4', data: new Uint8Array(await input.mp4.arrayBuffer()) },
    { name: 'demo.gif', data: new Uint8Array(await input.gif.arrayBuffer()) },
    { name: 'docs.md', data: encoder.encode(renderDocMarkdown(input.rendered.steps, input.meta)) },
    ...input.rendered.shots,
    { name: 'playwright.spec.ts', data: encoder.encode(input.skeleton) },
  ]);
}

async function stage<T>(name: string, task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Demo kit ${name} export failed: ${detail}`);
  }
}

export async function buildDemoKit(input: DemoKitInput): Promise<Uint8Array> {
  const manifest = deriveInteractiveManifest(input.meta, input.events, input.clock, input.segments,
    input.brand?.intro.trim() ? 1_500 : 0);
  if (!manifest.ok) throw new Error('Demo kit needs at least one clickable target.');
  if (!deriveDocSteps(input.events).some(({ screenshot }) => screenshot)) {
    throw new Error('Demo kit needs at least one documented target.');
  }
  const render = (format: 'mp4' | 'gif', progress: (value: number) => void) => exportRecording(
    input.media, format, input.segments, input.meta, input.callouts, input.events, input.clock,
    input.redactions, input.redactionBoxes, input.brand, input.cursorSettings, progress,
  );
  const mp4 = await stage('video', () => render('mp4', (value) => input.progress(value * 0.55)));
  const gif = await stage('GIF', () => render('gif', (value) => input.progress(0.55 + value * 0.35)));
  input.progress(0.92);
  const rendered = await stage('screenshot', () => renderStepShots(input.video, input.events, input.meta,
    (time) => input.clock.toMediaTime(time)));
  input.progress(0.98);
  const archive = await demoKitArchive({
    mp4,
    gif,
    manifest: manifest.value,
    rendered,
    meta: input.meta,
    skeleton: generatePlaywrightSkeleton({ meta: input.meta, events: input.events }),
  });
  input.progress(1);
  return archive;
}
```

- [ ] **Step 4: Verify GREEN and type safety**

Run:

```powershell
pnpm --filter @cutscene/editor test -- demo-kit.test.ts
pnpm --filter @cutscene/editor typecheck
```

Expected: all editor tests pass and TypeScript exits 0.

- [ ] **Step 5: Commit**

```powershell
git add -- packages/editor/src/demo-kit.ts packages/editor/src/demo-kit.test.ts
git commit -m "feat(editor): build semantic demo kit archive"
```

### Task 3: Integrate the primary workflow

**Files:**
- Modify: `packages/editor/src/App.tsx`

- [ ] **Step 1: Add the demo-kit action and semantic values**

Import `buildDemoKit`, `semanticSummary`, and `targetLabel`. After `selected`,
derive these values without adding store state:

```ts
const summary = semanticSummary(bundle.events, segments.length);
const selectedTarget = selected?.target;
const selectedLocator = selectedTarget?.locators[0];
```

Add this action beside the existing export actions:

```ts
const runDemoKit = async () => {
  if (!media || !video.current) return;
  setExport(0);
  try {
    const archive = await buildDemoKit({
      media,
      video: video.current,
      meta: bundle.meta,
      events: bundle.events,
      clock: bundle.clock,
      segments,
      callouts,
      redactions,
      redactionBoxes,
      brand,
      cursorSettings,
      progress: (value) => setExport(value),
    });
    zip(archive, `${bundle.meta.recordingId}-demo-kit.zip`);
    setExport(null);
  } catch (cause: unknown) {
    setExport(null, cause instanceof Error ? cause.message : String(cause));
  }
};
```

- [ ] **Step 2: Replace the crowded top bar**

Render metadata in `.recording-meta`, then `.topbar-actions` containing
`Load recording`, native Share and Export menus with every existing action, and
the neutral `.primary-action` button:

```tsx
<button className="primary-action" disabled={exportProgress !== null}
  onClick={() => void runDemoKit()}>Build demo kit</button>
```

Keep every existing action's button text, disabled condition, and handler
unchanged inside the menus so capture/review automation remains compatible.
Give the progress span `role="progressbar"`, `aria-label="Export progress"`,
`aria-valuemin={0}`, `aria-valuemax={100}`, and the rounded percentage as
`aria-valuenow`.

- [ ] **Step 3: Render semantic summary and selected structure**

Change the rail heading to `SEMANTIC TRACE`. Under it render:

```tsx
<p className="semantic-summary">
  <span>{summary.events} events</span><span>{summary.steps} steps</span>
  <span>{summary.targets} targets</span><span>{summary.zooms} zooms</span>
</p>
```

When `selectedTarget` exists, render a `<dl className="event-detail">` with the
selected step ID, role or lowercase tag, rounded `x,y,width,height` CSS-pixel
box, and `${selectedLocator.type} · ${Math.round(selectedLocator.confidence * 100)}%`
when a locator exists. Continue using `targetLabel(event.target)` for event-row
copy so masked labels remain structural.

```tsx
{selectedTarget ? <dl className="event-detail">
  <div><dt>STEP</dt><dd>{selected?.stepId}</dd></div>
  <div><dt>ELEMENT</dt><dd>{selectedTarget.role ?? selectedTarget.tagName.toLowerCase()}</dd></div>
  <div><dt>BOX CSS PX</dt><dd>{[selectedTarget.boundingBox.x, selectedTarget.boundingBox.y,
    selectedTarget.boundingBox.width, selectedTarget.boundingBox.height].map(Math.round).join(', ')}</dd></div>
  {selectedLocator ? <div><dt>LOCATOR</dt><dd>{selectedLocator.type} · {
    Math.round(selectedLocator.confidence * 100)}%</dd></div> : null}
</dl> : null}
```

- [ ] **Step 4: Run focused checks**

Run:

```powershell
pnpm --filter @cutscene/editor test
pnpm --filter @cutscene/editor typecheck
pnpm --filter @cutscene/editor build
```

Expected: editor tests, TypeScript, and Vite build pass.

- [ ] **Step 5: Commit**

```powershell
git add -- packages/editor/src/App.tsx
git commit -m "feat(editor): foreground semantic demo workflow"
```

### Task 4: Polish the instrument layout

**Files:**
- Modify: `packages/editor/src/style.css`

- [ ] **Step 1: Apply the compact toolbar and trace styles**

Increase the top row from 32px to 40px. Add only these style groups:

```css
.recording-meta, .topbar-actions { display: flex; align-items: center; gap: 8px; min-width: 0; }
.recording-meta { overflow: hidden; }
.recording-meta span { overflow: hidden; text-overflow: ellipsis; }
.topbar-actions { margin-left: auto; }
.action-menu { position: relative; }
.action-menu summary, .topbar-actions button {
  min-height: 26px; border: 1px solid var(--line); background: var(--surface);
  color: var(--text); padding: 4px 8px; cursor: pointer; list-style: none;
}
.action-menu summary::-webkit-details-marker { display: none; }
.action-menu[open] > div {
  position: absolute; z-index: 4; top: 31px; right: 0; display: grid; width: 210px;
  padding: 5px; border: 1px solid var(--line); background: var(--bg);
}
.action-menu[open] button, .action-menu[open] .file-label {
  width: 100%; border: 0; padding: 6px 7px; background: transparent; text-align: left;
}
.primary-action { border-color: var(--text) !important; background: var(--text) !important; color: var(--bg) !important; }
.semantic-summary { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 8px; margin: 0; padding: 8px 10px; border-bottom: 1px solid var(--line); color: var(--text-dim); font-size: var(--t-xs); }
.event-detail { margin: 0; padding: 8px 10px; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: 52px 1fr; gap: 3px 7px; font-size: var(--t-xs); }
.event-detail dt { color: var(--text-dim); }
.event-detail dd { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
```

Adjust `.instrument`, `.topbar`, and `.export-progress` to the 40px top row.
Remove the obsolete `.topbar .push` rule. Preserve the current palette, amber
signal rule, focus outlines, reduced motion, and desktop-only layout.

- [ ] **Step 2: Build and inspect the CSS diff**

Run:

```powershell
pnpm --filter @cutscene/editor build
git diff --check
```

Expected: Vite exits 0 and Git reports no whitespace errors.

- [ ] **Step 3: Commit**

```powershell
git add -- packages/editor/src/style.css
git commit -m "style(editor): focus the semantic demo workspace"
```

### Task 5: Real recording proof and repository gate

**Files:**
- Modify after measurement: `STATUS.md`
- Evidence: `artifacts/phase8-semantic-demo-kit/`
- Evidence: `artifacts/screenshots/semantic-demo-kit-editor.png`

- [ ] **Step 1: Run the complete local gate**

Run:

```powershell
pnpm test
pnpm typecheck
pnpm build
pnpm e2e
```

Expected: every repository unit test, every configured package typecheck/build,
and all Chromium E2E tests pass locally.

- [ ] **Step 2: Build a real TodoMVC kit in Chromium**

Start the built editor on a free local port. In Playwright at 1440x900, load the
three files from `artifacts/phase6-human-reedit`, select a semantic event, and
capture `artifacts/screenshots/semantic-demo-kit-editor.png`. Click
`Build demo kit`, save the download under
`artifacts/phase8-semantic-demo-kit/`, and record page/console errors.

Expected: one ZIP downloads, the editor has no horizontal overflow, and browser
page/console errors are both zero.

- [ ] **Step 3: Validate the actual archive and interactive flow**

Extract the ZIP with native Windows `Expand-Archive`. Record:

- ZIP and extracted file sizes and SHA-256 hashes;
- MP4 and GIF signatures;
- Markdown step, PNG screenshot, Playwright action, and interactive hotspot
  counts;
- forbidden-string scan for raw input values, `"locators"`,
  `annotation.comment`, and collaboration credentials;
- all hotspot activations, completion state, and maximum rendered edge error.

Expected: six artifact groups exist, no forbidden payload is present, every
hotspot completes in order, maximum edge error is at most 4 rendered pixels,
and browser errors are zero.

- [ ] **Step 4: Record evidence without advancing the phase**

Append the measured Semantic Demo Kit results beneath the existing Phase 8
section in `STATUS.md`. Keep `Phase: 8`; the PRD defines no Phase 9.

- [ ] **Step 5: Commit evidence**

```powershell
git add -- STATUS.md
git commit -m "docs: record semantic demo kit evidence"
```

Do not commit ignored binary artifacts unless the owner separately requests it.
Do not push, create a PR, or trigger hosted CI.
