import type { MediaClockFit } from './clock';
import type { CommentEvent, Locator, TraceEvent } from './schema';

export type CommentResolution =
  | { commentId: string; status: 'matched' | 'drifted'; eventId: string;
      stepId: string; mediaTimeMs: number; confidence: number }
  | { commentId: string; status: 'orphaned'; mediaTimeMs: number };

type Candidate = {
  event: TraceEvent;
  index: number;
  confidence: number;
  mediaTimeMs: number;
  sameStep: boolean;
  distance: number;
};

function sameLocator(left: Locator, right: Locator): boolean {
  if (left.type !== right.type) return false;
  if (left.type === 'role' && right.type === 'role') return left.role === right.role && left.name === right.name;
  return left.type !== 'role' && right.type !== 'role' && left.value === right.value;
}

function strongestSharedConfidence(left: readonly Locator[], right: readonly Locator[]): number | null {
  let strongest: number | null = null;
  for (const oldLocator of left) {
    for (const newLocator of right) {
      if (!sameLocator(oldLocator, newLocator)) continue;
      const confidence = Math.min(oldLocator.confidence, newLocator.confidence);
      strongest = strongest === null ? confidence : Math.max(strongest, confidence);
    }
  }
  return strongest;
}

function compareCandidates(left: Candidate, right: Candidate): number {
  return right.confidence - left.confidence || Number(right.sameStep) - Number(left.sameStep) ||
    left.distance - right.distance || left.index - right.index;
}

export function reanchorComments(comments: readonly CommentEvent[], events: readonly TraceEvent[],
  clock: MediaClockFit): CommentResolution[] {
  return comments.map((comment) => {
    const candidates = events.flatMap((event, index): Candidate[] => {
      if (!event.target) return [];
      const confidence = strongestSharedConfidence(comment.anchor.locators, event.target.locators);
      if (confidence === null) return [];
      const mediaTimeMs = clock.toMediaTime(event.t);
      return [{ event, index, confidence, mediaTimeMs, sameStep: event.stepId === comment.anchor.stepId,
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
