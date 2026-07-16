# Phase 6 — Yjs Timeline and Version History

## Goal

Make zooms, callouts, and redactions converge when two editors change different
items, and derive inspectable version history from the same Yjs state.

Presence and soft locks already exist. This increment adds the second and third
multiplayer steps in PRD.md §12 without changing video transport.

## Dependency

Use `yjs@^13.6.31`, the current stable 13.x release. Do not add a provider
package. Yjs document updates are network-independent, commutative, associative,
and idempotent, so the existing authenticated HTTP server is sufficient.

## Document shape

Every recording owns one `Y.Doc` with a top-level array:

```ts
const timeline = document.getArray<Y.Map<unknown>>('timeline');
```

Each item is a `Y.Map` with `kind`, `id`, and `order` plus scalar fields:

- `zoom`: `eventId`, `startMs`, `clickMs`, `endMs`, `focus`, `scale`,
  `viewport`
- `callout`: `sourceEventId`, `stepId`, `locators`, `text`, `placement`
- `redaction`: `selector`, `enabled`

`focus`, `viewport`, and `locators` are JSON values replaced as a whole. They
are never mutated after reading from a shared map. Ordering is a scalar so an
item does not have to be moved between array positions, which Yjs forbids for
integrated shared types.

The adapter validates every map before exposing it to Zustand. An invalid or
unknown item is ignored and reported; it cannot poison the editor state.

## Editor binding

`packages/editor/src/timeline-document.ts` owns all Yjs knowledge. It exposes
functions, not a class:

```ts
type TimelineDocument = {
  document: Y.Doc;
  read(): TimelineState;
  initialize(state: TimelineState): void;
  upsert(item: TimelineItem): void;
  remove(kind: TimelineKind, id: string): void;
  observe(listener: (state: TimelineState) => void): () => void;
};
```

Existing store actions keep their current pure edit functions. When a shared
document is connected, each action writes only the affected map. Remote Yjs
transactions update the three Zustand arrays in one store write. Transaction
origins prevent remote updates from being posted back as local changes.

Creating a share link seeds the server timeline from the current editor state
and starts sync. Updating a shared demo reconnects using the owner URL. A small
status in the top bar reports `timeline synced`, `syncing`, or the exact error.

## HTTP transport

Authenticated owner/editor endpoints:

- `GET /api/recordings/:id/timeline` returns the merged update as
  `application/octet-stream`.
- `POST /api/recordings/:id/timeline` accepts a binary Yjs update, applies it,
  and returns the current version number.
- `GET /api/recordings/:id/versions` returns version metadata.
- `GET /api/recordings/:id/versions/:version` returns that version's full Yjs
  update.

The client posts local `document.on('update')` payloads and polls the merged
update. Applying a remote update uses an explicit remote origin and therefore
does not cause an upload loop.

HTTP polling is deliberate. Presence already uses leases, and adding a socket
provider now would create a second server lifecycle without changing merge
semantics. A websocket can replace transport later without changing the
document or storage format.

## Storage and history

Each recording directory gains:

```text
timeline.bin
timeline-versions/
  000001.bin
  000002.bin
timeline-history.jsonl
```

Updates for one recording are serialised with the existing per-recording write
queue. The server:

1. loads `timeline.bin` into a `Y.Doc`;
2. records the old state vector;
3. applies the submitted update;
4. skips persistence if the state vector is unchanged;
5. writes the merged full update atomically;
6. writes the numbered snapshot;
7. appends `{v:1, version, memberId, createdAt, bytes}`.

The log is metadata; the numbered update is the restorable state. No separate
diff format is invented.

## Limits and permissions

Timeline updates and snapshots are capped at 5 MB each. Only owner/editor may
write or read historical snapshots. Commenter/viewer may receive the current
timeline later for rendered review, but cannot mutate it in this increment.

Malformed Yjs updates return `400`. Unknown recordings return `404`; missing or
forbidden credentials return `401`/`403`. A failed merge leaves the last valid
timeline and history untouched.

## Verification

- Unit tests round-trip every timeline item and reject malformed maps.
- Two independent documents edit different items concurrently; applying their
  updates to the server in reverse order produces byte-equivalent JSON state.
- Reapplying an update is idempotent and does not create a version.
- Version 1 remains readable after version 2 and restores its earlier state.
- Commenter cannot post a timeline update.
- Editor/store tests prove a remote transaction updates segments, callouts, and
  redactions without an upload loop.
- Browser verification uses two owner sessions, edits different timeline
  items, waits for polling, and proves both screens converge.
