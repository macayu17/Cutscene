# Phase 1 evidence

Status: implementation verified; phase gate pending uninformed-human comparison.

## Production recording

- Target: `https://todomvc.com/examples/react/dist/`
- Metadata duration: 60.1459 s
- Last encoded packet: 59.8080 s
- Encoded capture: 1920 x 1080 at 30 fps
- Media / trace size: 1,169,542 / 31,208 bytes
- Trace events: 72
- Clicks / clock markers / inputs: 15 / 32 / 17
- Navigation / scroll / resize: 1 / 3 / 2
- Raw input secret present in JSONL: no
- Clock fit: slope `1.0000285365655872`, intercept `-1333.3352644045226`

Sampled clicks 1, 3, 4, 6, 7, 9, 10, 12, 13, and 15 have signed
60 fps camera-frame errors:

`-0.226, -0.154, 0.222, 0.210, -0.212, -0.422, -0.226, 0.159, 0.420, 0.329`

- Mean absolute error: 0.258 frame
- Maximum absolute error: 0.422 frame
- Within one frame: 10/10
- Recorded boxes visible and on the clicked checkbox: 10/10

The ten-event browser evidence is
`artifacts/screenshots/box-samples-final-v2.png`.

## Motion and export

- Automatic zoom: 650 ms symmetric cubic entry, 900 ms hold, 650 ms exit
- Maximum automatic scale: 1.8x
- Browser frame sample: 180 frames
- Browser frame interval: 16.8 ms p95, 16.8 ms maximum
- MP4: 1920 x 1080, H.264, yuv420p, 60 fps
- Full output: 59.8167 s, 46,735,437 bytes
- Full in-browser WASM export time: 150.4 s

The shared camera model drives both the preview matrix and the FFmpeg timing
expressions. Camera centers are clamped to the visible crop, each zoom retains
the viewport recorded with its click, and any segment crossed by a recorded
scroll is suppressed. The corrected live preview is
`artifacts/screenshots/phase1-editor-corrected.png`; the motion contact sheet is
`artifacts/screenshots/zoom-transition-v2.png`.

## README GIF

- Source duration: 5.74 s
- Output: 800 x 450 at 15 fps
- Size: 2,352,555 bytes
- Palette: one global palette, Bayer dithering, diff mode
- Manual inspection: zoomed text is legible

The local artifact is `artifacts/readme-v2.gif`.

## Comparison

The current local evidence artifact is `artifacts/side-by-side-v2.mp4`:
1920 x 540 H.264 at 60 fps, 6.25 s, 537,756 bytes. The left crop follows a
known off-center pointer coordinate; the right crop uses the recorded input
bounds.

Pending gate: a person who was not told what to look for must confirm that the
difference is obvious within ten seconds. `STATUS.md` remains Phase 1 until that
response is recorded.
