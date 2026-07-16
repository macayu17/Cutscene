import { describe, expect, it } from 'vitest';
import { authenticate, canApprove, canComment, createReviewDocument, joinReview, publicReview } from './review.ts';

const seeded = () => createReviewDocument({
  teamId: 'team_1', ownerId: 'member_owner', ownerName: 'Owner', ownerToken: 'owner-secret',
  invitationToken: 'invite-secret',
});

describe('review document', () => {
  it('stores only token hashes and authenticates the owner', () => {
    const review = seeded();

    expect(JSON.stringify(review)).not.toContain('owner-secret');
    expect(JSON.stringify(review)).not.toContain('invite-secret');
    expect(authenticate(review, 'owner-secret')).toMatchObject({ id: 'member_owner', role: 'owner' });
    expect(authenticate(review, 'wrong')).toBeNull();
  });

  it('exchanges an invitation once for a distinct commenter', () => {
    const first = joinReview(seeded(), {
      invitationToken: 'invite-secret', memberId: 'member_reviewer', memberToken: 'reviewer-secret',
      name: 'Reviewer', now: '2026-07-16T10:01:00.000Z',
    });

    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(authenticate(first.value, 'reviewer-secret')).toMatchObject({
      id: 'member_reviewer', name: 'Reviewer', role: 'commenter',
    });
    expect(joinReview(first.value, {
      invitationToken: 'invite-secret', memberId: 'member_other', memberToken: 'other-secret',
      name: 'Other', now: '2026-07-16T10:02:00.000Z',
    })).toEqual({ ok: false, error: 'invitation is invalid or already used' });
  });

  it('publishes no credentials and exposes only active presence', () => {
    const review = seeded();
    review.presence.push(
      { memberId: 'member_owner', resource: 'timeline', expiresAt: '2026-07-16T10:00:30.000Z' },
      { memberId: 'expired', resource: null, expiresAt: '2026-07-16T09:59:59.000Z' },
    );

    const view = publicReview(review, 'member_owner', '2026-07-16T10:00:00.000Z');
    expect(view).toMatchObject({ v: 1, teamId: 'team_1', state: 'draft', currentMemberId: 'member_owner' });
    expect(view.presence).toEqual([{ memberId: 'member_owner', resource: 'timeline', expiresAt: '2026-07-16T10:00:30.000Z' }]);
    expect(JSON.stringify(view)).not.toContain('tokenHash');
    expect(JSON.stringify(view)).not.toContain('invitations');
  });

  it('enforces commenter and approval roles', () => {
    expect(canComment('owner')).toBe(true);
    expect(canComment('editor')).toBe(true);
    expect(canComment('commenter')).toBe(true);
    expect(canComment('viewer')).toBe(false);
    expect(canApprove('owner')).toBe(true);
    expect(canApprove('editor')).toBe(true);
    expect(canApprove('commenter')).toBe(false);
    expect(canApprove('viewer')).toBe(false);
  });
});
