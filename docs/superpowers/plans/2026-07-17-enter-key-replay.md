# Enter Key Replay Implementation Plan

> **Execution:** Work through these tasks in order with red-green tests. Keep the
> trace contract limited to privacy-safe `Enter` and do not add Phase 8 work.

**Goal:** Capture and replay a single Enter submission so a recorded one-row
TodoMVC flow regenerates without drift.

**Architecture:** Extend trace v1 with a strict Enter-only keypress event. Preserve
event order when planning `fill`, `press`, and `click` actions, then execute the
new action through the existing ranked-locator runner. The extension records no
printable key data.

**Stack:** TypeScript, Vitest, Playwright, pnpm, MV3 content script.

---

## Task 1: Make the trace contract Enter-only

**Files:**

- Modify: `packages/trace/src/schema.ts`
- Test: `packages/trace/src/schema.test.ts`

1. Add failing parser tests for a valid `interaction.keypress` with
   `key: "Enter"`, a missing key, and a printable key.
2. Run the schema test and confirm the new expectations fail.
3. Add `ControlKey = "Enter"`, a versioned `KeypressEvent`, and strict parser
   validation. Keep generic events from accepting keypresses.
4. Re-run the schema test and commit the passing contract.

## Task 2: Preserve keypress order in replay plans

**Files:**

- Modify: `packages/trace/src/regeneration.ts`
- Test: `packages/trace/src/regeneration.test.ts`

1. Replace the unsupported-keypress test with failing tests that expect
   `fill` then `press`, and reject two keypresses in one step.
2. Run the regeneration test and confirm the failures.
3. Add a typed `press` replay action and emit actions in recorded order while
   retaining the last input sample rule.
4. Re-run trace tests and commit the passing planner.

## Task 3: Execute Enter through ranked locators

**Files:**

- Modify: `packages/runner/src/replay.ts`
- Test: `packages/runner/src/replay.test.ts`
- Test: `packages/runner/e2e/runner.spec.ts`

1. Add failing unit and browser tests proving `press("Enter")` is dispatched
   after fill and changes the page through a ranked locator.
2. Run the focused tests and confirm they fail for the missing action.
3. Add the explicit press branch without changing drift or orphan reporting.
4. Re-run runner tests and commit the passing executor.

## Task 4: Capture only Enter

**Files:**

- Modify: `packages/extension/src/content.ts`
- Test: `packages/extension/e2e/capture.spec.ts`

1. Add failing capture assertions requiring Enter keypress events and rejecting
   any other key value or leaked printable input.
2. Run the focused extension E2E and confirm the missing event fails.
3. Listen for `keydown`, emit only Enter with the existing privacy-safe target,
   and leave printable keys unrecorded.
4. Re-run extension E2E in normal and clean modes and commit the capture change.

## Task 5: Prove the real TodoMVC flow

**Files:**

- Modify: `STATUS.md`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-17-enter-key-replay-design.md`

1. Build the extension and record a clean artifact with one Enter submission
   and one click.
2. Run the local Phase 7 runner against TodoMVC with the new trace.
3. Require 2 planned steps, 2 evaluated steps, 2 matches, 0 drift, and 0
   orphans. Stop and report if these numbers do not hold.
4. Record duration, event counts, sizes, hashes, privacy scan, and replay counts
   in project evidence. Correct the README limitation to Enter-only support.

## Task 6: Verify and integrate

1. Run `pnpm test`, `pnpm typecheck`, `pnpm build`, and `pnpm e2e`.
2. Inspect the full diff for unrelated or over-engineered code.
3. Follow the branch-finishing checklist, fast-forward the verified commits onto
   local `main`, re-check the merged state, and push `main` directly to GitHub.
4. Do not open a PR and do not advance `STATUS.md` beyond Phase 7.
