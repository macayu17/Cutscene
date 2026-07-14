# Selector-based visual redaction design

## Goal

Blur every visible element matching an explicitly configured CSS selector in
the editor preview, GIF, and MP4 without storing the element's text or a DOM
snapshot.

Selectors are configured before recording. A selector entered after recording
cannot be resolved against old pixels, so post-record selector discovery is
out of scope. The editor may disable or delete captured redaction tracks.

## Capture contract

The extension control adds one newline-separated selector field. Start rejects
the request if any selector is invalid in the target tab. Valid selectors are
sent with `session.start` and recorded in
`meta.privacy.visualRedactionSelectors`.

While recording, the content script checks the configured selectors once per
animation frame. A `WeakMap<Element, string>` gives each match a session-local
instance id. A compact trace event is emitted only when an instance appears,
disappears, or its viewport box changes by at least 0.5 CSS px:

```ts
type RedactionSampleEvent = EventEnvelope & {
  type: 'annotation.redaction';
  selector: string;
  instanceId: string;
  visible: boolean;
  box?: BoundingBox;
};
```

`annotation.redaction` is added to the v1 event union. The event carries no
target descriptor, text, value, accessible name, or DOM HTML. Existing v1
bundles remain valid because the metadata selector list is optional.

Sampling stops with the recording session. Invalid selectors return a normal
message-boundary error and recording does not begin.

## Editor model

Redaction samples are immutable trace evidence. On bundle load the editor
creates one enabled track per configured selector:

```ts
type EditableRedaction = { selector: string; enabled: boolean };
```

The timeline shows a compact `REDACTIONS` row with selector text, an enabled
checkbox, and Delete. Adding a selector after recording is not offered because
the required geometry does not exist.

At a media time, the active box for each instance is the latest mapped sample
at or before that time. A hidden sample ends the instance. Samples are ordered
by trace time and mapped through the existing fitted media clock.

## Preview and export

Preview blur layers live inside `.video-transform`. Their source-video
coordinates are mapped with the existing capture transform, so the current
camera CSS transform moves and scales the blur with the pixels. Native
`backdrop-filter: blur(...)` is used only for functional redaction.

Export applies blur to source-video rectangles before `zoompan`. The existing
zoom filter then moves blurred pixels and unblurred pixels together. Each
sample remains valid until the next sample for that instance; a hidden sample
emits no blur interval. Callouts remain after zoom, and the GIF still creates
one global palette after all compositing.

The initial renderer uses one FFmpeg blur interval per recorded geometry
interval. This is deliberately simple and exact. If a measured real recording
shows filter-graph size or export time is unacceptable, replace only the
export interval compiler; the trace and editor model remain unchanged.

## Verification

- Schema tests accept valid redaction samples, reject malformed samples, and
  continue accepting existing bundles without the optional metadata field.
- Capture tests prove configured selectors emit geometry without text or value.
- Timeline tests cover visible, moved, and hidden instance intervals through a
  non-identity media clock.
- Export-plan tests prove blur occurs before zoom, callouts remain after zoom,
  and GIF palette generation remains last and global.
- A real short recording verifies one selector in preview, GIF, and MP4, with
  the blurred box inspected before and after scrolling.

## Not included

No DOM snapshot, OCR, manual drifting rectangle, backend, persistent preset,
or retroactive selector entry. Capture-time trace masking remains the privacy
boundary; visual redaction is an explicit rendering edit.
