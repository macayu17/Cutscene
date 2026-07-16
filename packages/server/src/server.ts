import type { IncomingMessage, ServerResponse } from 'node:http';
import { BUNDLE_FILES, createId, ensureRecording, isBundleFile, isValidId, readBundleFile,
  readReview, recordingExists, recordingReady, saveBundleFile, updateReview, validateBundleFile,
  writeReview, type BundleFile } from './store.ts';
import { randomUUID } from 'node:crypto';
import { fitMediaClock, mapBoxToCapture, parseRecordingMeta, parseTraceEvent, reanchorComments,
  type MediaClockFit, type TraceEvent } from '@cutscene/trace';
import { addInvitation, authenticate, canApprove, canComment, createReviewDocument, joinReview,
  publicReview, revokeInvitation, type InvitationRole, type MemberScope, type ReviewMember,
  type ReviewState } from './review.ts';
import { reviewPage } from './review-page.ts';
import { listTimelineVersions, MAX_TIMELINE_BYTES, mergeTimelineUpdate, readTimelineUpdate,
  readTimelineVersion } from './timeline-store.ts';

const MAX_BYTES = 250 * 1024 * 1024; // one bundle cannot exhaust disk
const MAX_JSON_BYTES = 64 * 1024;

const CONTENT_TYPE: Record<BundleFile, string> = {
  'media.webm': 'video/webm',
  'trace.jsonl': 'application/x-ndjson',
  'meta.json': 'application/json',
};

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': payload.length });
  res.end(payload);
}

function html(res: ServerResponse, status: number, body: string): void {
  const payload = Buffer.from(body);
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'content-length': payload.length });
  res.end(payload);
}

function binary(res: ServerResponse, status: number, body: Uint8Array): void {
  res.writeHead(status, { 'content-type': 'application/octet-stream', 'content-length': body.length });
  res.end(body);
}

function readBody(req: IncomingMessage, maximum = MAX_BYTES): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maximum) { resolve(null); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => resolve(null));
  });
}

function bearer(req: IncomingMessage): string {
  const header = req.headers.authorization;
  return typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : '';
}

async function readJson(req: IncomingMessage): Promise<{ ok: true; value: Record<string, unknown> } |
  { ok: false; error: string }> {
  const body = await readBody(req, MAX_JSON_BYTES);
  if (!body) return { ok: false, error: 'request body is too large or unreadable' };
  try {
    const value: unknown = JSON.parse(body.toString('utf8'));
    return value && typeof value === 'object' && !Array.isArray(value)
      ? { ok: true, value: value as Record<string, unknown> }
      : { ok: false, error: 'request body must be a JSON object' };
  } catch {
    return { ok: false, error: 'request body is not valid JSON' };
  }
}

async function memberFor(req: IncomingMessage, root: string, id: string): Promise<ReviewMember | null> {
  const review = await readReview(root, id);
  return review ? authenticate(review, bearer(req)) : null;
}

function parseTraceData(data: Buffer): { ok: true; events: TraceEvent[]; clock: MediaClockFit } |
  { ok: false; error: string } {
  const events: TraceEvent[] = [];
  for (const [index, line] of data.toString('utf8').split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let input: unknown;
    try { input = JSON.parse(line); } catch { return { ok: false, error: `trace line ${index + 1} is invalid JSON` }; }
    const event = parseTraceEvent(input);
    if (!event.ok) return { ok: false, error: `trace line ${index + 1}: ${event.error}` };
    events.push(event.value);
  }
  const fit = fitMediaClock(events.filter((event) => event.type === 'system.clockSync')
    .map((event) => ({ t: event.t, mediaTimeMs: event.mediaTimeMs })));
  return fit.ok ? { ok: true, events, clock: fit.value } : fit;
}

async function traceData(root: string, id: string): Promise<{ ok: true; events: TraceEvent[]; clock: MediaClockFit } |
  { ok: false; error: string }> {
  const data = await readBundleFile(root, id, 'trace.jsonl');
  return data ? parseTraceData(data) : { ok: false, error: 'trace not found' };
}

export async function handle(req: IncomingMessage, res: ServerResponse, root: string): Promise<void> {
  res.setHeader('access-control-allow-origin', '*');
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type',
    });
    res.end();
    return;
  }
  const parts = (req.url ?? '/').split('?')[0]!.split('/').filter(Boolean);

  if (req.method === 'POST' && parts.length === 2 && parts[0] === 'api' && parts[1] === 'recordings') {
    const id = createId();
    const ownerToken = randomUUID();
    const invitationId = randomUUID();
    const invitationToken = randomUUID();
    await ensureRecording(root, id);
    await writeReview(root, id, createReviewDocument({
      teamId: randomUUID(), ownerId: randomUUID(), ownerName: 'Owner', ownerToken,
      invitationId, invitationToken,
    }));
    return json(res, 201, { id, ownerToken, invitationToken });
  }

  if (parts.length === 5 && parts[0] === 'api' && parts[1] === 'recordings' && parts[3] === 'invitations') {
    const id = parts[2]!;
    const invitationId = parts[4]!;
    if (!isValidId(id)) return json(res, 400, { error: 'invalid recording id' });
    const member = await memberFor(req, root, id);
    if (!member) return json(res, 401, { error: 'member token required' });
    if (member.role !== 'owner') return json(res, 403, { error: 'only the owner can manage invitations' });
    if (req.method !== 'DELETE') return json(res, 405, { error: 'method not allowed' });
    let revokeError: string | null = null;
    await updateReview(root, id, (review) => {
      const revoked = revokeInvitation(review, invitationId, new Date().toISOString());
      if (!revoked.ok) { revokeError = revoked.error; return review; }
      return revoked.value;
    });
    return revokeError ? json(res, 409, { error: revokeError }) : json(res, 200, { id: invitationId });
  }

  if (parts.length === 5 && parts[0] === 'api' && parts[1] === 'recordings' && parts[3] === 'versions') {
    const id = parts[2]!;
    const version = Number(parts[4]);
    if (!isValidId(id)) return json(res, 400, { error: 'invalid recording id' });
    const member = await memberFor(req, root, id);
    if (!member) return json(res, 401, { error: 'member token required' });
    if (!canApprove(member.role)) return json(res, 403, { error: 'member cannot read timeline history' });
    if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' });
    const snapshot = await readTimelineVersion(root, id, version);
    return snapshot ? binary(res, 200, snapshot) : json(res, 404, { error: 'timeline version not found' });
  }

  if (parts.length === 4 && parts[0] === 'api' && parts[1] === 'recordings') {
    const id = parts[2]!;
    if (!isValidId(id)) return json(res, 400, { error: 'invalid recording id' });
    const action = parts[3]!;

    if (action === 'timeline') {
      const member = await memberFor(req, root, id);
      if (!member) return json(res, 401, { error: 'member token required' });
      if (!canApprove(member.role)) return json(res, 403, { error: 'member cannot access timeline edits' });
      if (req.method === 'GET') return binary(res, 200, await readTimelineUpdate(root, id));
      if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });
      const contentLength = Number(req.headers['content-length'] ?? 0);
      if (contentLength > MAX_TIMELINE_BYTES) return json(res, 413, { error: 'timeline update is too large' });
      const update = await readBody(req, MAX_TIMELINE_BYTES);
      if (!update) return json(res, 413, { error: 'timeline update is too large or unreadable' });
      const merged = await mergeTimelineUpdate(root, id, member.id, update, new Date().toISOString());
      return merged.ok ? json(res, 200, merged.value) : json(res, 400, { error: merged.error });
    }

    if (action === 'versions') {
      const member = await memberFor(req, root, id);
      if (!member) return json(res, 401, { error: 'member token required' });
      if (!canApprove(member.role)) return json(res, 403, { error: 'member cannot read timeline history' });
      return req.method === 'GET' ? json(res, 200, await listTimelineVersions(root, id))
        : json(res, 405, { error: 'method not allowed' });
    }

    if (action === 'invitations') {
      const member = await memberFor(req, root, id);
      if (!member) return json(res, 401, { error: 'member token required' });
      if (member.role !== 'owner') return json(res, 403, { error: 'only the owner can manage invitations' });
      if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });
      const input = await readJson(req);
      if (!input.ok) return json(res, 400, { error: input.error });
      const role = input.value.role;
      const scope = input.value.scope;
      if (!['editor', 'commenter', 'viewer'].includes(String(role)) || !['team', 'project'].includes(String(scope))) {
        return json(res, 400, { error: 'role must be editor, commenter, or viewer; scope must be team or project' });
      }
      const invitationId = randomUUID();
      const invitationToken = randomUUID();
      await updateReview(root, id, (review) => addInvitation(review, {
        id: invitationId, token: invitationToken, role: role as InvitationRole, scope: scope as MemberScope,
      }));
      return json(res, 201, { id: invitationId, invitationToken, role, scope });
    }

    if (action === 'join' && req.method === 'POST') {
      const input = await readJson(req);
      if (!input.ok) return json(res, 400, { error: input.error });
      if (typeof input.value.invitationToken !== 'string' || typeof input.value.name !== 'string') {
        return json(res, 400, { error: 'invitationToken and name are required' });
      }
      const memberId = randomUUID();
      const memberToken = randomUUID();
      let joinError: string | null = null;
      try {
        await updateReview(root, id, (review) => {
          const joined = joinReview(review, {
            invitationToken: input.value.invitationToken as string,
            memberId, memberToken, name: input.value.name as string, now: new Date().toISOString(),
          });
          if (!joined.ok) { joinError = joined.error; return review; }
          return joined.value;
        });
      } catch {
        return json(res, 404, { error: 'recording not found' });
      }
      return joinError ? json(res, 409, { error: joinError }) : json(res, 201, { memberId, memberToken });
    }

    if (action === 'review' && req.method === 'GET') {
      const review = await readReview(root, id);
      if (!review) return json(res, 404, { error: 'recording not found' });
      const member = authenticate(review, bearer(req));
      return member ? json(res, 200, publicReview(review, member.id, new Date().toISOString()))
        : json(res, 401, { error: 'member token required' });
    }

    if (action === 'events' && req.method === 'GET') {
      const trace = await traceData(root, id);
      if (!trace.ok) return json(res, 404, { error: trace.error });
      const metaData = await readBundleFile(root, id, 'meta.json');
      let metaInput: unknown;
      try { metaInput = metaData ? JSON.parse(metaData.toString('utf8')) : null; } catch { metaInput = null; }
      const meta = parseRecordingMeta(metaInput);
      if (!meta.ok) return json(res, 404, { error: 'recording metadata not found' });
      return json(res, 200, { capture: { width: meta.value.capture.width, height: meta.value.capture.height },
        events: trace.events.flatMap((event) => event.target ? [{
        id: event.id,
        type: event.type,
        stepId: event.stepId,
        mediaTimeMs: trace.clock.toMediaTime(event.t),
        name: event.target.accessibleName || event.target.role || event.target.tagName.toLowerCase(),
        box: mapBoxToCapture(event.target.boundingBox, event.viewport, meta.value.capture),
      }] : []) });
    }

    if (action === 'comments' && req.method === 'POST') {
      const member = await memberFor(req, root, id);
      if (!member) return json(res, 401, { error: 'member token required' });
      if (!canComment(member.role)) return json(res, 403, { error: 'member cannot comment' });
      const input = await readJson(req);
      if (!input.ok) return json(res, 400, { error: input.error });
      const body = typeof input.value.body === 'string' ? input.value.body.trim() : '';
      const eventId = typeof input.value.eventId === 'string' ? input.value.eventId : '';
      if (!body || body.length > 2_000 || !eventId) return json(res, 400, { error: 'eventId and a 1-2000 character body are required' });
      const trace = await traceData(root, id);
      if (!trace.ok) return json(res, 409, { error: trace.error });
      const target = trace.events.find((event) => event.id === eventId && event.target);
      if (!target?.target) return json(res, 404, { error: 'comment target event not found' });
      const commentId = randomUUID();
      const mediaTimeMs = trace.clock.toMediaTime(target.t);
      const event = {
        v: 1 as const, id: commentId, t: target.t, type: 'annotation.comment' as const,
        stepId: target.stepId, route: target.route, viewport: target.viewport, scroll: target.scroll,
        anchor: { stepId: target.stepId, locators: target.target.locators, mediaTimeMs }, body,
      };
      const now = new Date().toISOString();
      await updateReview(root, id, (review) => ({
        ...review,
        comments: [...review.comments, {
          event, authorId: member.id, createdAt: now, resolvedAt: null,
          resolution: { commentId, status: 'matched', eventId: target.id, stepId: target.stepId,
            mediaTimeMs, confidence: 1 },
        }],
      }));
      return json(res, 201, { id: commentId });
    }

    if (action === 'state' && req.method === 'PUT') {
      const member = await memberFor(req, root, id);
      if (!member) return json(res, 401, { error: 'member token required' });
      if (!canApprove(member.role)) return json(res, 403, { error: 'member cannot change review state' });
      const input = await readJson(req);
      if (!input.ok) return json(res, 400, { error: input.error });
      const state = input.value.state;
      if (!['draft', 'in_review', 'changes_requested', 'approved', 'published', 'outdated'].includes(String(state))) {
        return json(res, 400, { error: 'invalid review state' });
      }
      await updateReview(root, id, (review) => ({ ...review, state: state as ReviewState }));
      return json(res, 200, { state });
    }

    if (action === 'presence' && req.method === 'PUT') {
      const member = await memberFor(req, root, id);
      if (!member) return json(res, 401, { error: 'member token required' });
      const input = await readJson(req);
      if (!input.ok) return json(res, 400, { error: input.error });
      const resource = input.value.resource === null || typeof input.value.resource === 'string'
        ? input.value.resource : null;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30_000).toISOString();
      let conflictMemberId: string | null = null;
      await updateReview(root, id, (review) => {
        const active = review.presence.filter((lease) => lease.expiresAt > now.toISOString() && lease.memberId !== member.id);
        conflictMemberId = resource ? active.find((lease) => lease.resource === resource)?.memberId ?? null : null;
        return { ...review, presence: [...active, { memberId: member.id, resource, expiresAt }] };
      });
      return json(res, 200, { expiresAt, conflictMemberId });
    }

    const file = action;
    if (!isBundleFile(file)) return json(res, 400, { error: `file must be one of ${BUNDLE_FILES.join(', ')}` });

    if (req.method === 'PUT') {
      if (!(await recordingExists(root, id))) return json(res, 404, { error: 'recording not found' });
      const member = await memberFor(req, root, id);
      if (!member) return json(res, 401, { error: 'member token required' });
      if (!canApprove(member.role)) return json(res, 403, { error: 'member cannot replace bundle files' });
      const body = await readBody(req);
      if (!body) return json(res, 413, { error: 'bundle file too large or unreadable' });
      const valid = validateBundleFile(file, body);
      if (!valid.ok) return json(res, 400, { error: valid.error });
      if (file === 'trace.jsonl') {
        const replacement = parseTraceData(body);
        if (!replacement.ok) return json(res, 400, { error: replacement.error });
        await saveBundleFile(root, id, file, body);
        await updateReview(root, id, (review) => {
          const resolutions = reanchorComments(review.comments.filter((comment) => comment.resolvedAt === null)
            .map((comment) => comment.event), replacement.events, replacement.clock);
          const byComment = new Map(resolutions.map((resolution) => [resolution.commentId, resolution]));
          return {
            ...review,
            state: review.state === 'approved' || review.state === 'published' ? 'outdated' : review.state,
            comments: review.comments.map((comment) => {
              const resolution = byComment.get(comment.event.id);
              if (!resolution) return comment;
              if (resolution.status === 'orphaned') return { ...comment, resolution };
              const target = replacement.events.find((event) => event.id === resolution.eventId);
              return target?.target ? {
                ...comment,
                event: { ...comment.event, anchor: {
                  stepId: target.stepId, locators: target.target.locators, mediaTimeMs: resolution.mediaTimeMs,
                } },
                resolution,
              } : { ...comment, resolution };
            }),
          };
        });
        return json(res, 200, { ok: true });
      }
      await saveBundleFile(root, id, file, body);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET') {
      const data = await readBundleFile(root, id, file);
      if (!data) return json(res, 404, { error: 'not found' });
      res.writeHead(200, { 'content-type': CONTENT_TYPE[file], 'content-length': data.length });
      res.end(data);
      return;
    }
    return json(res, 405, { error: 'method not allowed' });
  }

  if (req.method === 'GET' && parts.length === 2 && parts[0] === 'r') {
    const id = parts[1]!;
    if (!isValidId(id) || !(await recordingReady(root, id))) return html(res, 404, '<!doctype html><title>Not found</title><h1>Demo not found</h1>');
    return html(res, 200, reviewPage(id));
  }

  return json(res, 404, { error: 'not found' });
}
