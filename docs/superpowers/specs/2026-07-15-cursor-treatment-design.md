# Cursor Treatment

## Goal

Capture the real pointer path and make it editable as a cursor treatment with
smoothing, size, click ripple, and idle hiding. Preview, GIF, 16:9 MP4, and 9:16
MP4 use the same path. Existing recordings without pointer data do not fabricate
motion from element centres.

## Trace data

Add a viewport-relative CSS-pixel point:

```ts
type PointerPosition = { x: number; y: number };
```

`interaction.hover` events require `pointer`. `interaction.click` events may
carry `pointer`; it remains optional so existing recordings still parse. Every
event retains `v: 1`, time, route, viewport, and scroll from the existing
envelope. Pointer data contains no text, locator, or input value.

The content script listens only to mouse `pointermove` events while capture is
ready. It emits at most one `interaction.hover` sample every 33.333ms. Clicks
record the event's exact `clientX` and `clientY` alongside the existing sanitized
target. Pointer sampling stops with the recording session.

## Treatment model

The editor derives media-time samples through the existing linear clock fit and
maps each viewport point into capture coordinates with the existing capture
transform. Click points are retained as exact anchors.

Default settings:

```ts
type CursorSettings = {
  enabled: true;
  smoothing: 0.7;
  size: 24;
  ripple: true;
  idleMs: 1200;
};
```

Smoothing is a forward exponential pass over movement samples. A click resets
the pass to the exact click point, so the visible cursor and ripple cannot lag
away from the action. Frame positions are linearly interpolated between the
smoothed samples. Visibility ranges merge each sample's `idleMs` window. The
cursor is hidden before the first sample and after the final merged range.

## Editor control and preview

Add one compact `CURSOR` row below `BRAND`:

- enabled checkbox
- smoothing range, 0-100%
- size range, 12-48px
- click ripple checkbox
- idle hide input, 0-5000ms

If the bundle has no pointer samples, show `No pointer data captured.` and do
not enable cursor export. Do not synthesize a fallback.

The preview cursor is drawn outside the zoomed video transform so its size stays
constant. Its point is transformed through the active camera every animation
frame. The arrow uses cold grey with a dark outline. The semantic click ripple
uses amber and lasts 400ms. Timeline shortcuts continue to ignore nested form
controls. Increasing the fixed desktop timeline height is allowed; no mobile
layout is added.

## Export

Render one transparent cursor-arrow PNG and four transparent ripple PNG phases
with Canvas. Add them to the existing image-overlay pipeline after redaction,
camera, callouts, and watermark, but before optional intro/source/outro concat.
No dependency or renderer is added.

The cursor overlay uses FFmpeg frame expressions:

- A piecewise-linear path is expressed as a sum of clamped ramps, avoiding a
  deeply nested conditional for long recordings.
- The current zoom/crop expression maps capture points into final output space.
- Merged idle ranges form the overlay enable expression.
- Four 100ms ripple overlays per click reuse the four written PNG assets; each
  phase grows and fades through its baked size/opacity.

Cursor size is in final output pixels and does not scale with zoom or portrait
crop. GIF retains one global palette after every overlay. Brand intro/outro cards
do not contain the cursor because the cursor is applied to the recorded source
before concat.

## Compatibility and failure behaviour

Old traces parse because click pointer data is optional and they contain no
hover events. The editor shows the explicit no-data state and exports unchanged
media. Malformed pointer objects are rejected by the trace parser. Canvas/PNG
or FFmpeg failures use the existing export error output.

No pointer type beyond mouse, synthetic path, backend, dependency, package,
custom cursor upload, or trace schema version bump is introduced.

## Verification

- Unit-test pointer validation, malformed data rejection, and old click traces.
- Capture a known Playwright mouse path and precise click; report sample count,
  maximum sampling rate, click coordinate error, and proof that no target text
  is added to hover samples.
- Unit-test smoothing, exact click anchoring, interpolation, idle ranges, and
  ripple phase timing.
- Unit-test output expressions for rest/zoom/portrait coordinates, idle enable,
  overlay order, one GIF palette, and unchanged no-pointer exports.
- Inspect real preview and exported GIF, MP4, and 9:16 frames at movement, click,
  ripple, and idle. Report cursor centre error, displayed size, ripple duration,
  and idle disappearance as numbers.

Phase 3 remains active after implementation until the complete workflow is used
on a different project and its repeat-use exit criterion is recorded.
