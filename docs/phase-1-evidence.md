# Phase 1 evidence

Status: implementation verified; phase gate pending uninformed-human comparison.

## Production recording

- Target: `https://todomvc.com/examples/react/dist/`
- Metadata duration: 60.1537 s
- Last encoded packet: 59.7990 s
- Encoded capture: 1920 x 1080
- Media size: 1,136,518 bytes
- Trace events: 71
- Clicks: 15
- Clock markers: 32
- Input events: 17, with raw values absent from JSONL
- Navigation / scroll / resize: 1 / 3 / 1
- Clock fit: slope `0.9999937740399287`, intercept `-1262.672878364181`

Decoded source-frame errors for sampled clicks 1, 3, 4, 6, 7, 9, 10,
12, 13, and 15:

`-1, -1, -1, -1, -1, 0, -1, -1, -1, 0`

- Mean absolute error: 0.8 frame
- Maximum absolute error: 1 frame
- Within one frame: 10/10

The source WebM is variable-frame-rate: 255 decoded frames over 59.799 s. Frame
error is therefore measured against adjacent decoded source frames, not an
invented 30 fps interval.

## README GIF

- Source duration: 5.74 s
- Output: 800 x 450 at 15 fps
- Size: 2,933,075 bytes
- Palette: one global palette, Bayer dithering, diff mode
- Manual inspection: zoomed text is legible

A full-length 59.79 s export measured 18,611,263 bytes and does not pass the
README size gate. It is not presented as the acceptance GIF.

## Comparison

The current local evidence artifact is `artifacts/side-by-side-smooth.mp4`: 1920 x 540 H.264,
6.2333 s, identical footage on both sides. The left crop follows a known
off-center pointer coordinate; the right crop uses the recorded input bounds.

The zoom transition uses a cubic 400 ms ease-in, holds through 900 ms after the
click, then uses a cubic 400 ms ease-out. At 30 fps, each transition has 12
rendered frames. `artifacts/screenshots/zoom-transition-contact-sheet.png`
samples the exported element-locked transition at 100 ms intervals. An informed
review confirmed that the two crops differ and identified the earlier return as
abrupt; this regenerated artifact contains the corrected timing.

Pending gate: a person who was not told what to look for must confirm that the
difference is obvious within ten seconds. `STATUS.md` remains Phase 1 until that
response is recorded.
