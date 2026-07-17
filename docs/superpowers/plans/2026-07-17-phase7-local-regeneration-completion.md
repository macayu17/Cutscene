# Phase 7 Local Regeneration Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the local Phase 7 loop: replay, fresh bundle, semantic diff, staleness, and declared GIF/MP4/docs artifacts.

**Architecture:** Node-only orchestration stays in `packages/runner`; browser-free diff logic stays in `packages/trace`. A small second editor entry reuses the existing FFmpeg.wasm and screenshot exporters under Playwright through a loopback native HTTP server.

**Tech Stack:** TypeScript, Vitest, Playwright, Vite, FFmpeg.wasm, Node HTTP/filesystem/Git, pnpm.

---

## File map

- `packages/runner/src/config.ts`, `cli.ts`: full-run mode, contained outputs, staleness fields.
- `packages/trace/src/trace-diff.ts`: pure version 1 semantic trace diff.
- `packages/runner/src/capture.ts`, `replay.ts`: live privacy-safe trace observation.
- `packages/runner/src/bundle-files.ts`: staged fresh bundle writes.
- `packages/runner/src/staleness.ts`: Git-based route-path staleness.
- `packages/runner/src/render.ts`: editor bridge and staged output replacement.
- `packages/editor/automation.html`, `src/automation.ts`: headless exporter entry.
- `packages/editor/src/export.ts`, `docs-export.ts`: GIF width and safe screenshots.
- `packages/runner/src/run.ts`: complete orchestration.
- `PRD.md`, `AGENTS.md`, `README.md`, `STATUS.md`: local gate and measured evidence.

### Task 1: Full-run configuration and CLI mode

**Files:** `packages/runner/src/config.ts`, `config.test.ts`, `cli.ts`, `cli.test.ts`

- [ ] Write failing tests for optional paired fields:

```yaml
watch:
  - packages/app/src/routes/analytics/**
staleAfterCommits: 10
```

Require both or neither, non-empty repository-relative watch paths without `..`, a positive integer threshold, and every output path contained by `configDir`. Existing configs parse as `watch: []`, `staleAfterCommits: null`.

- [ ] Run `pnpm --filter @cutscene/runner test -- config.test.ts`; confirm the new cases fail.

- [ ] Extend `DemoConfig` with:

```ts
watch: readonly string[];
staleAfterCommits: number | null;
```

Resolve output paths from `configDir`; reject a path when `relative(configDir, resolved)` is absolute or starts with `..`.

- [ ] Write failing CLI tests for both `--config demo.yml --dry-run` and `--config demo.yml`, each with optional `--demo <id>`. Require `runDemo` to receive `{ dryRun: boolean }`.

- [ ] Implement `type Arguments = { configPath: string; demoId: string | null; dryRun: boolean }` and usage `Usage: cutscene-regenerate --config <demo.yml> [--dry-run] [--demo <id>]`.

- [ ] Run runner tests/typecheck and commit `feat(runner): configure full regeneration`.

### Task 2: Privacy-safe semantic trace diff

**Files:** create `packages/trace/src/trace-diff.ts`, `trace-diff.test.ts`; modify `index.ts`

- [ ] Write failing tests using real click/input/keypress events. Cover unchanged, route/label/first-locator/geometry changes, added, removed, and masked-value non-disclosure.

```ts
export type TraceDiff = {
  v: 1;
  counts: { unchanged: number; changed: number; added: number; removed: number };
  actions: readonly TraceDiffAction[];
};
export function diffTraces(reference: readonly TraceEvent[], fresh: readonly TraceEvent[]): TraceDiff;
export function formatTraceDiff(diff: TraceDiff): string;
```

- [ ] Run `pnpm --filter @cutscene/trace test -- trace-diff.test.ts`; confirm module-not-found.

- [ ] Implement action keys as `stepId`, kind, and within-step order. Compare only kind, route, safe label, first locator, and geometry with 0.5 CSS-pixel tolerance. Never copy target values.

- [ ] Export the module, run all trace tests/typecheck, and commit `feat(trace): compare regenerated traces`.

### Task 3: Fresh trace capture during replay

**Files:** create `packages/runner/src/capture.ts`, `capture.test.ts`; modify `replay.ts`, `replay.test.ts`

- [ ] Write failing pure tests for:

```ts
export function freshActionEvent(input: {
  action: ReplayAction;
  stepId: string;
  locatorIndex: number;
  t: number;
  route: string;
  viewport: Viewport;
  scroll: ScrollPosition;
  live: { tagName: string; accessibleName: string; text: string; boundingBox: BoundingBox };
}): TraceEvent;
```

Assert the failed locator prefix disappears, live geometry/name replace stale data, fill/keypress values become `[MASKED]`, Enter remains, and serialized output excludes configured values.

- [ ] Run the focused test red; implement the minimal constructor.

- [ ] Write failing browser tests for `replay(page, plan, { reference, startedAt })`. Require `ReplayRun.events`, source viewport/scroll application, live box capture, fallback locator suffix, masked values, recorded timing offsets, and navigation events. Existing two-argument calls return `events: []` without timing waits.

- [ ] Implement capture before each action: find source by ID, wait source offset, apply viewport/scroll, resolve, observe live DOM/geometry/context, create event, execute, then observe route change.

- [ ] Collect unique reference redaction selectors. At each action sample visible matches into valid redaction events with stable per-run instance IDs and emit hidden samples when an instance disappears. Test that no text/value fields exist.

- [ ] Run runner tests/typecheck and commit `feat(runner): capture fresh replay traces`.

### Task 4: Playwright video and fresh bundle

**Files:** create `packages/runner/src/bundle-files.ts`, `bundle-files.test.ts`; modify `run.ts`

- [ ] Write failing bundle tests requiring `media.webm`, parseable `trace.jsonl`, and valid `meta.json`, written through a staging directory with metadata last. A simulated failure must not leave a valid-looking final bundle.

```ts
export async function writeFreshBundle(input: {
  configDir: string;
  demoId: string;
  mediaPath: string;
  events: readonly TraceEvent[];
  meta: RecordingMeta;
}): Promise<Result<{ directory: string; mediaPath: string; tracePath: string; metaPath: string }>>;
```

- [ ] Run the focused test red; implement staged writes under `.cutscene/runs/<demo-id>`.

- [ ] In a full run create a Playwright context with `recordVideo` sized to the first reference viewport. Start the monotonic clock before `newPage`, replay with capture, close context, and retain `video.path()`.

- [ ] Assemble recording start/stop, initial navigation, and two clock markers around replay events. If drift/orphans exist, write reports but do not commit a fresh bundle or outputs.

- [ ] Add a browser test that loads the recorded WebM in Chromium and obtains finite positive width, height, and duration. Use these values in metadata before writing it.

- [ ] Run runner tests/typecheck and commit `feat(runner): record fresh replay bundles`.

### Task 5: Trace-diff and Git-staleness reports

**Files:** create `packages/runner/src/staleness.ts`, `staleness.test.ts`; modify `report-files.ts`, `report-files.test.ts`, `run.ts`

- [ ] Write failing temporary-Git-repository tests for:

```ts
export type StalenessResult =
  | { v: 1; state: 'unavailable'; reason: string }
  | { v: 1; state: 'current' | 'stale'; baseline: string; head: string; relevantCommits: number; threshold: number };
export function detectStaleness(configDir: string, tracePath: string,
  watch: readonly string[], threshold: number | null): Promise<StalenessResult>;
```

Prove unrelated commits are ignored, state becomes stale only after the threshold, and untracked/non-Git traces are unavailable.

- [ ] Run the focused test red; implement with argument-array Git subprocesses: `rev-parse --show-toplevel`, `log -1 --format=%H -- <trace>`, `rev-parse HEAD`, `rev-list --count <baseline>..HEAD -- <watch...>`.

- [ ] Extend report writing to stage deterministic drift JSON/text, trace-diff JSON/text, and staleness JSON. Test zero configured-value occurrences across every report.

- [ ] Wire diff/staleness after fresh capture, run tests/typecheck, and commit `feat(runner): report trace changes and staleness`.

### Task 6: Headless editor export bridge

**Files:** create `packages/editor/automation.html`, `src/automation.ts`, `automation.test.ts`, `packages/runner/src/render.ts`, `render.test.ts`; modify editor `vite.config.ts`, `export.ts`, `export.test.ts`, `docs-export.ts`, `docs-export.test.ts`

- [ ] Write failing export-plan tests: a configured GIF width of 640 preserves aspect ratio; no size keeps 800×450. Add one optional output-size argument to `buildExportPlan` and `exportRecording`; MP4 remains unchanged.

- [ ] Write failing pure tests mapping active redaction boxes into cropped 2x screenshot coordinates. Extend `renderStepShots` with optional redactions and paint opaque rectangles after drawing the frame.

- [ ] Write failing automation-preparation tests, then expose after bundle parsing:

```ts
type CutsceneAutomation = {
  probe(): Promise<{ width: number; height: number; durationMs: number }>;
  exportVideo(type: 'gif' | 'mp4', width?: number): Promise<void>;
  exportDocs(): Promise<{ markdown: string; shots: Array<{ name: string; bytes: number[] }> }>;
};
```

Use existing `parseBundle`, automatic segments, FFmpeg.wasm export, redactions, and 2x step-shot functions. Video triggers one named download; docs return Markdown and PNG bytes.

- [ ] Configure Vite multi-page inputs for normal `index.html` and `automation.html`; build and assert both outputs exist.

- [ ] Write failing runner render tests proving the native HTTP server binds `127.0.0.1`, serves only built assets plus three bundle files, blocks traversal, stages all outputs under the run directory, writes docs screenshots beside Markdown, and preserves sentinel outputs if any render fails.

- [ ] Implement the server and Playwright bridge. Render all declared outputs before replacing any destination. Add no dependency and no native FFmpeg path.

- [ ] Run editor/runner tests, typechecks, editor build, and commit `feat(runner): render declared demo artifacts`.

### Task 7: Orchestration, revised gate, and real proof

**Files:** modify `run.ts`, runner E2E, `README.md`, `PRD.md`, `AGENTS.md`, `STATUS.md`, prior Phase 7 design

- [ ] Enforce full order: parse → plan → seed → replay/capture → drift gate → close/probe video → bundle → diff/staleness reports → render all outputs → replace outputs. Exit 0 success, 1 drift/orphan, 2 stage failure. Preserve dry-run flow.

- [ ] Extend runner E2E with a matched full demo declaring GIF, MP4, and docs. Require exit 0, playable fresh WebM, parseable trace/meta, versioned reports, valid non-empty GIF/MP4 signatures, Markdown plus PNG, secret absence, and sentinel preservation on forced render failure.

- [ ] Replace the Phase 7 hosted-PR exit text in `PRD.md` and the corresponding `AGENTS.md` gate with the approved local gate. State hosted CI/PR/auto-merge is optional and do not add Phase 8 code.

- [ ] Run a real TodoMVC normal regeneration using the verified Enter trace and all three outputs. Require 2/2 first-ranked matches, zero drift/orphans, valid fresh bundle and outputs, measured diff/staleness, and zero configured-value occurrences in trace/reports/docs.

- [ ] Record file sizes, hashes, event/action/diff counts, staleness, locator tiers, privacy scan, exit code, tests, typechecks, builds, and E2E. Only then set `STATUS.md` to `Phase: 8`, explicitly noting Phase 8 implementation has not started.

- [ ] Run `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm e2e`, and `git diff --check`; commit `feat(runner): complete local Phase 7 regeneration`.

### Task 8: Completion audit and direct integration

- [ ] Audit every spec requirement against current files and command output: compatibility, fresh pixels/trace, privacy, diff, staleness, all outputs, containment, failure preservation, revised gate, no hosted work, and no Phase 8 code.

- [ ] Run ponytail and correctness reviews. Delete duplicated codec paths, speculative helpers, dead flexibility, and test scaffolding that does not protect behavior.

- [ ] Fast-forward local `main`, rerun merged tests/typechecks, safely remove the verified worktree and feature branch, and push `main` directly. Verify local and `origin/main` hashes match; create no PR and use no hosted CI.
