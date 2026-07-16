# Phase 6 — Comment Re-anchoring Core

## Goal

Implement the semantic core of Phase 6: a comment anchored to an element can
move to that element in a changed trace and is classified as `matched`,
`drifted`, or `orphaned`.

This is the first Phase 6 sub-project. Shared reviewer UI, persistence, approval
state, presence, Yjs, teams, and version history follow as separate increments.

## Comment schema

`annotation.comment` becomes a strict v1 trace event matching PRD.md §12:

```ts
type CommentEvent = Omit<EventEnvelope, 'target'> & {
  type: 'annotation.comment';
  anchor: {
    stepId: string;
    locators: Locator[];
    mediaTimeMs: number;
  };
  body: string;
  target?: never;
};
```

The body must contain non-whitespace text. `mediaTimeMs` must be finite and
non-negative. The parser rejects unknown fields and any `target` payload.

## Resolution

`packages/trace` owns re-anchoring. It compares each comment's ranked locators
with the target locators in the new trace. Locator identity ignores confidence:
`role` uses role and name; every other locator uses type and value.

Candidate order is deterministic:

1. highest shared confidence, using the lower confidence from the old and new
   locator;
2. same `stepId` as the original anchor;
3. media time closest to the fallback `mediaTimeMs`;
4. event order in the new trace.

The winning candidate is classified using the existing locator tiers:

- confidence `>= 0.8` (`testId`, `role`, `label`) → `matched`;
- confidence `< 0.8` (`text`, `css`) → `drifted`;
- no shared locator → `orphaned`.

A matched or drifted result reports the new event id, step id, mapped media
time, and confidence. An orphaned result retains only the comment id and its
fallback media time. Re-anchoring never invents a selector or silently treats a
timestamp as a semantic match.

## Boundaries

- No DOM resolution. Both inputs are recorded traces.
- No server storage, author identity, threads, reactions, or review states in
  this increment.
- No configurable threshold. The project already defines locator confidence.
- No mutation of the source comment or either trace.

## Verification

Unit tests prove strict comment parsing, high-confidence movement to a changed
timestamp, low-confidence drift, orphaning, and deterministic tie-breaking.
The full repository test, typecheck, build, and capture E2E gates remain green.
