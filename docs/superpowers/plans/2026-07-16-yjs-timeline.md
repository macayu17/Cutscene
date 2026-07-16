# Yjs Timeline and Version History Implementation Plan

**Goal:** Synchronise timeline edits as a Yjs document and retain restorable
snapshot history.

**Architecture:** A DOM-free editor adapter maps zooms, callouts, and redactions
to a `Y.Array<Y.Map>`. The server merges binary updates into a filesystem-backed
document and snapshots only changed state. HTTP polling transports updates;
presence remains the existing lease API.

**Dependency:** `yjs@^13.6.31` only.

---

### Task 1: Timeline document adapter

**Files:**
- Create: `packages/editor/src/timeline-document.test.ts`
- Create: `packages/editor/src/timeline-document.ts`
- Modify: `packages/editor/package.json`
- Modify: `packages/server/package.json`
- Modify: `pnpm-lock.yaml`

1. Add failing round-trip tests for zoom, callout, and redaction maps.
2. Add a failing convergence test using two independent `Y.Doc` instances.
3. Install stable Yjs in editor and server with no provider package.
4. Implement strict map readers, scalar `order`, item upsert/removal, observer,
   and binary encode/apply helpers.
5. Prove reverse-order and duplicate updates converge.

### Task 2: Filesystem timeline and snapshot log

**Files:**
- Create: `packages/server/src/timeline-store.test.ts`
- Create: `packages/server/src/timeline-store.ts`

1. Write failing tests for first update, merged concurrent update, duplicate
   suppression, numbered snapshots, and version restore.
2. Reuse the recording write queue pattern; do not introduce a repository
   abstraction.
3. Write `timeline.bin` and snapshot files through temporary siblings and
   rename them into place.
4. Append strict v1 metadata only after both binary writes succeed.
5. Run server tests and typecheck.

### Task 3: Authenticated timeline API

**Files:**
- Modify: `packages/server/src/server.test.ts`
- Modify: `packages/server/src/server.ts`

1. Add failing HTTP tests for binary GET/POST, role enforcement, malformed and
   oversized updates, duplicate version suppression, version listing, and
   historical snapshot retrieval.
2. Add the four routes from the design with exact content types.
3. Return `401` for no member, `403` for commenter/viewer, `400` for bad update,
   and `404` for missing version.
4. Run all server tests.

### Task 4: Editor transport and store binding

**Files:**
- Create: `packages/editor/src/timeline-sync.test.ts`
- Create: `packages/editor/src/timeline-sync.ts`
- Modify: `packages/editor/src/store.ts`
- Modify: `packages/editor/src/share.ts`
- Modify: `packages/editor/src/App.tsx`
- Modify: `packages/editor/src/style.css`

1. Test URL/token parsing, initial seed, local-update upload, remote-origin loop
   suppression, polling merge, and explicit cleanup.
2. Bind each existing timeline edit action to one Yjs map mutation.
3. Apply remote state to Zustand in one write without recreating the document.
4. Start sync after share creation or owner-URL update and expose a compact
   sync status.
5. Run editor tests, typecheck, and build.

### Task 5: Convergence and history browser proof

**Files:**
- Create: `packages/extension/e2e/timeline-collaboration.spec.ts`
- Modify: `STATUS.md`

1. Start an isolated real server and recording.
2. Open two editor contexts connected to the same owner timeline.
3. Edit different timeline items concurrently.
4. Wait for both contexts to show the same zoom/callout/redaction state.
5. Assert two changed versions, duplicate suppression, and successful version 1
   restore in a fresh Yjs document.
6. Record version count, convergence values, browser errors, unit counts,
   typecheck, build, and E2E results.
7. Run Ponytail review, merge locally, rerun all gates, and push `main` without
   a PR.
