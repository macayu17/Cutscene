# Vertical 9:16 Export

## Goal

Add a separate `Export 9:16 MP4` action that reframes the recorded raster around
active traced elements. Existing GIF and 16:9 MP4 exports remain unchanged.

This is an intelligent crop and pan. It does not re-render the page at a mobile
viewport and must not imply that responsive layout is reconstructed.

## Crop model

Use the largest exact 9:16 rectangle that fits inside the captured video. Its
dimensions are integer multiples of 9 and 16 with an even common unit so H.264
`yuv420p` receives even dimensions. A 1920×1080 capture therefore uses a
594×1056 source crop and scales it to 1080×1920 without distortion.

At rest, centre the crop on the captured raster. During an active zoom segment,
interpolate its centre toward the segment's mapped focus centre using the
existing cubic entry, hold, and slow-exit timing. Clamp both axes so the crop
never leaves the source raster. The segment zoom scale is intentionally ignored:
the fixed portrait crop already reframes strongly and still shows roughly 396
CSS pixels of width for the standard 1280 CSS pixel viewport.

## Rendering order

The portrait MP4 filter graph is:

1. Blur selector redactions in original capture coordinates.
2. Convert to 60 fps.
3. Apply the time-varying 9:16 crop and pan.
4. Scale to 1080×1920 with square pixels.
5. Draw callouts in portrait output coordinates.
6. Encode H.264 `yuv420p` and map optional source audio unchanged.

Callout target geometry is mapped through the crop at the callout's click time
before the existing placement rules run. This keeps cards inside the portrait
frame and prevents placement against pixels that were discarded.

## Editor control

Add one top-bar button labelled `Export 9:16 MP4`. It produces an `.mp4` file.
The current `Export GIF` and `Export MP4` actions retain their behavior and
labels. This slice does not add a portrait preview or vertical GIF export.

## Failure behavior

Reject a capture too small to form a positive even 9:16 crop. Export errors use
the existing editor error output. No new dependency, schema field, store state,
or backend is introduced.

## Verification

- Unit-test exact crop dimensions, centre and edge clamping, cubic midpoint, and
  deterministic seeking.
- Unit-test a 1080×1920 FFmpeg plan with redaction-before-crop,
  callout-after-scale, optional audio, and unchanged legacy export plans.
- Unit-test portrait callout placement inside the frame without target overlap.
- Export a real short bundle containing distant targets, redaction, and callout.
  Confirm with `ffprobe` that it is 1080×1920, 60 fps, H.264/yuv420p, and inspect
  frames at rest, peak pan, and return.

Phase 3 remains active after this slice because its exit criterion is repeat use
on a different project.
