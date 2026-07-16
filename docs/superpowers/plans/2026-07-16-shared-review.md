# Shared Review Implementation Plan

**Goal:** Complete a real two-person review loop in which an element comment
survives a changed trace and the owner approves the recording.

**Architecture:** Extend the existing filesystem share server with a strict v1
review document, hashed member tokens, role-checked HTTP endpoints, and a small
dependency-free review page. Reuse `@cutscene/trace` for parsing clocks and
re-anchoring; do not duplicate locator logic in the server or browser.

**Tech stack:** Node HTTP/filesystem/crypto, TypeScript strict, existing trace
package, Vitest, existing Playwright installation. No database and no new
third-party runtime dependency.

---

### Task 1: Review document and safe persistence

**Files:**
- Create: `packages/server/src/review.test.ts`
- Create: `packages/server/src/review.ts`
- Modify: `packages/server/src/store.ts`
- Modify: `packages/server/package.json`
- Modify: `pnpm-lock.yaml`

1. Write failing tests for document creation, SHA-256 token lookup, one-use
   commenter invitation, safe public projection, role checks, and atomic
   same-recording updates.
2. Add `@cutscene/trace` as a workspace dependency.
3. Implement the strict v1 types and pure transition functions.
4. Add `readReview` and serialised `updateReview` filesystem operations. Write
   a temporary sibling and rename it over `review.json`.
5. Run server tests and typecheck.

### Task 2: Authenticated upload and review API

**Files:**
- Modify: `packages/server/src/server.test.ts`
- Modify: `packages/server/src/server.ts`
- Modify: `packages/server/src/store.test.ts`
- Modify: `packages/server/src/store.ts`

1. Write failing HTTP tests proving:
   - recording creation returns owner and invitation tokens;
   - bundle mutation without the owner/editor token is rejected;
   - invitation exchange returns a distinct commenter member;
   - the server constructs a comment anchor from a stored event id;
   - commenter cannot approve and owner can;
   - two concurrent comments are both retained;
   - presence lease reports a conflicting soft lock.
2. Add bounded JSON-body parsing and bearer-token authentication.
3. Implement join, review, event, comment, state, and presence routes.
4. Keep public media and review-page reads compatible with Phase 5.
5. Run server tests and typecheck.

### Task 3: Re-anchor on changed trace

**Files:**
- Modify: `packages/server/src/review.test.ts`
- Modify: `packages/server/src/review.ts`
- Modify: `packages/server/src/server.test.ts`
- Modify: `packages/server/src/server.ts`

1. Write a failing test with a comment anchored at `4,200 ms` and a changed
   strong-locator event at `7,100 ms`.
2. Parse the replacement trace with `parseTraceEvent`, fit its clock markers,
   and call `reanchorComments` for every unresolved comment.
3. Reject an invalid replacement without overwriting the old trace or review.
4. Store the resulting matched/drifted/orphaned resolution with the comment.
5. Run server and trace tests.

### Task 4: Owner and reviewer links in the editor

**Files:**
- Modify: `packages/editor/src/share.test.ts`
- Modify: `packages/editor/src/share.ts`
- Modify: `packages/editor/src/App.tsx`
- Modify: `packages/editor/src/style.css`

1. Update failing share tests for authenticated uploads and structured owner,
   reviewer, and public URLs.
2. Return tokens in URL fragments so they do not enter server logs.
3. Show the reviewer link first, with a separate owner review link. Keep the UI
   technical and compact; do not introduce a modal or component library.
4. Add a minimal update flow that accepts an owner review URL and publishes the
   currently loaded bundle to that recording.
5. Run editor tests, typecheck, and build.

### Task 5: Dependency-free review page

**Files:**
- Create: `packages/server/src/review-page.test.ts`
- Create: `packages/server/src/review-page.ts`
- Modify: `packages/server/src/server.ts`

1. Test the page contract: view-only public state, fragment-token handling,
   invitation exchange, event seeking, comment submission, presence renewal,
   soft-lock notice, and permitted review-state controls.
2. Render the existing dark instrument palette and mono interface. Amber is
   reserved for semantic event ticks and the selected bounding box.
3. Scale recorded CSS-pixel boxes into the displayed video rectangle without
   heuristic offsets.
4. Poll review state and presence on a short interval; honour reduced motion
   and visible keyboard focus.
5. Run server tests and inspect the page in Chromium at desktop size.

### Task 6: Two-session browser proof

**Files:**
- Create: `packages/extension/e2e/review.spec.ts`
- Modify: `STATUS.md`

1. Start an isolated share server and upload a deterministic bundle.
2. Open owner and reviewer links in separate browser contexts.
3. Join as the reviewer, select an event, and post a comment.
4. Confirm the owner session sees the second member and the comment.
5. Upload a changed trace where the strong locator moves from `4,200 ms` to
   `7,100 ms`; assert both sessions show `matched` at `7.1s`.
6. Approve as owner and assert the final state is `approved`.
7. Record member ids, timestamps, comment result, review state, browser errors,
   test counts, typecheck, build, and E2E results in `STATUS.md`.
8. Commit, merge locally, rerun all gates, and push `main` without a PR.
