Phase: 3

Phase 2 was waived by explicit owner override on 2026-07-14.
No external PRs were opened. The missing demand-validation evidence is an
accepted product risk, not a successful Phase 2 result. See PRD.md §6.

Phase 1 passed on 2026-07-14. See docs/phase-1-evidence.md.
An uninformed viewer identified the side-by-side difference within 10 seconds.

Phase 3 progress:
  [x] element-anchored callouts in preview, GIF, and MP4
  [x] selector-based visual redaction
  [x] 9:16 intelligent crop export
  [x] local brand presets
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
