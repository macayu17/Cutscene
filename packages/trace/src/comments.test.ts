import { describe, expect, it } from 'vitest';
import { reanchorComments } from './comments';
import type { CommentEvent, Locator, MediaClockFit, TraceEvent } from './index';

const clock: MediaClockFit = { slope: 1, intercept: 0, toMediaTime: (value) => value };
const viewport = { width: 1_280, height: 800, dpr: 1 };
const scroll = { x: 0, y: 0 };

function click(id: string, stepId: string, t: number, locators: Locator[]): TraceEvent {
  return {
    v: 1, id, stepId, t, type: 'interaction.click', route: '/', viewport, scroll,
    target: {
      role: 'button', accessibleName: 'Export PDF', text: 'Export PDF', tagName: 'BUTTON',
      boundingBox: { x: 400, y: 300, width: 120, height: 40 }, locators,
    },
  };
}

function anchored(locators: Locator[], overrides: Partial<CommentEvent> = {}): CommentEvent {
  return {
    v: 1, id: 'comment_1', stepId: 'review_step', t: 4_200, type: 'annotation.comment', route: '/', viewport, scroll,
    anchor: { stepId: 'step_3', locators, mediaTimeMs: 4_200 }, body: 'Mention PDF export.', ...overrides,
  };
}

describe('reanchorComments', () => {
  it('moves a strong locator match to its changed media time', () => {
    const comment = anchored([{ type: 'testId', value: 'export-pdf', confidence: 1 }]);
    const moved = click('new_event', 'step_7', 7_100, [{ type: 'testId', value: 'export-pdf', confidence: 1 }]);

    expect(reanchorComments([comment], [moved], clock)).toEqual([{
      commentId: comment.id, status: 'matched', eventId: moved.id, stepId: moved.stepId,
      mediaTimeMs: 7_100, confidence: 1,
    }]);
  });

  it('flags a text-only match as drifted', () => {
    const comment = anchored([{ type: 'text', value: 'Export PDF', confidence: 0.6 }]);
    const moved = click('new_event', 'step_7', 7_100, [{ type: 'text', value: 'Export PDF', confidence: 0.6 }]);

    expect(reanchorComments([comment], [moved], clock)[0]).toEqual({
      commentId: comment.id, status: 'drifted', eventId: moved.id, stepId: moved.stepId,
      mediaTimeMs: 7_100, confidence: 0.6,
    });
  });

  it('keeps the fallback time when the element is gone', () => {
    const comment = anchored([{ type: 'role', role: 'button', name: 'Export PDF', confidence: 0.9 }]);

    expect(reanchorComments([comment], [], clock)).toEqual([{
      commentId: comment.id, status: 'orphaned', mediaTimeMs: 4_200,
    }]);
  });

  it('prefers the original step before timestamp proximity when confidence ties', () => {
    const locator: Locator = { type: 'role', role: 'button', name: 'Export PDF', confidence: 0.9 };
    const comment = anchored([locator]);
    const closerOtherStep = click('close', 'step_9', 4_300, [locator]);
    const fartherSameStep = click('same-step', 'step_3', 6_000, [locator]);

    expect(reanchorComments([comment], [closerOtherStep, fartherSameStep], clock)[0])
      .toMatchObject({ status: 'matched', eventId: 'same-step', mediaTimeMs: 6_000 });
  });
});
