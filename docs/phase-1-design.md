# Phase 1 design: element-locked zoom and README export

Status: proposed for implementation review. Phase 1 code has not been started.

## Outcome

Phase 1 turns a tab recording into a structured capture that can generate a
short, legible README clip. A user records a DOM-based workflow, inspects the
captured events in a trace lane, previews element-locked zooms, and exports GIF
or MP4 locally.

The acceptance target is the Phase 1 exit criterion in `PRD.md`: record the
specified flow, generate a clip whose zoom lands within one frame of the click,
and export a legible 800 px-wide GIF under 3 MB.

## Scope

Build only:

- `packages/trace`: versioned trace schema, privacy boundary, locator ranking,
  clock mapping, coordinate mapping, and zoom derivation
- `packages/extension`: MV3 capture of video plus the complete v1 trace
- `packages/editor`: local playback, event inspection, zoom preview, and export

Do not build collaboration, comments, permissions, a backend, authentication,
cloud storage, or a `demo.yml` parser. The Phase 0 spike remains evidence and is
not a production dependency.

## Architecture

```text
content script ── events + sync replies ─┐
                                        ├─ service worker ─ offscreen recorder
tabCapture stream ──────────────────────┘         │
                                                  ▼
                                      IndexedDB capture bundle
                                      media.webm + trace.jsonl
                                                  │
                                                  ▼
                         editor ─ trace model ─ preview/export worker
                                              └─ ffmpeg.wasm
```

`packages/trace` owns every rule shared by capture and playback. The extension
collects raw browser observations and immediately converts them into safe trace
events. The editor consumes those events; it does not recreate locator, clock,
or coordinate logic.

## Trace contract

Implement the complete `v: 1` schema from `PRD.md` §3 during capture, including
fields not yet rendered in Phase 1: `stepId`, ranked `locators`, `scroll`, and
`app`. Every schema object writes `v` first.

Event construction is the privacy boundary. Passwords and masked input values
are removed before an event can be serialized or sent across an extension
message boundary. The trace pipeline returns discriminated result values; it
does not throw across that boundary.

Locators are generated once at capture time and ranked from stable semantics to
fragile structure. The DOM element's bounding box is recorded in viewport CSS
pixels together with viewport size, device pixel ratio, and scroll position.

## Time and coordinates

Clock markers use a midpoint exchange: media time is sampled immediately before
and after the content-script round trip, and the midpoint is paired with the
content `performance.now()` value. Playback maps content time to media time with
a least-squares linear fit across all valid markers. It rejects an insufficient
or degenerate fit instead of silently substituting wall-clock time.

Coordinate conversion is one function in `packages/trace`. It maps viewport CSS
coordinates into the captured video's contained viewport rectangle, accounting
for capture resolution and letterboxing. No component applies an ad hoc offset.
An event box is renderable only when its recorded scroll state is valid for the
displayed frame; stale boxes are explicitly unavailable.

## Capture flow

1. The user invokes the extension on the active tab.
2. The service worker obtains a `tabCapture` stream ID from that invocation.
3. An offscreen document records the stream with `MediaRecorder` while the
   content script emits safe events and periodic clock markers.
4. Stop finalizes one capture bundle in IndexedDB and offers the original WebM
   and JSONL for disk export.
5. Capture failures return a precise action: unsupported page, missing trace,
   recorder failure, or invalid clock fit.

Use native browser APIs unless a dependency removes substantial, measured
complexity. No Phase 0 automation code ships in the extension.

## Editor interaction design

The editor is a single React page with Zustand state and the fixed instrument
layout from `AGENTS.md`:

- 32 px metadata and export bar
- 240 px event list beside the video
- waveform, scrubber, dense trace lane, and zoom segments below

The trace lane is built first. Every event is a tick. Hover snaps its recorded
box onto the video in amber; click seeks to its mapped media time. Arrow keys
seek, `[` and `]` set segment bounds, and focus is visible on every control.

Amber appears only on machine-understood data: event ticks, bounding boxes, and
generated zoom segments. The interface uses the specified cold graphite tokens
and IBM Plex Mono; IBM Plex Sans is limited to prose. The box snaps, with an
optional 120 ms stroke reveal disabled under `prefers-reduced-motion`.

Zustand stores capture metadata, selected event, playhead, segment bounds, zoom
segments, and export state. Video playback time remains the timing source; the
store does not run a second playback clock.

## Zoom generation and export

Zoom segments are derived from mapped click events using the exact timing,
easing, padding, scale, collision, and framing rules in `PRD.md` §8. The target
is the recorded element box, not the pointer coordinate. Preview and export use
the same derived segment model so they cannot disagree.

`ffmpeg.wasm` runs off the main UI path. GIF export uses one global palette for
the full clip to prevent shimmer. Export exposes only the specified controls
and reports units for duration, dimensions, frame rate, and output size. A
hairline progress indicator is the only progress animation.

## Ownership map

```text
packages/trace/src/
  schema.ts       v1 types and parse/serialize validation
  privacy.ts      capture-time masking
  locators.ts     locator generation and ranking
  clock.ts        marker validation and linear fit
  coordinates.ts viewport-to-video mapping and stale-box rules
  zoom.ts         deterministic segment derivation

packages/extension/src/
  background.ts   lifecycle and message coordination
  content.ts      DOM observation and safe event construction
  offscreen.ts    MediaRecorder and sync sampling
  storage.ts      native IndexedDB capture bundles

packages/editor/src/
  store.ts        Zustand editor state
  events/         event list and selection
  video/          playback and semantic overlay
  timeline/       scrubber, trace lane, and zoom segments
  export/         ffmpeg worker and codecs
```

## Verification gates

- Unit tests: every v1 schema field, serialization round-trip, locator ranking,
  raw secret non-appearance, clock fit with drift/outliers, coordinate mapping
  with letterboxing, scroll invalidation, and deterministic zoom segments
- Playwright capture: real third-party DOM app, playable WebM, complete JSONL,
  and synchronized click boxes
- Editor interaction: tick hover overlay, tick seek, keyboard seeking and bounds,
  reduced motion, and stale-box suppression
- Export: preview/export use identical segment timestamps; global GIF palette;
  800 px output is legible and below 3 MB for the acceptance recording
- Measurement: ten sampled zooms report signed frame errors and maximum error;
  Phase 1 advances only when the PRD exit criterion is recorded in `STATUS.md`

## Implementation order

1. Trace schema, privacy, clock, coordinates, locators, and tests
2. Production extension capture and IndexedDB bundle
3. Editor shell and signature trace-lane interaction
4. Deterministic zoom model and preview
5. MP4/GIF export, size tuning, and measured acceptance recording

Each slice must remain independently testable. Later-phase fields are captured
but not surfaced as speculative UI.
