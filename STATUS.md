Phase: 1

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
