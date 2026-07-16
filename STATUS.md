Phase: 6

Phase 5 passed on 2026-07-16. The owner shared a generated link with a friend
who is not a Cutscene user; the friend confirmed that the video played. This is
the external user-to-non-user event required by PRD.md §11.

Phase 6 progress:
  [x] strict v1 `annotation.comment` schema with element locator anchor and
      fallback media time
  [x] DOM-free cross-version re-anchoring with `matched`, `drifted`, and
      `orphaned` results
  [x] deterministic selection by locator confidence, same step, nearest
      fallback time, then trace order
  [x] filesystem-backed shared reviewer interface and persistence
  [x] hashed owner/commenter credentials and one-use invitation
  [x] presence leases and event-level soft-lock warnings
  [x] draft, in-review, changes-requested, approved, published, and outdated
      review states
  [x] Yjs timeline document and snapshot-derived version history
  [x] owner/editor/commenter/viewer invitations with team and project-only scope
  [x] shared brand kits
  [ ] human two-person team review and approval evidence

Comment re-anchoring evidence:
  strong locator match (confidence >= 0.8) -> matched at the new media time
  text/CSS locator match (confidence < 0.8) -> drifted at the new media time
  no locator match -> orphaned at the recorded fallback media time
  moved timestamp test: 4,200 ms -> 7,100 ms
  same-step tie test: 6,000 ms wins over a closer 4,300 ms candidate
  repository tests: 202 passed (64 trace, 17 server, 108 editor, 13 extension)
  typecheck: 4/4 workspace packages passed
  production build: editor and extension passed
  Chromium E2E: 2/2 passed
    capture: 17.2 s
    shared review: 7.1 s

Shared review browser evidence:
  browser contexts: 2 isolated sessions (owner and invited team editor)
  distinct team member ids: 2/2
  invited editor scope: team
  semantic comment body: "Mention PDF export."
  original anchor: step_3 at 4,200 ms
  replacement anchor: step_8 at 7,100 ms
  re-anchor result seen by both sessions: matched
  owner action: request review
  editor action: approve
  final review state seen by both sessions: approved
  owner/reviewer page errors: 0 / 0
  semantic box uses the shared capture coordinate transform: yes
  real Chromium proof: artifacts/screenshots/phase6-shared-review.jpeg

Shared timeline evidence:
  document: Y.Array<Y.Map> containing zooms, callouts, and redactions
  Yjs version: 13.6.31 (the only added runtime dependency)
  transport: authenticated binary HTTP updates with 1.5 s polling
  persistence: atomic current snapshot plus numbered snapshot history
  duplicate updates: suppressed by state-vector comparison
  browser contexts: 2 isolated editor sessions
  concurrent edits: one added zoom and one disabled `.secret` redaction
  converged state: 2/2 sessions saw 2 zooms and the disabled redaction
  retained versions: 3 (initial document plus the two edits)
  restored version 1 timeline items: 2
  editor page errors: 0 / 0
  repository tests: 220 passed (64 trace, 25 server, 118 editor,
                    13 extension)
  typecheck: 4/4 workspace packages passed
  production build: editor and extension passed
  focused Chromium timeline E2E: 1/1 passed in 6.2 s
  full Chromium E2E: 3/3 passed in 30.9 s

Team and brand-kit evidence:
  roles: owner, editor, commenter, viewer
  invitation scopes: team membership and this-project-only access
  invitation credentials: SHA-256 hashes at rest; plaintext returned once
  invitation lifecycle: create, one-use exchange, and revoke
  permission checks: editor edits/approves; commenter comments; viewer reads
  owner-only invitation management: enforced
  member editor link: exposed after joining without leaking it in review data
  shared kit validation: exact preset schema, unique ids, 50-preset limit
  shared kit reads: every authenticated role
  shared kit writes: owner and editor only
  browser kit flow: editor A saved "Launch kit" with ACME watermark; editor B
                    reloaded the same preset and watermark
  role API tests: team editor, project commenter, team viewer, revoked viewer
  review poll carries duplicate brand-kit payload: no

Capture fixture layout regression evidence:
  cause: the redaction geometry stress step set the first TodoMVC item to
         `position: fixed` and left that test-only style on the recorded page
  effect: target 1 left normal flow and appeared between targets 2 and 3 in
          editor, owner, and invitation playback
  fix: restore the element after the geometry sample and assert that its
       `position` style is empty before recording continues
  corrected video: 1 -> 5 remain in DOM order at 2 s, 5 s, 8 s, 11 s, and 14 s
  live bundle replacement: media.webm, trace.jsonl, meta.json -> 200, 200, 200
  source / served SHA-256 equal for all three files: yes
  live Chromium proof: 1440x900 at 5.0 s, page/console errors 0
  screenshot: artifacts/screenshots/phase6-live-clean-review.png
  repository tests: 220 passed (64 trace, 25 server, 118 editor,
                    13 extension)
  typecheck: 4/4 workspace packages passed
  production build: editor and extension passed
  focused Chromium capture E2E: 1/1 passed in 23.2 s
  full Chromium E2E: 3/3 passed in 38.8 s

Actual-team progress:
  joined members: Owner (owner, team), Ayush (editor, team)
  current review state: draft
  current real-person comments: 0
  remaining exit work: Ayush comments, a re-edit moves that comment's timestamp,
                       the comment survives, and Ayush approves

The Phase 6 exit criterion is not met yet. The resolver is verified in
the real browser flow, two editor sessions converge through Yjs, all roles are
enforced, and the brand kit is shared. A second actual person has joined the
team, but the real comment/re-edit/approval sequence is still outstanding.

Phase 4's exit gate (a user generating an artifact unprompted) was waived by
explicit owner override on 2026-07-16, the same demand-validation risk already
accepted for Phases 2 and 3. No external user evidence exists. This is an
accepted product risk, not a met Phase 4 exit criterion. See PRD.md §10.

Phase 5 is scoped down to its exit criterion only (PRD.md §11): share a link to
a demo with someone who is not a user. Only that share-link wedge is being built.
Deferred as unbuilt-until-demanded (YAGNI): GitHub OAuth, bring-your-own storage
(S3/R2/MinIO), private/expiring/password links, project/version model, analytics.
Zero backend dependencies: Node built-in http + fs, filesystem store, no DB.
  [x] upload a recording bundle to a self-hosted server
  [x] public share link that plays the demo for a non-user

The capability is verified locally and by the non-user confirmation above.

Share-link wedge evidence:
  server: packages/server, node built-in http + fs, no DB, zero runtime deps
  run: PORT=4181 CUTSCENE_DATA=<dir> node src/index.ts (Node 22 strips TS types)
  POST /api/recordings -> 201 { id: 54fc5035-1910-4305-8ca5-b438771b56c6 }
  PUT media.webm / trace.jsonl / meta.json -> 200, 200, 200
  incomplete bundle share page -> 404
  empty media upload -> 400
  GET /r/:id -> 200 text/html with <video src=/api/recordings/:id/media.webm>
  GET media.webm -> 200 video/webm, 5,127,598 bytes (served intact)
  unknown id -> 404, path traversal id -> 400, non-JSON meta upload -> 400
  a public link plays the demo for anyone, signed in or not: yes
  editor browser flow -> recording loaded, Create share link completed
  browser share URL -> /r/21aada7c-bcad-4075-a172-d745b1ce291e, status 200
  shared video visible -> yes; browser page errors -> 0
  source / served media -> 5,127,598 / 5,127,598 bytes, SHA-256 equal

Phase 3's repeat-use exit gate was waived by explicit owner override on
2026-07-15, the same demand-validation risk already accepted for Phase 2.
No external repeat-use evidence exists. This is an accepted product risk,
not a met Phase 3 exit criterion. See PRD.md §7.

Phase 2 was waived by explicit owner override on 2026-07-14.
No external PRs were opened. The missing demand-validation evidence is an
accepted product risk, not a successful Phase 2 result. See PRD.md §6.

Phase 4 builds artifact generation from the existing trace (PRD.md §10):
  [x] Playwright flow skeleton
  [x] step-by-step documentation
  [x] per-step screenshot set
  [x] README GIF variants (full flow already shipped + per-step GIFs)
  [x] transcript and captions (SRT/VTT, import + export; no ASR by owner scope)

Phase 4 is feature-complete. All five §10 artifacts generate from the trace.

Playwright flow skeleton evidence:
  source bundle: artifacts/phase3-cursor-bundle
  recording: rec_558fc4a1-6486-4240-b9bb-bae6cc1a42f7
  target: https://todomvc.com/examples/react/dist/
  actionable events: 4 (1 click, 3 input)
  emitted await steps: 5 (1 goto + 4 actions)
  locator tier used per step: testId, testId, testId, testId
  masked input values emitted as recorded placeholder: 3
  fabricated selectors: 0
  suggested-assertion comments in this flow: 0 (no route change; single route)
  output transpiles as TypeScript (ts.transpileModule, 0 syntactic errors)
  sample output: artifacts/phase4-skeleton-sample.spec.ts

Step documentation and screenshot set evidence:
  source bundle: artifacts/phase3-cursor-bundle (rec_558fc4a1)
  target: https://todomvc.com/examples/react/dist/
  browser: Chromium via built editor at http://127.0.0.1:4176/, 1440x900
  decoded video: 1920x1080
  documented steps: 5 (1 navigation, 3 input, 1 click)
  screenshots rendered: 4 (navigation has no target box)
  screenshot dimensions (2x, cropped to target):
    step-02/03 "New Todo Input": 1615x305 px
    step-04/05 checkbox:          238x238 px
  masked names/values leaked into docs.md: 0 (checkbox falls back to role)
  console/page errors during export: 0
  archives extract with native Windows Expand-Archive: yes
  ZIP writer interop round-trip (Expand-Archive): passed
  local artifacts: artifacts/phase4-docs-sample/docs.md,
                   artifacts/phase4-docs-sample/screenshots/step-0{2,3,4,5}.png

Transcript and captions evidence:
  scope: import + SRT/VTT export, no ASR engine (owner decision 2026-07-15;
         whisper.wasm rejected as out-of-scope, see PRD.md §14 Phase 8)
  import: messy VTT (no hours field, CRLF, NOTE block, cue text)
  export SRT: comma delimiter, 1-based indices, hours filled to 00
  export VTT: WEBVTT header, dot delimiter, NOTE and identifiers dropped
  browser round-trip errors: 0
  local artifacts: artifacts/phase4-captions-sample/import.vtt,
                   artifacts/phase4-captions-sample/export.srt,
                   artifacts/phase4-captions-sample/export.vtt

README GIF variants evidence:
  full-flow GIF: existing 'gif' export (unchanged; byte-for-byte with no window)
  per-step source: phase1-acceptance-v2 bundle (rec_9837ddbe), 15 clicks
  zoom segments after scroll/resize suppression: 12
  per-step GIFs produced: 12, each GIF89a 800x450
  each trimmed to its segment window (distinct sizes 1.46-2.80 MB)
  one global palette preserved per GIF (trim before palettegen/paletteuse)
  browser export console errors: 0
  archive extracts with native Windows Expand-Archive: yes
  sample artifact: artifacts/phase4-step-gifs-sample/step-09.gif

Phase 1 passed on 2026-07-14. See docs/phase-1-evidence.md.
An uninformed viewer identified the side-by-side difference within 10 seconds.

Phase 3 progress:
  [x] element-anchored callouts in preview, GIF, and MP4
  [x] selector-based visual redaction
  [x] 9:16 intelligent crop export
  [x] local brand presets
  [x] cursor treatment

Callout evidence:
  preview viewport: 1440x900
  preview callout / target overlap: false
  GIF: 800x450, 15 fps, 5.74 s, 2,440,497 bytes
  MP4: 1920x1080, 60 fps, 5.7167 s, 4,205,910 bytes
  local artifacts: artifacts/phase3-callout.gif, artifacts/phase3-callout.mp4
  screenshots: artifacts/screenshots/phase3-callout-preview.png,
               artifacts/screenshots/phase3-callout-export.png,
               artifacts/screenshots/phase3-callout-gif.png

Redaction evidence:
  target: https://todomvc.com/examples/react/dist/
  selector: .new-todo, .todo-list li
  captured geometry samples: 8 (7 visible, 1 hidden)
  recorded todo y positions: 195.8, 219.8 CSS px
  identical todo box resampled across viewport widths: 1280, 1200 CSS px
  first geometry sample after capture-ready handshake: visible at trace t=0
  trace target/text/value fields in redaction samples: 0
  preview viewport: 1440x900
  enable/disable preview check: passed
  GIF: 800x450, 16.67 fps, 2.67 s, 464,536 bytes
  MP4: 1920x1080, 60 fps, 2.6833 s, 588,059 bytes
  local artifacts: artifacts/phase3-redaction.gif,
                   artifacts/phase3-redaction.mp4
  screenshots: artifacts/screenshots/phase3-redaction-preview.png,
               artifacts/screenshots/phase3-redaction-mp4-before.png,
               artifacts/screenshots/phase3-redaction-mp4-after.png,
               artifacts/screenshots/phase3-redaction-gif-before.png,
               artifacts/screenshots/phase3-redaction-gif-after.png

Vertical export evidence:
  target: https://todomvc.com/examples/react/dist/
  source capture: 1920x1080
  source crop: 594x1056
  output: 1080x1920, 60 fps, H.264, yuv420p, SAR 1:1
  duration: 2.6833 s
  size: 708,344 bytes
  sampled click: trace t=0.2 s
  target centre at peak: x=540.0, y=552.8 output px
  horizontal centre error at peak: 0.0 px
  vertical centre: constrained by the source top edge
  callout bounds: x=405.0, y=206.7, width=270.0, height=256.0 output px
  callout / target overlap: false
  redaction attachment inspected at rest, peak, and return: passed
  local artifact: artifacts/phase3-vertical.mp4
  screenshots: artifacts/screenshots/phase3-vertical-rest.png,
               artifacts/screenshots/phase3-vertical-peak.png,
               artifacts/screenshots/phase3-vertical-return.png,
               artifacts/screenshots/phase3-vertical-motion-sheet.png

Local brand preset evidence:
  browser URL: http://127.0.0.1:4175/
  browser viewport: 1440x900
  persisted presets after reload: Launch, Docs
  selected preset after reload: retained
  browser console/page errors: 0
  intro duration: 1.5 s
  outro duration: 1.5 s
  16:9 watermark bounds: x=1420, y=972, width=460, height=68 output px
  9:16 watermark bounds: x=790, y=1788, width=250, height=92 output px
  GIF: 800x450, 16.67 fps, 5.74 s, 463,198 bytes
  MP4: 1920x1080, 60 fps, 5.7167 s, 833,407 bytes
  9:16 MP4: 1080x1920, 60 fps, 5.7167 s, 430,129 bytes
  audio proof MP4: 1920x1080, 60 fps, AAC, 5.7167 s, 854,758 bytes
  audio intro silence: 1.500021 s
  audio outro silence: 1.501167 s
  local artifacts: artifacts/phase3-brand.gif,
                   artifacts/phase3-brand.mp4,
                   artifacts/phase3-brand-9x16.mp4,
                   artifacts/phase3-brand-audio.mp4
  screenshots: artifacts/screenshots/phase3-brand-preview.png,
               artifacts/screenshots/phase3-brand-reloaded.png,
               artifacts/screenshots/phase3-brand-intro.png,
               artifacts/screenshots/phase3-brand-source.png,
               artifacts/screenshots/phase3-brand-outro.png,
               artifacts/screenshots/phase3-brand-9x16-source.png,
               artifacts/screenshots/phase3-brand-motion-sheet.png

Cursor treatment evidence:
  target: https://todomvc.com/examples/react/dist/
  recording duration: 7.559300 s
  source media: VP9, 1920x1080, last packet PTS 6.564000 s, 292,898 bytes
  hover samples: 6
  minimum positive hover delta: 70.699951 ms
  maximum observed hover rate: 14.144281 Hz
  click expected / actual: (527, 225) / (527, 225) CSS px
  click Euclidean error: 0.000 CSS px
  hover target/text/value fields: 0
  clock fit: slope 0.999995622, intercept -8051.677517 ms
  click / last pointer media time: 942.983052 ms / 942.983052 ms
  last hover media time: 939.382970 ms
  browser URL: http://127.0.0.1:4175/
  browser viewport: 1440x1000
  server command: pnpm --filter @cutscene/editor exec vite preview --host
                  127.0.0.1 --port 4175 --strictPort
  brand: unbranded / none
  cursor: enabled, 70% smoothing, 32px, ripple, 800ms idle hide
  preview cursor box: 32.000x38.391 CSS px
  exported painted arrow footprint: 27x41 px
  16:9 expected tip / visible apex: (807.45, 303.75) / (806, 300) px
  16:9 conservative visible-apex error: 4.02 px
  16:9 nominal tip anchor inside decoded painted footprint: yes
  9:16 expected tip / visible apex: (262.64, 530.45) / (262, 528) px
  9:16 conservative visible-apex error: 2.54 px
  9:16 nominal tip anchor inside decoded painted footprint: yes
  ripple: first frame 0.950000 s, last frame 1.333333 s,
          absent at 1.350000 s; 24 frames / 400 ms at 60 fps
  idle: last visible frame 1.733333 s, first hidden frame 1.750000 s
        (expected 1.742983 s, first-hidden error +7.017 ms)
  GIF: 800x450, 15 fps, 6.54 s, 533,413 bytes
  MP4: 1920x1080, 60 fps, H.264, yuv420p, 6.5667 s, 887,662 bytes
  9:16 MP4: 1080x1920, 60 fps, H.264, yuv420p, 6.5667 s,
             392,412 bytes
  local artifacts: artifacts/phase3-cursor-bundle/,
                   artifacts/phase3-cursor.gif,
                   artifacts/phase3-cursor.mp4,
                   artifacts/phase3-cursor-9x16.mp4
  screenshots: artifacts/screenshots/phase3-cursor-preview.png,
               artifacts/screenshots/phase3-cursor-movement.png,
               artifacts/screenshots/phase3-cursor-click-before.png,
               artifacts/screenshots/phase3-cursor-click.png,
               artifacts/screenshots/phase3-cursor-ripple-last.png,
               artifacts/screenshots/phase3-cursor-ripple-after.png,
               artifacts/screenshots/phase3-cursor-idle-before.png,
               artifacts/screenshots/phase3-cursor-idle-after.png,
               artifacts/screenshots/phase3-cursor-9x16-click.png
  preview screenshot state: http://127.0.0.1:4175/ at 1440x1000
  export screenshot state: https://todomvc.com/examples/react/dist/ recorded
                           at 1280x800 CSS px; decoded at 1920x1080,
                           except 9x16 click at 1080x1920

Phase 0 spike passed on 2026-07-14. See PRD.md §4.

Evidence: `packages/spike/artifacts/2026-07-14T09-30-21-498Z/`

Exit criteria:
  [x] 60s recording of a real third-party web app produces media.webm + trace.jsonl
  [x] at least 15 click events captured
  [x] on 10 sampled events, boxes land on the correct element
      within ~4 CSS px and ~1 frame
  [x] measurements recorded below as numbers

Measurements:
  target: https://todomvc.com/examples/react/dist/
  duration: 64.4813 s
  video: 1920x1080, 5,127,598 bytes
  viewport: 1280x800 CSS px
  trace: 12,641 bytes
  clicks: 15
  clock sync markers: 34
  sampled events: 1, 3, 4, 6, 7, 9, 10, 12, 13, 15
  correct element: 10/10
  maximum spatial error: 0.37 CSS px
  signed frame errors: -1, -1, 0, 0, -1, -1, -1, -1, 0, -1
  mean absolute timing error: 0.7 frame (23.3 ms)
  maximum absolute timing error: 1 frame (33.3 ms)
  samples within one frame: 10/10
