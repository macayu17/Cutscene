Phase: 3

Phase 2 was waived by explicit owner override on 2026-07-14.
No external PRs were opened. The missing demand-validation evidence is an
accepted product risk, not a successful Phase 2 result. See PRD.md §6.

Phase 1 passed on 2026-07-14. See docs/phase-1-evidence.md.
An uninformed viewer identified the side-by-side difference within 10 seconds.

Phase 3 progress:
  [x] element-anchored callouts in preview, GIF, and MP4
  [x] selector-based visual redaction
  [ ] 9:16 intelligent crop export
  [ ] local brand presets
  [ ] cursor treatment

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
  selector: .todo-list li
  captured geometry samples: 3
  recorded y positions: 219.8, 199.8 CSS px
  trace target/text/value fields in redaction samples: 0
  preview viewport: 1440x900
  enable/disable preview check: passed
  GIF: 800x450, 15 fps, 2.99 s, 284,139 bytes
  MP4: 1920x1080, 60 fps, 3.0167 s, 383,547 bytes
  local artifacts: artifacts/phase3-redaction.gif,
                   artifacts/phase3-redaction.mp4
  screenshots: artifacts/screenshots/phase3-redaction-preview.png,
               artifacts/screenshots/phase3-redaction-mp4-before.png,
               artifacts/screenshots/phase3-redaction-mp4-after.png,
               artifacts/screenshots/phase3-redaction-gif-before.png,
               artifacts/screenshots/phase3-redaction-gif-after.png

Phase 3 remains active. Its exit criterion requires repeat use on a different
project and has not been met.

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
