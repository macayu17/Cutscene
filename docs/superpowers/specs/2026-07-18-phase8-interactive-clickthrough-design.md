# Phase 8 Linear Interactive Demo

Date: 2026-07-18
Status: approved direction

## Goal

Export a recording as a local, linear click-through demo. The video plays until
the next recorded click, pauses, and shows an amber hotspot over that click's
recorded target. Clicking the hotspot continues playback. The flow ends only
after every recorded click target has been activated.

The output must work without a Cutscene account, backend, paid service, or
installed runtime.

## Chosen approach

Package the existing rendered MP4 with one self-contained `index.html` in a ZIP.
The HTML contains a versioned manifest and the player code, so there is no fetch
or module-loading requirement. It references `demo.mp4` beside it.

This approach was chosen over two alternatives:

- Screenshot slides lose the motion, zoom timing, cursor treatment, and audio.
- Rebuilding or embedding the live application requires application state,
  branching, and hosting. PRD section 14 explicitly treats that as a separate
  product.

## Export flow

The editor adds one `Export interactive demo` action.

1. Reuse the current MP4 renderer with the active zoom segments, redactions,
   callouts, cursor settings, and brand preset.
2. Select `interaction.click` events that have a target bounding box.
3. Convert each trace time through the fitted media clock.
4. Map the recorded CSS-pixel box into capture pixels with the shared coordinate
   transform, then through the camera state at that time into the 1920x1080 MP4
   output.
5. Add the 1.5 second intro offset when the selected brand has an intro.
6. Embed the ordered steps in the HTML as a `v: 1` manifest.
7. Store `index.html` and `demo.mp4` in the existing dependency-free ZIP writer.

The export fails with a direct message when there are no clickable target
events. It does not invent hotspots for navigation, input, keypress, canvas, or
targetless events.

## Manifest

Only fields needed by the player are exported:

```ts
type InteractiveManifest = {
  v: 1;
  recordingId: string;
  width: 1920;
  height: 1080;
  steps: Array<{
    eventId: string;
    timeMs: number;
    label: string;
    box: { x: number; y: number; width: number; height: number };
  }>;
};
```

Labels use the existing privacy-safe target-label rules: accessible name, then
text, then role or tag name. `[MASKED]` is never exported as meaningful copy.
The manifest contains no input values, locators, comments, network data, or raw
trace events. JSON embedded in HTML is escaped so target text cannot terminate
the script element.

## Player behaviour

The player uses the existing instrument palette and typography. Amber remains
reserved for the hotspot and progress signal.

- `Start demo` begins playback through an explicit user gesture, preserving
  audio where present.
- Playback pauses at every step using `requestVideoFrameCallback`, with a
  `timeupdate` fallback. The playhead is corrected to the recorded step time.
- The hotspot is positioned as percentages of the rendered video surface, so it
  remains aligned when the browser window changes size.
- Clicking the hotspot hides it and resumes playback toward the next step.
- Clicking elsewhere does not advance. It redraws the hotspot outline for 120ms,
  except when reduced motion is requested.
- The hotspot is a real button with visible keyboard focus. Enter or Space
  activates it. `Restart` returns to the first step.
- At the end, the player shows `Demo complete` and a `Replay` control.

The video has no seek controls because seeking would bypass the linear flow.

## Error handling

The player states failures directly:

- `Video could not be loaded. Keep index.html and demo.mp4 in the same folder.`
- `This demo has no clickable steps.`
- `Playback could not start. Select Start demo again.`

An export failure leaves the editor recording and timeline unchanged.

## Verification gate

Phase 8's linear interactive-demo slice is complete when all of the following
are measured against a real TodoMVC recording:

1. The downloaded ZIP contains `index.html` and a playable `demo.mp4`.
2. The number and order of player steps exactly match trace click events with
   target boxes.
3. Automated Chromium activates every hotspot in order and reaches
   `Demo complete`; wrong clicks do not advance and Replay returns to step one.
4. Ten sampled hotspot edges, or all hotspots when fewer than ten exist, align
   with their expected camera-transformed boxes within 4 rendered pixels.
5. The HTML contains no target input values, locator payloads, comments, or raw
   trace JSON.
6. Unit tests, typechecking, production builds, and the relevant Chromium
   end-to-end flow pass.

Measured counts, box errors, privacy scan results, artifact sizes, and hashes are
recorded in `STATUS.md` before Phase 8 is called complete.

## Explicitly deferred

Branching, arbitrary viewer input, multiple navigation paths, live-app state,
native capture, OCR/canvas inference, AI voice or translation, hosting, auth,
billing, and analytics remain unbuilt. None is needed for the linear trace-based
click-through described by PRD section 14.
