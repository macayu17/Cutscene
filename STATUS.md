Phase: 5

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

The capability is verified locally. The Phase 5 exit gate still requires an
actual user to share with a non-user; that external event has not been recorded.

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
