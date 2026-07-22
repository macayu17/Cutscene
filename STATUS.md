Phase: 9

Phase 9 (zero-friction first run, PRD.md section 15) opened on 2026-07-22. Its
exit criteria are not met yet; the numbers below still describe Phase 8.

Phase 8's linear interactive-demo slice passed locally on 2026-07-18. The other
long-tail items in PRD.md section 14 remain deferred.

Trace-derived quality report and drift healing (2026-07-21):
  quality report: interactions on elements with no accessible name or role, and
                  steps whose strongest ranked locator falls below 0.8
                  confidence, derived from the trace with no page re-inspection
  shipped in the demo kit as quality.md
  measured on the clean TodoMVC capture: 5 findings, one per recorded step,
                  all five checkboxes exposing no accessible name
  drift healing: `--heal` promotes the ranked locator that actually resolved
                  and rewrites the trace, so a renamed test id stops drifting
  measured on the local drift fixture:
    before heal: 2 matched / 1 drifted / 1 orphaned, exit 1
    heal:        healed step_3 testId -> role
    after heal:  3 matched / 0 drifted / 1 orphaned, exit 1
  an orphaned step has no locator left to promote, so the gate stays closed

  repository tests: 315 passed (97 trace, 25 server, 128 editor,
                    14 extension, 51 runner)
  typecheck: 5/5 active packages passed
  production build: trace, editor, and extension passed
  hosted CI / paid credits / new runtime dependencies: none

Interactive demo implementation:
  [x] one editor action renders the existing MP4 and downloads a static ZIP
  [x] version 1 click-only manifest with no raw trace or locator payload
  [x] shared media-clock, coordinate, camera, zoom, and privacy-safe label logic
  [x] Start, every hotspot, wrong-click handling, Restart, Replay, and keyboard
      operation
  [x] native video-frame timing with a timeupdate fallback
  [x] reduced-motion handling and visible keyboard focus
  [x] no backend, hosted service, paid credit, or new runtime dependency

Real TodoMVC interactive-export evidence:
  source: artifacts/phase6-human-reedit
  output: artifacts/phase8-interactive-final
  recording: rec_a6e39c89-73f1-40ce-845a-1b6bb5615131
  trace events / target clicks: 77 / 5
  exported player steps: 5
  hotspots activated in order: 5 / 5
  wrong click advanced the flow: no
  completion state: COMPLETE
  Replay result: STEP 01 / 05
  maximum hotspot edge error: 0.014435 rendered px
  player page / console errors: 0 / 0
  video: H.264, 1920x1080, 60 fps, yuv420p, 15.566667 s
  ZIP: 12,941,022 bytes
  index.html: 8,778 bytes
  demo.mp4: 12,932,034 bytes
  ZIP SHA-256: 873EBA95DCADD45DD89E0FCE53116393D507F972DEB99905C9C96D4E53BC4FC9
  HTML SHA-256: 87A5DDF22ED357D9D2726FBACAA86DDFEC3E1A265161724F9244DABF032B6A0E
  MP4 SHA-256: C4494D236235F2487187FCE51424DA84AF592C2634AB152F2CF5FAB5AC6E6327

Interactive manifest privacy evidence:
  top-level keys: v, recordingId, width, height, steps
  step keys: eventId, timeMs, label, box
  box keys: x, y, width, height
  source unmasked input values: 0
  input-value occurrences in index.html: 0
  locator, comment, raw trace, `[MASKED]`, and `raw-nested-secret`
    occurrences in index.html: 0

Phase 8 verification:
  repository tests: 298 passed (84 trace, 25 server, 126 editor,
                    13 extension, 50 runner)
  typecheck: 5/5 active packages passed
  production build: trace, editor, and extension passed
  Chromium E2E: 6/6 passed
    interactive player: 1/1
    regeneration runner: 2/2
    capture and collaboration: 3/3 on clean rerun
  note: the first combined run retried the existing invitation test once; the
        dedicated extension rerun passed 3/3 without a retry

Semantic Demo Kit evidence (2026-07-20):
  source: artifacts/phase6-human-reedit
  recording: rec_a6e39c89-73f1-40ce-845a-1b6bb5615131
  browser: Chromium, http://127.0.0.1:4176, 1440x900
  editor horizontal overflow: 0 px
  editor page / console errors: 0 / 0
  build time: 82.1 s
  ZIP: 24,230,907 bytes
  ZIP SHA-256: C33BEEBED5B477F63EF01CBE6770F1E80D7CB4D5566BDA0C4E6D8BC8FD157346
  extracted files / bytes: 23 / 24,228,207
  MP4: 12,932,034 bytes, `ftypisom`
  GIF: 11,000,126 bytes, `GIF89a`
  docs / screenshots / Playwright actions: 20 / 18 / 18
  interactive hotspots completed: 5 / 5
  maximum hotspot edge error: 0.027 rendered px
  extracted player page / console errors: 0 / 0
  raw input, raw trace, ranked-locator JSON, comment, and collaboration
    credential occurrences in text artifacts: 0
  native Windows Expand-Archive: passed
  screenshot: artifacts/screenshots/semantic-demo-kit-editor.png
  player screenshot: artifacts/screenshots/semantic-demo-kit-player.png
  repository tests: 301 passed (84 trace, 25 server, 128 editor,
                    14 extension, 50 runner)
  typecheck: 5/5 active packages passed
  production build: trace, editor, and extension passed
  Chromium E2E: 6/6 passed in 58.5 s
  hosted CI / paid credits / new runtime dependencies: none

Requested cleanup:
  attachment `b0f5fd31-2135-4527-9aae-1761db805124/image-1.png`: removed
  live GitHub contributors API: macayu17 only
  Claude contributor entry: absent

Phase 7 passed locally on 2026-07-18. The hosted pull-request gate was replaced
with the owner-approved local gate in PRD.md §13. No hosted CI, pull request,
auto-merge, or paid service was used.

Final TodoMVC normal-regeneration evidence:
  target: https://todomvc.com/examples/react/dist/
  source trace: artifacts/phase7-enter-bundle/5461e858-ecc8-4efb-b4b5-2e513554026f
  config: artifacts/phase7-local-completion/demo.yml
  CLI exit code: 0
  planned / evaluated steps: 2 / 2
  matched / drifted / orphaned: 2 / 0 / 0
  action locator indexes: 0, 0, 0
  fresh recording: 3.880 s, 1280x800 at 25 fps, 160,748 bytes
  fresh events: 12 total, 3 actions, 4 redaction samples
  app commit: bee630c34037bbd055ceed01728da9800d1189c6
  trace diff unchanged / changed / added / removed: 0 / 3 / 0 / 2
  diff note: the stored trace has two duplicate/noise input events that the
             deterministic replay plan intentionally does not regenerate
  staleness: unavailable (watch paths are not configured)
  configured input occurrences in trace, reports, and docs: 0
  media.webm SHA-256: 48D1344136D128FED06C8B39DCCCC9492864C78694167808AC2C6289D425CB78
  trace.jsonl SHA-256: AC49A524F32CC7265C00B86476029B3EBEEE04A4B5ABAD8B672DC1E3AA9ABC28
  meta.json SHA-256: 4561D936A63896E37D27576C7B294422D82EAFE7774E9B48A48F2407EAB7984E
  GIF: 792,267 bytes, SHA-256 31D5148FCA85EF20D259599D1EDABE7F350B8FA408F459AA9B53ACA0363AA134
  MP4: 1,528,818 bytes, SHA-256 D89F4B30147CD272090B1E39E2454B8787CC6389A4EAC0ACD1D70BCFE826B2EA
  docs: 314 bytes plus 2 PNG screenshots (32,372 and 6,491 bytes)

Phase 7 implementation:
  [x] strict version 1 `demo.yml` parser with exact environment references
  [x] deterministic replay planning by `stepId`
  [x] privacy-safe Enter capture and replay
  [x] ranked Playwright locator resolution in local Chromium
  [x] matched, drifted, and orphaned action and step classification
  [x] deterministic JSON and text drift reports written atomically
  [x] local CLI with demo filtering and exit codes 0, 1, and 2
  [x] real CLI end-to-end proof against a local HTTP fixture
  [x] fresh trace and pixel capture
  [x] semantic trace diff and optional Git staleness measurement
  [x] GIF, MP4, and documentation regeneration
  [x] staged output replacement with failure preservation
  [x] local normal-regeneration exit gate

Local Chromium dry-run evidence:
  planned / evaluated steps: 4 / 4
  matched / drifted / orphaned: 2 / 1 / 1
  chosen locator tiers: testId[0], role[1], label[0], none
  abort point: step_4
  CLI exit code: 1
  injected input value occurrences in JSON, text, stdout, and stderr: 0
  Playwright result: 1/1 passed in 2.1 s

Prior TodoMVC trace dry-run:
  source: artifacts/phase6-human-reedit/trace.jsonl
  trace SHA-256: 2010D010ADE064B439BCAAD4EC3E262F42EB53DC90A2D9C81E9BE25397419599
  trace events: 77 (5 clicks, 13 inputs)
  configured input override: step_0000 through environment
  CLI exit code: 2
  measured reason: step step_0000 contains multiple input targets
  cause in source trace: the capture E2E deliberately typed into a second
                         `[data-sensitive]` input before the first click
  privacy result: correct; that target's semantic locators were removed
  browser launched: no; replay validation stopped first
  workaround applied: no

Clean TodoMVC trace dry-run:
  source: artifacts/phase7-clean-bundle/e545e315-2d1b-445a-9ca3-6d6f6f71a902
  recording: rec_5ea4c539-afbc-4014-9571-38736874ef7c
  duration: 16.1553 s
  video: 617,436 bytes
  trace: 34,526 bytes, 80 events (5 clicks, 10 inputs)
  trace SHA-256: 25D93F80388712E9C2B986BF55EC6A16EBA133DFED6D356F6C89A1309239F2E9
  `step_0000` input targets: 1
  planned / evaluated steps: 6 / 2
  matched / drifted / orphaned: 1 / 0 / 1
  matched action: step_0000 fill via testId[0]
  abort point: step_0001 checkbox
  CLI exit code: 1
  measured reason: no locator resolved
  root cause: the source trace did not capture the Enter key used to create
              TodoMVC rows, so replay filled the input but created no checkbox
  injected input value occurrences in JSON and text reports: 0
  heuristic Enter or locator workaround applied: no

Enter-enabled TodoMVC trace dry-run (2026-07-17):
  source: artifacts/phase7-enter-bundle/5461e858-ecc8-4efb-b4b5-2e513554026f
  recording: rec_7c9d3270-42a9-48cf-9933-d47ced0986f5
  duration: 3.8951 s
  video: 312,233 bytes
  trace: 12,176 bytes, 31 events (1 click, 3 inputs, 1 Enter)
  metadata: 874 bytes
  video SHA-256: 6F7C964CFEB2997C864852DE7201595E1AE66B82FFC8F7A0FD3350A48EDBA83D
  trace SHA-256: 21E1D79FB0B8A707E545DAFCDE76027D533D2BA3686AF2F5A08568032288FB93
  metadata SHA-256: D2E25D7242B82C0548158BD7F5DDE3320EC84F79380F7963451D66398ABE2E12
  planned / evaluated steps: 2 / 2
  matched / drifted / orphaned: 2 / 0 / 0
  chosen locator tiers: fill testId[0], Enter testId[0], click testId[0]
  abort point: none
  CLI exit code: 0
  injected input value occurrences in JSON and text reports: 0
  captured printable keypresses: 0
  heuristic keyboard or locator workaround applied: no

Phase 7 final verification:
  repository tests: 293 passed (83 trace, 25 server, 122 editor, 13 extension,
                    50 runner) in 14.1 s
  typecheck: 5/5 active packages passed in 10.5 s
  root build: trace, editor, and extension build scripts passed in 7.5 s
  Chromium E2E: 5/5 passed in 49.0 s
    regeneration runner: 2/2 passed in 10.3 s
    capture and collaboration: 3/3 passed in 34.0 s

Phase 6 passed on 2026-07-16. Two actual people reviewed the corrected demo as
members of the same team: Owner (owner) and Ayush - Editor (editor). The owner
requested review and the editor approved it.

Human collaboration exit evidence:
  recording: 017b78cf-eef4-46ac-87ea-e4effce4d3ba
  final review state: approved
  team members: Owner (owner, team), Ayush - Editor (editor, team)
  open comments: 1
  comment author: Ayush - Editor
  comment body: "Timing needs adjsutsment"
  original semantic anchor: step_0001 at 1,539.981987 ms
  re-edited semantic anchor: step_0001 at 2,539.987364 ms
  timestamp movement: +1,000.005377 ms
  re-anchor classification: matched
  locator confidence: 1.0
  resolved event id: evt_00b9863e-11d5-43c7-b169-56dbec8c1d60
  uploaded / prepared trace SHA-256 equal: yes
  trace SHA-256: 2010D010ADE064B439BCAAD4EC3E262F42EB53DC90A2D9C81E9BE25397419599
  corrected targets remain in DOM order: yes

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
  [x] human two-person team review and approval evidence

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

Actual-team result:
  joined members: Owner (owner, team), Ayush - Editor (editor, team)
  final review state: approved
  real-person comments: 1
  timestamp moved and comment survived: yes

The Phase 6 exit criterion is met. The resolver is verified in the real browser
flow, two editor sessions converge through Yjs, all roles are enforced, the
brand kit is shared, and the real comment/re-edit/approval sequence passed.

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
