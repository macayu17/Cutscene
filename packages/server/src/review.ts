import { createHash } from 'node:crypto';
import { parseTraceEvent, type CommentEvent, type CommentResolution, type Result } from '@cutscene/trace';

export type MemberRole = 'owner' | 'editor' | 'commenter' | 'viewer';
export type MemberScope = 'team' | 'project';
export type InvitationRole = Exclude<MemberRole, 'owner'>;
export type SharedBrandPreset = {
  id: string;
  name: string;
  color: string;
  font: 'mono' | 'sans' | 'serif';
  intro: string;
  outro: string;
  watermark: string;
};
export type ReviewState = 'draft' | 'in_review' | 'changes_requested' | 'approved' | 'published' | 'outdated';

export type ReviewMember = { id: string; name: string; role: MemberRole; scope: MemberScope; tokenHash: string };
export type ReviewInvitation = {
  id: string;
  role: InvitationRole;
  scope: MemberScope;
  tokenHash: string;
  usedAt: string | null;
  revokedAt: string | null;
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
  brandKit: SharedBrandPreset[];
  comments: StoredComment[];
  presence: PresenceLease[];
};

export type ReviewView = Omit<ReviewDocument, 'members' | 'invitations'> & {
  currentMemberId: string;
  members: Array<Omit<ReviewMember, 'tokenHash'>>;
  invitations: Array<Pick<ReviewInvitation, 'id' | 'role' | 'scope'> & {
    status: 'pending' | 'used' | 'revoked';
  }>;
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
}): ReviewDocument {
  return {
    v: 1,
    teamId: input.teamId,
    state: 'draft',
    members: [{ id: input.ownerId, name: input.ownerName, role: 'owner', scope: 'team',
      tokenHash: hashToken(input.ownerToken) }],
    invitations: [{ id: input.invitationId, role: 'commenter', scope: 'project',
      tokenHash: hashToken(input.invitationToken), usedAt: null, revokedAt: null }],
    brandKit: [],
    comments: [],
    presence: [],
  };
}

function brandPreset(value: unknown): value is SharedBrandPreset {
  if (!record(value) || Object.keys(value).sort().join('\0') !==
      ['color', 'font', 'id', 'intro', 'name', 'outro', 'watermark'].join('\0')) return false;
  return typeof value.id === 'string' && value.id.trim().length > 0 && value.id.length <= 80 &&
    typeof value.name === 'string' && value.name.trim().length > 0 && value.name.length <= 80 &&
    typeof value.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value.color) &&
    ['mono', 'sans', 'serif'].includes(String(value.font)) &&
    typeof value.intro === 'string' && value.intro.length <= 200 &&
    typeof value.outro === 'string' && value.outro.length <= 200 &&
    typeof value.watermark === 'string' && value.watermark.length <= 200;
}

function parseBrandKit(value: unknown): Result<SharedBrandPreset[]> {
  if (!Array.isArray(value) || value.length > 50 || !value.every(brandPreset)) {
    return { ok: false, error: 'brand kit is invalid' };
  }
  const ids = value.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) return { ok: false, error: 'brand kit contains duplicate ids' };
  return { ok: true, value };
}

export function replaceBrandKit(review: ReviewDocument, value: unknown): Result<ReviewDocument> {
  const brandKit = parseBrandKit(value);
  return brandKit.ok ? { ok: true, value: { ...review, brandKit: brandKit.value } } : brandKit;
}

export function addInvitation(review: ReviewDocument, input: {
  id: string;
  token: string;
  role: InvitationRole;
  scope: MemberScope;
}): ReviewDocument {
  return { ...review, invitations: [...review.invitations, {
    id: input.id, role: input.role, scope: input.scope, tokenHash: hashToken(input.token),
    usedAt: null, revokedAt: null,
  }] };
}

export function revokeInvitation(review: ReviewDocument, id: string, now: string): Result<ReviewDocument> {
  const invitation = review.invitations.find((candidate) => candidate.id === id);
  if (!invitation || invitation.usedAt !== null || invitation.revokedAt !== null) {
    return { ok: false, error: 'pending invitation not found' };
  }
  return { ok: true, value: { ...review, invitations: review.invitations.map((candidate) =>
    candidate.id === id ? { ...candidate, revokedAt: now } : candidate) } };
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
    candidate.tokenHash === invitationHash && candidate.usedAt === null && candidate.revokedAt === null);
  if (!invitation) return { ok: false, error: 'invitation is invalid or already used' };
  return {
    ok: true,
    value: {
      ...review,
      members: [...review.members, {
        id: input.memberId,
        name,
        role: invitation.role,
        scope: invitation.scope,
        tokenHash: hashToken(input.memberToken),
      }],
      invitations: review.invitations.map((candidate) =>
        candidate.tokenHash === invitationHash ? { ...candidate, usedAt: input.now } : candidate),
    },
  };
}

export function publicReview(review: ReviewDocument, currentMemberId: string, now: string): ReviewView {
  const current = review.members.find((member) => member.id === currentMemberId);
  return {
    v: 1,
    teamId: review.teamId,
    state: review.state,
    currentMemberId,
    members: review.members.map(({ id, name, role, scope }) => ({ id, name, role, scope })),
    invitations: current?.role === 'owner' ? review.invitations.map(({ id, role, scope, usedAt, revokedAt }) => ({
      id, role, scope, status: revokedAt ? 'revoked' : usedAt ? 'used' : 'pending',
    })) : [],
    brandKit: review.brandKit,
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

type StoredMember = Omit<ReviewMember, 'scope'> & { scope?: MemberScope };
type StoredInvitation = Omit<ReviewInvitation, 'id' | 'scope' | 'revokedAt'> & {
  id?: string;
  scope?: MemberScope;
  revokedAt?: string | null;
};

function member(value: unknown): value is StoredMember {
  return record(value) && typeof value.id === 'string' && typeof value.name === 'string' &&
    ['owner', 'editor', 'commenter', 'viewer'].includes(String(value.role)) && typeof value.tokenHash === 'string' &&
    (value.scope === undefined || value.scope === 'team' || value.scope === 'project');
}

function invitation(value: unknown): value is StoredInvitation {
  return record(value) && ['editor', 'commenter', 'viewer'].includes(String(value.role)) &&
    (value.id === undefined || typeof value.id === 'string') &&
    (value.scope === undefined || value.scope === 'team' || value.scope === 'project') &&
    typeof value.tokenHash === 'string' && (value.usedAt === null || typeof value.usedAt === 'string') &&
    (value.revokedAt === undefined || value.revokedAt === null || typeof value.revokedAt === 'string');
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
  const brandKit = parseBrandKit(value.brandKit ?? []);
  if (!brandKit.ok) return { ok: false, error: 'review.json is invalid' };
  return { ok: true, value: {
    v: 1,
    teamId: value.teamId,
    state: value.state as ReviewState,
    members: value.members.map((entry) => ({ ...entry,
      scope: entry.scope ?? (entry.role === 'owner' ? 'team' : 'project') })),
    invitations: value.invitations.map((entry) => ({ ...entry,
      id: entry.id ?? `legacy-${entry.tokenHash.slice(0, 16)}`,
      scope: entry.scope ?? 'project',
      revokedAt: entry.revokedAt ?? null,
    })),
    brandKit: brandKit.value,
    comments: value.comments,
    presence: value.presence,
  } };
}
