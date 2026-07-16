# Phase 6 — Shared Review

## Goal

Let an owner invite a second person to review a recording, leave a comment on a
semantic event, publish a changed trace, and approve the result without losing
the comment's target.

This increment builds the review loop. Timeline CRDTs, snapshot history, and
shared brand kits remain later Phase 6 increments. Starting with Yjs would not
solve identity, permissions, comment anchoring, or approval.

## Storage

Keep the Phase 5 filesystem store. Each recording directory gains
`review.json`:

```ts
type ReviewDocument = {
  v: 1;
  teamId: string;
  state: 'draft' | 'in_review' | 'changes_requested' | 'approved';
  members: Array<{
    id: string;
    name: string;
    role: 'owner' | 'editor' | 'commenter' | 'viewer';
    tokenHash: string;
  }>;
  invitations: Array<{
    id: string;
    role: 'commenter' | 'viewer';
    tokenHash: string;
    usedAt: string | null;
  }>;
  comments: Array<{
    event: CommentEvent;
    authorId: string;
    createdAt: string;
    resolvedAt: string | null;
    resolution: CommentResolution;
  }>;
  presence: Array<{
    memberId: string;
    resource: string | null;
    expiresAt: string;
  }>;
};
```

Tokens are returned once and only SHA-256 hashes are stored. A recording UUID
is still needed to read the public video, but it is not enough to mutate review
state.

The server serialises writes per recording and replaces `review.json`
atomically. This prevents two comments arriving together from overwriting each
other without introducing a database.

## API

`POST /api/recordings` creates the recording and its review document. It returns
the recording id, owner token, and one commenter invitation token. Existing
bundle uploads carry the owner token in `authorization: Bearer ...`.

Review endpoints:

- `POST /api/recordings/:id/join` exchanges a one-use invitation and display
  name for a member token.
- `GET /api/recordings/:id/review` returns the safe document view for the
  authenticated member. It never returns hashes or invitation records.
- `GET /api/recordings/:id/events` returns commentable events with media time,
  accessible name, bounding box, and locators.
- `POST /api/recordings/:id/comments` accepts an event id and body. The server
  builds the `CommentEvent` from the stored trace; clients cannot invent an
  anchor.
- `PUT /api/recordings/:id/state` changes the review state. Only owner/editor
  may request review, request changes, or approve.
- `PUT /api/recordings/:id/presence` renews a short lease and optionally claims
  a soft lock resource. Conflicting locks are reported, never made hard.

Malformed bodies, invalid tokens, reused invitations, unknown events, empty
comments, and forbidden role actions are explicit 4xx results.

## Review page

The existing `/r/:id` page stays dependency-free. It becomes a compact review
instrument with:

- video and amber bounding-box overlay;
- semantic event list with media time and target name;
- comment composer for authenticated commenters, editors, and owners;
- comment list showing `matched`, `drifted`, or `orphaned` state;
- exact review-state controls for owner/editor;
- current team presence and soft-lock notice.

A plain public URL is view-only. An invitation URL asks for a display name once,
exchanges the invitation, and keeps the member token in that browser's session
storage. Owner URLs contain the initial owner token in the fragment, not the
query string, so it is not sent in HTTP logs or referrers.

The page polls review/presence rather than opening a websocket. That is enough
for comments, approval, and visible presence; Yjs will introduce a persistent
transport when simultaneous timeline edits exist.

## Re-edit

An authenticated owner may replace bundle files on the same recording. Before
committing a new `trace.jsonl`, the server parses it and fits its media clock.
Every unresolved comment is passed to `reanchorComments`:

- `matched`: update to the new event and media time;
- `drifted`: update to the candidate and show confirmation required;
- `orphaned`: retain the fallback media time and report the removed target.

If the new trace cannot be parsed or its clock cannot be fitted, the upload is
rejected and the previous trace and review document stay intact.

## Verification

Unit and HTTP tests cover token hashing, one-use invitations, role enforcement,
concurrent-safe writes, server-constructed anchors, state transitions, presence
leases, and all three re-anchoring outcomes.

A browser test uses two isolated contexts:

1. owner opens the owner link;
2. reviewer joins from the invitation link;
3. reviewer comments on a semantic event;
4. owner sees the comment and requests review;
5. a changed trace moves the event timestamp;
6. both sessions see the comment at the new timestamp;
7. owner approves.

The measured old and new timestamps, two distinct member ids, final review
state, and browser error count are recorded in `STATUS.md`.
