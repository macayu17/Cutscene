# Comment Re-anchoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse strict element-anchored comments and deterministically resolve them against a changed trace.

**Architecture:** `packages/trace/schema.ts` owns the v1 comment payload. A new DOM-free `comments.ts` compares recorded locator identity, uses the existing media clock for new timestamps, and returns a discriminated resolution without mutating either trace.

**Tech Stack:** TypeScript strict, Vitest, existing `@cutscene/trace` types and clock model.

---

### Task 1: Make `annotation.comment` a strict schema type

**Files:**
- Modify: `packages/trace/src/schema.test.ts`
- Modify: `packages/trace/src/schema.ts`

- [ ] **Step 1: Write the failing schema tests**

Add a valid v1 payload with:

```ts
{
  ...envelope,
  type: 'annotation.comment',
  anchor: {
    stepId: 'step_3',
    locators: [{ type: 'testId', value: 'export-pdf', confidence: 1 }],
    mediaTimeMs: 4_200,
  },
  body: 'Mention PDF export.',
}
```

Assert its `TraceEvent` extract equals exported `CommentEvent`. Assert parsing
rejects an empty body, negative/non-finite media time, missing step id, invalid
locators, extra fields, and `target`.

```ts
expectTypeOf<Extract<TraceEvent, { type: 'annotation.comment' }>>()
  .toEqualTypeOf<CommentEvent>();
expect(parseTraceEvent(comment)).toEqual({ ok: true, value: comment });
for (const invalid of [
  { ...comment, body: '   ' },
  { ...comment, anchor: { ...comment.anchor, mediaTimeMs: -1 } },
  { ...comment, anchor: { ...comment.anchor, mediaTimeMs: Number.NaN } },
  { ...comment, anchor: { ...comment.anchor, stepId: '' } },
  { ...comment, anchor: { ...comment.anchor, locators: {} } },
  { ...comment, extra: true },
  { ...comment, target: {} },
]) expect(parseTraceEvent(invalid)).toEqual({ ok: false, error: 'comment annotation is invalid' });
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @cutscene/trace test -- schema.test.ts`

Expected: FAIL because `annotation.comment` is still the generic event envelope.

- [ ] **Step 3: Implement the strict type and parser**

Export:

```ts
export type CommentEvent = Omit<EventEnvelope, 'target'> & {
  type: 'annotation.comment';
  anchor: { stepId: string; locators: Locator[]; mediaTimeMs: number };
  body: string;
  target?: never;
};
```

Exclude `annotation.comment` from the generic event union, include
`CommentEvent` in `TraceEvent`, and validate only the exact envelope, anchor,
and body keys.

```ts
const commentKeys = new Set(['v', 'id', 't', 'type', 'stepId', 'route',
  'viewport', 'scroll', 'anchor', 'body']);
const commentAnchorKeys = new Set(['stepId', 'locators', 'mediaTimeMs']);

function isComment(value: Record<string, unknown>): boolean {
  const anchor = value.anchor;
  return isRecord(anchor) && typeof anchor.stepId === 'string' && anchor.stepId.length > 0 &&
    isLocators(anchor.locators) && hasNumber(anchor, 'mediaTimeMs') && anchor.mediaTimeMs >= 0 &&
    hasOnlyKeys(anchor, commentAnchorKeys) && typeof value.body === 'string' && value.body.trim().length > 0 &&
    hasOnlyKeys(value, commentKeys);
}
```

- [ ] **Step 4: Verify GREEN**

Run: `pnpm --filter @cutscene/trace test -- schema.test.ts`

Expected: all schema tests pass.

### Task 2: Resolve comments against a changed trace

**Files:**
- Create: `packages/trace/src/comments.test.ts`
- Create: `packages/trace/src/comments.ts`
- Modify: `packages/trace/src/index.ts`

- [ ] **Step 1: Write failing resolution tests**

Create comments and new click events with ranked locators. Assert:

```ts
reanchorComments([comment], changedEvents, clock)
```

returns `matched` with a moved timestamp for shared confidence `>= 0.8`,
`drifted` for text/CSS confidence, and `orphaned` with the original fallback
time when no locator matches. Add a tie test proving same step id wins before
timestamp proximity.

```ts
expect(reanchorComments([comment], [movedStrongTarget], clock)).toEqual([{
  commentId: comment.id, status: 'matched', eventId: movedStrongTarget.id,
  stepId: movedStrongTarget.stepId, mediaTimeMs: movedStrongTarget.t, confidence: 1,
}]);
expect(reanchorComments([textComment], [movedTextTarget], clock)[0]?.status).toBe('drifted');
expect(reanchorComments([comment], [], clock)).toEqual([{
  commentId: comment.id, status: 'orphaned', mediaTimeMs: comment.anchor.mediaTimeMs,
}]);
expect(reanchorComments([comment], [closerOtherStep, fartherSameStep], clock)[0])
  .toMatchObject({ eventId: fartherSameStep.id });
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @cutscene/trace test -- comments.test.ts`

Expected: FAIL because `reanchorComments` does not exist.

- [ ] **Step 3: Implement the minimum resolver**

Export a discriminated result:

```ts
export type CommentResolution =
  | { commentId: string; status: 'matched' | 'drifted'; eventId: string;
      stepId: string; mediaTimeMs: number; confidence: number }
  | { commentId: string; status: 'orphaned'; mediaTimeMs: number };
```

For every target event, compute the strongest identical locator using the
lower old/new confidence. Sort candidates by confidence, same-step preference,
fallback-time distance, then original event index. Use `0.8` as the matched
threshold and preserve the fallback time for an orphan.

```ts
export function reanchorComments(comments: readonly CommentEvent[], events: readonly TraceEvent[],
  clock: MediaClockFit): CommentResolution[] {
  return comments.map((comment) => {
    const candidates = events.flatMap((event, index) => {
      if (!event.target) return [];
      const confidence = strongestSharedConfidence(comment.anchor.locators, event.target.locators);
      if (confidence === null) return [];
      const mediaTimeMs = clock.toMediaTime(event.t);
      return [{ event, index, confidence, mediaTimeMs,
        sameStep: event.stepId === comment.anchor.stepId,
        distance: Math.abs(mediaTimeMs - comment.anchor.mediaTimeMs) }];
    }).sort(compareCandidates);
    const winner = candidates[0];
    return winner ? {
      commentId: comment.id,
      status: winner.confidence >= 0.8 ? 'matched' : 'drifted',
      eventId: winner.event.id,
      stepId: winner.event.stepId,
      mediaTimeMs: winner.mediaTimeMs,
      confidence: winner.confidence,
    } : { commentId: comment.id, status: 'orphaned', mediaTimeMs: comment.anchor.mediaTimeMs };
  });
}
```

- [ ] **Step 4: Verify GREEN**

Run: `pnpm --filter @cutscene/trace test -- comments.test.ts`

Expected: all matched, drifted, orphaned, and tie tests pass.

- [ ] **Step 5: Commit the core**

```sh
git add packages/trace/src/schema.ts packages/trace/src/schema.test.ts packages/trace/src/comments.ts packages/trace/src/comments.test.ts packages/trace/src/index.ts
git commit -m "feat(trace): re-anchor element comments"
```

### Task 3: Verify and record the Phase 6 increment

**Files:**
- Modify: `STATUS.md`

- [ ] **Step 1: Run all gates**

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm e2e
```

Expected: every command exits `0`.

- [ ] **Step 2: Record exact evidence**

Add the comment schema, three resolution states, deterministic tie rule, and
test counts beneath the Phase 6 section in `STATUS.md`. Do not claim the Phase
6 exit criterion; shared reviewer UI and approval remain unbuilt.

- [ ] **Step 3: Commit and publish**

```sh
git add STATUS.md
git commit -m "docs: record Phase 6 re-anchoring core"
git push origin main
```

Do not open a pull request.
