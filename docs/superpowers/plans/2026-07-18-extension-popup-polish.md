# Extension Popup Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the extension capture popup's hierarchy and state clarity without changing its recording workflow.

**Architecture:** Keep the existing single-page MV3 popup and message flow. Restructure its semantic HTML, replace the small stylesheet, and expose the recorder state through one `data-state` attribute for CSS; add no files, dependencies, permissions, or reusable abstractions.

**Tech Stack:** Manifest V3, TypeScript, Vite, plain HTML and CSS, Playwright.

---

### Task 1: Restructure the popup

**Files:**
- Modify: `packages/extension/control.html`

- [ ] **Step 1: Replace the flat control list with semantic regions**

Keep `#mic`, `#redact`, `#start`, `#stop`, and `#status`. Add a compact header,
`CAPTURE` and `PRIVACY` labels, `aria-live="polite"` on the status output,
`aria-describedby="redact-help"` on the textarea, and an action footer. The
visible button names remain `Record tab` and `Stop and save` so the existing
Playwright flow is unchanged.

- [ ] **Step 2: Build to catch malformed markup or entrypoint changes**

Run: `pnpm --filter @cutscene/extension build`

Expected: Vite completes successfully and emits `dist/control.html`.

### Task 2: Expose recorder state to CSS

**Files:**
- Modify: `packages/extension/src/control.ts`

- [ ] **Step 1: Set the status data attribute in the existing render function**

For failures, set `output.dataset.state = 'error'`. For successful results,
derive the existing `recording`, `saved`, or `idle` state once, assign it to
`output.dataset.state`, and retain the existing status copy. Disable both
configuration controls while recording:

```ts
const state = result.value.recording ? 'recording' : result.value.clickCount ? 'saved' : 'idle';
output.dataset.state = state;
mic.disabled = result.value.recording;
redact.disabled = result.value.recording;
```

- [ ] **Step 2: Run the TypeScript check**

Run: `pnpm --filter @cutscene/extension typecheck`

Expected: TypeScript exits with code 0.

### Task 3: Apply the instrument styling

**Files:**
- Modify: `packages/extension/src/style.css`

- [ ] **Step 1: Replace the stylesheet with the approved visual rules**

Use the existing graphite tokens, a 320px fixed popup width, IBM Plex Mono with
system monospace fallbacks, one-pixel dividers, neutral controls, a high-contrast
neutral Record button, visible focus rings, native checkbox styling, readable
disabled states, and danger colour only for `[data-state="error"]`. Add no
animation, rounded cards, shadows, gradients, icons, or amber UI chrome.

- [ ] **Step 2: Build the final popup**

Run: `pnpm --filter @cutscene/extension build`

Expected: Vite completes successfully with no warnings caused by the popup.

### Task 4: Verify behaviour and appearance

**Files:**
- Evidence only: `artifacts/screenshots/extension-popup-polish.png`

- [ ] **Step 1: Run focused automated checks**

Run:

```powershell
pnpm --filter @cutscene/extension test
pnpm --filter @cutscene/extension typecheck
pnpm --filter @cutscene/extension e2e
```

Expected: extension unit checks, typechecking, and the Chromium capture flow all
pass; the existing IDs and recorder status assertions remain valid.

- [ ] **Step 2: Capture real Chromium evidence**

Load the built unpacked extension in Chromium, open `control.html`, and save a
real screenshot to `artifacts/screenshots/extension-popup-polish.png`. Confirm
the popup is 320px wide, all content is visible without horizontal overflow,
and the browser page and console error counts are both zero.

- [ ] **Step 3: Commit the implementation**

```powershell
git add -- packages/extension/control.html packages/extension/src/control.ts packages/extension/src/style.css artifacts/screenshots/extension-popup-polish.png docs/superpowers/plans/2026-07-18-extension-popup-polish.md
git commit -m "style: polish extension capture popup"
```
