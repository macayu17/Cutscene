# Editor Share Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user upload the loaded recording from the editor and receive a public share link without manual HTTP commands.

**Architecture:** Keep the original three `File` objects returned by bundle loading. A small editor client performs the existing POST/PUT API sequence; the server adds browser CORS/preflight support. `App.tsx` owns only transient upload state and renders one button plus one result.

**Tech Stack:** React, TypeScript, native `fetch`, Node `http`, Vitest, plain CSS.

---

### Task 1: Permit browser API requests

**Files:**
- Create: `packages/server/src/server.test.ts`
- Modify: `packages/server/src/server.ts`

- [ ] **Step 1: Write the failing preflight test**

Start `handle` through a real `node:http` server in the test and request `OPTIONS /api/recordings` with an `Origin` header. Assert status `204`, `access-control-allow-origin: *`, and methods containing `POST` and `PUT`. Also POST once and assert its response carries the allow-origin header.

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @cutscene/server test -- server.test.ts`

Expected: FAIL because OPTIONS currently returns `404` and API responses have no CORS header.

- [ ] **Step 3: Add the minimum CORS handling**

At the start of `handle`, set `access-control-allow-origin: *`. Return an empty `204` response for OPTIONS with:

```ts
{
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
  'access-control-allow-headers': 'content-type',
}
```

- [ ] **Step 4: Verify GREEN**

Run: `pnpm --filter @cutscene/server test -- server.test.ts`

Expected: the browser API test passes.

### Task 2: Upload the original bundle files

**Files:**
- Modify: `packages/editor/src/bundle.test.ts`
- Modify: `packages/editor/src/bundle.ts`
- Create: `packages/editor/src/share.test.ts`
- Create: `packages/editor/src/share.ts`

- [ ] **Step 1: Write the failing bundle-file test**

Load valid named files and assert `readBundleFiles` returns the same objects as:

```ts
files: { media, trace, meta }
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @cutscene/editor test -- bundle.test.ts`

Expected: FAIL because only the media file is currently retained.

- [ ] **Step 3: Preserve all three files**

Export this type and return it from `readBundleFiles`:

```ts
export type BundleFiles = { media: File; trace: File; meta: File };
```

- [ ] **Step 4: Verify bundle GREEN**

Run: `pnpm --filter @cutscene/editor test -- bundle.test.ts`

Expected: the original-file assertion passes.

- [ ] **Step 5: Write failing share-client tests**

Stub global `fetch`. Assert `createShareLink('https://share.example/', files)` performs one POST followed by PUTs for `media.webm`, `trace.jsonl`, and `meta.json`, then returns:

```ts
{ ok: true, value: `https://share.example/r/${id}` }
```

Add one failure assertion showing a rejected PUT returns `Upload trace.jsonl failed (400).` and does not continue.

- [ ] **Step 6: Verify share RED**

Run: `pnpm --filter @cutscene/editor test -- share.test.ts`

Expected: FAIL because `createShareLink` does not exist.

- [ ] **Step 7: Implement the native-fetch client**

Validate an HTTP(S) server URL, POST `/api/recordings`, require a string `id`, PUT the three files sequentially, and return `Result<string>`. Catch network errors as `Share server request failed: <message>`.

- [ ] **Step 8: Verify share GREEN**

Run: `pnpm --filter @cutscene/editor test -- share.test.ts`

Expected: both upload-sequence tests pass.

### Task 3: Expose sharing in the editor and prove the flow

**Files:**
- Modify: `packages/editor/src/App.tsx`
- Modify: `packages/editor/src/style.css`
- Modify: `README.md`
- Modify: `STATUS.md`

- [ ] **Step 1: Wire the tested client into the existing load path**

Keep `BundleFiles` in local state when a load succeeds. Add `Create share link` to the top bar. Prompt for the server URL with `http://localhost:4180`, disable the button during upload, and render either the returned link or the precise error without unloading the recording.

- [ ] **Step 2: Add only status styling**

Use the existing graphite tokens and normal text colour. Do not use amber, animation, a modal framework, or a new panel.

- [ ] **Step 3: Run focused and full verification**

Run:

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm e2e
```

Expected: every command exits `0`.

- [ ] **Step 4: Drive the real editor-to-server path**

Start the share server and editor locally, load the real Phase 0 bundle, click `Create share link`, and verify the returned `/r/:id` page is `200` and serves media bytes identical to the source.

- [ ] **Step 5: Record evidence and version the change**

Update README usage and STATUS evidence with the measured HTTP results. Commit focused changes and push `main` directly; do not open a PR.
