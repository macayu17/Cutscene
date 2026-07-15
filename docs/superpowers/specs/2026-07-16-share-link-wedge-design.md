# Phase 5 — Share-link Wedge

## Goal

Phase 5's exit criterion is the whole target: **share a link to a demo with
someone who is not a user** (PRD.md §11). Build only that. A backend serves
nobody until a user asks to share, so everything else in §11 (auth, BYO storage,
private/expiring/password links, project/version model, analytics) is deferred
until demanded.

## Scope

- Upload a recording bundle (`media.webm`, `trace.jsonl`, `meta.json`) to a
  self-hosted server.
- Get back a public URL.
- Opening that URL plays the demo for anyone, signed in or not.

Nothing else. No account, no login, no dashboard.

## Stack — zero backend dependencies

Self-hosting is a first-class path (PRD.md §11), so the server must be trivial to
run. Node 22 strips TypeScript types natively and ships `node:http`, so:

- `node:http` for the server. Three routes; no framework.
- The filesystem is the store: one directory per recording under a data root.
  No database — a recording is a folder, a share link is its id.
- `node:crypto` for the id.

The one dependency already in the workspace, `@cutscene/trace`, validates the
uploaded `meta.json` and `trace.jsonl` so a malformed bundle is rejected at the
trust boundary rather than served later.

## API

```
POST /api/recordings                       -> { id }        create a recording, returns its id
PUT  /api/recordings/:id/media.webm        raw body         store the video
PUT  /api/recordings/:id/trace.jsonl       raw body         validated line-by-line
PUT  /api/recordings/:id/meta.json         raw body         validated against the schema
GET  /r/:id                                public HTML       plays the demo
GET  /api/recordings/:id/:file             public bytes      media/trace/meta
```

Plain PUTs, so there is no multipart parser to own. The id is opaque and
unguessable (`crypto.randomUUID`), which is the only access control this wedge
has — matching "public share link" and nothing more.

## Trust boundary

- `:id` is validated as a UUID; path traversal is impossible because the id can
  only be `[0-9a-f-]` and `:file` is one of three fixed names.
- `meta.json` must parse with `parseRecordingMeta`; `trace.jsonl` lines must
  parse with `parseTraceEvent`. A bundle that fails is rejected on upload.
- Upload size is capped so a single request cannot exhaust disk.
- No auth: the wedge only serves public links. Private links are deferred.

## Share page

`GET /r/:id` returns a small self-contained HTML page with a `<video>` pointed at
the stored `media.webm`. The semantic trace is stored and served but the wedge's
player only needs the pixels to satisfy the exit criterion; element-locked
playback in the shared viewer is a later increment.

## Failure behaviour

Every handler returns a JSON `{ error }` with the right status. A missing
recording is 404. A malformed bundle is 400. The server never throws across a
request; errors are values.

## Verification

- Unit-test id validation, path-name allowlisting, and bundle rejection.
- Drive the running server over HTTP: create a recording, PUT the three real
  bundle files, GET `/r/:id`, and confirm the page loads and the video bytes are
  served with a video content-type and non-zero length. Report the id, the
  served sizes, and that an unknown id 404s.

This wedge meets the Phase 5 exit criterion. The rest of §11 stays unbuilt until
a user needs it.
