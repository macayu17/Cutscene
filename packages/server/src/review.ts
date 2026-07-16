import { createHash } from 'node:crypto';
import { parseTraceEvent, type CommentEvent, type CommentResolution, type Result } from '@cutscene/trace';

export type MemberRole = 'owner' | 'editor' | 'commenter' | 'viewer';
export type ReviewState = 'draft' | 'in_review' | 'changes_requested' | 'approved' | 'published' | 'outdated';

export type ReviewMember = { id: string; name: string; role: MemberRole; tokenHash: string };
export type ReviewInvitation = {
  id: string;
  role: 'commenter' | 'viewer';
  tokenHash: string;
  usedAt: string | null;
};
export type StoredComment = {
  event: CommentEvent;
  authorId: string;
  createdAt: string;
  resolvedAt: string | null;
  resolution: CommentResolution;
};
export type PresenceLease = { memberId: string; resource: string | null; expiresAt: string };

export type ReviewDocument = {
  v: 1;
  teamId: string;
  state: ReviewState;
  members: ReviewMember[];
  invitations: ReviewInvitation[];
  comments: StoredComment[];
  presence: PresenceLease[];
};

export type ReviewView = Omit<ReviewDocument, 'members' | 'invitations'> & {
  currentMemberId: string;
  members: Array<Omit<ReviewMember, 'tokenHash'>>;
};

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createReviewDocument(input: {
  teamId: string;
  ownerId: string;
  ownerName: string;
  ownerToken: string;
  invitationId: string;
  invitationToken: string;
  now: string;
}): ReviewDocument {
  return {
    v: 1,
    teamId: input.teamId,
    state: 'draft',
    members: [{ id: input.ownerId, name: input.ownerName, role: 'owner', tokenHash: hashToken(input.ownerToken) }],
    invitations: [{ id: input.invitationId, role: 'commenter', tokenHash: hashToken(input.invitationToken), usedAt: null }],
    comments: [],
    presence: [],
  };
}

export function authenticate(review: ReviewDocument, token: string): ReviewMember | null {
  if (!token) return null;
  const tokenHash = hashToken(token);
  return review.members.find((member) => member.tokenHash === tokenHash) ?? null;
}

export function joinReview(review: ReviewDocument, input: {
  invitationToken: string;
  memberId: string;
  memberToken: string;
  name: string;
  now: string;
}): Result<ReviewDocument> {
  const name = input.name.trim();
  if (!name || name.length > 80) return { ok: false, error: 'name must be between 1 and 80 characters' };
  const invitationHash = hashToken(input.invitationToken);
  const invitation = review.invitations.find((candidate) =>
    candidate.tokenHash === invitationHash && candidate.usedAt === null);
  if (!invitation) return { ok: false, error: 'invitation is invalid or already used' };
  return {
    ok: true,
    value: {
      ...review,
      members: [...review.members, {
        id: input.memberId,
        name,
        role: invitation.role,
        tokenHash: hashToken(input.memberToken),
      }],
      invitations: review.invitations.map((candidate) =>
        candidate.id === invitation.id ? { ...candidate, usedAt: input.now } : candidate),
    },
  };
}

export function publicReview(review: ReviewDocument, currentMemberId: string, now: string): ReviewView {
  return {
    v: 1,
    teamId: review.teamId,
    state: review.state,
    currentMemberId,
    members: review.members.map(({ id, name, role }) => ({ id, name, role })),
    comments: review.comments,
    presence: review.presence.filter((lease) => lease.expiresAt > now),
  };
}

export function canComment(role: MemberRole): boolean {
  return role !== 'viewer';
}

export function canApprove(role: MemberRole): boolean {
  return role === 'owner' || role === 'editor';
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function member(value: unknown): value is ReviewMember {
  return record(value) && typeof value.id === 'string' && typeof value.name === 'string' &&
    ['owner', 'editor', 'commenter', 'viewer'].includes(String(value.role)) && typeof value.tokenHash === 'string';
}

function invitation(value: unknown): value is ReviewInvitation {
  return record(value) && typeof value.id === 'string' && ['commenter', 'viewer'].includes(String(value.role)) &&
    typeof value.tokenHash === 'string' && (value.usedAt === null || typeof value.usedAt === 'string');
}

function resolution(value: unknown): value is CommentResolution {
  if (!record(value) || typeof value.commentId !== 'string') return false;
  if (value.status === 'orphaned') return typeof value.mediaTimeMs === 'number' && Number.isFinite(value.mediaTimeMs);
  return (value.status === 'matched' || value.status === 'drifted') && typeof value.eventId === 'string' &&
    typeof value.stepId === 'string' && typeof value.mediaTimeMs === 'number' && Number.isFinite(value.mediaTimeMs) &&
    typeof value.confidence === 'number' && Number.isFinite(value.confidence);
}

function comment(value: unknown): value is StoredComment {
  if (!record(value)) return false;
  const parsed = parseTraceEvent(value.event);
  return parsed.ok && parsed.value.type === 'annotation.comment' && typeof value.authorId === 'string' &&
    typeof value.createdAt === 'string' && (value.resolvedAt === null || typeof value.resolvedAt === 'string') &&
    resolution(value.resolution);
}

function lease(value: unknown): value is PresenceLease {
  return record(value) && typeof value.memberId === 'string' &&
    (value.resource === null || typeof value.resource === 'string') && typeof value.expiresAt === 'string';
}

export function parseReviewDocument(value: unknown): Result<ReviewDocument> {
  if (!record(value) || value.v !== 1 || typeof value.teamId !== 'string' ||
      !['draft', 'in_review', 'changes_requested', 'approved', 'published', 'outdated'].includes(String(value.state)) ||
      !Array.isArray(value.members) || !value.members.every(member) ||
      !Array.isArray(value.invitations) || !value.invitations.every(invitation) ||
      !Array.isArray(value.comments) || !value.comments.every(comment) ||
      !Array.isArray(value.presence) || !value.presence.every(lease)) {
    return { ok: false, error: 'review.json is invalid' };
  }
  return { ok: true, value: value as ReviewDocument };
}
