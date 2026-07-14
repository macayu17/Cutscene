# Element-anchored callouts design

## Goal

Add the first complete Phase 3 editing feature: a callout that follows a traced
element in preview and appears in both exported formats.

## Scope

- Add, edit, select, and delete callouts in the local editor session.
- Create a callout from a selected targeted event with an automatic zoom
  segment. One callout per step is sufficient for this phase.
- Store the source event id for the current recording and the durable anchor
  required by the PRD: `stepId` plus ranked locators.
- Show a callout from its click through the zoom hold. Do not invent a separate
  duration model.
- Place the callout automatically around the transformed target without
  covering it or leaving the frame.
- Render the same callout in preview, GIF, and MP4.

Callout persistence, manual placement, animation presets, and multiple callouts
on one step are out of scope.

## Model

```ts
type EditableCallout = {
  id: string;
  sourceEventId: string;
  anchor: { stepId: string; locators: Locator[] };
  text: string;
  placement: 'auto';
};
```

The callout remains editor state, separate from the captured trace. The trace
is immutable evidence; annotations are edits derived from it.

## Timing and geometry

The matching zoom segment supplies callout timing: visible from `clickMs` to
`cameraTiming(segment).exitStartMs`. This covers the stable hold and avoids
tracking a label during camera motion.

A pure placement function receives the transformed target rectangle, output
size, and callout size. It tries top, bottom, right, then left, chooses the first
non-overlapping rectangle inside the frame, and clamps the fallback. Preview
and export use this function.

## Preview

Callout controls sit beside the existing segment controls. `Add callout` is
enabled only when the selected event has a target and matching zoom segment.
The callout renders as a quiet graphite label outside the transformed video
layer, with a single amber anchor rule. It does not animate.

## Export

The browser rasterizes each callout card to a transparent PNG with the native
Canvas API. FFmpeg receives those PNGs as additional inputs and overlays each
one only during its callout window. The overlay occurs after `zoompan`, so its
position matches the preview and its text stays sharp.

No font, rendering, or UI dependency is added.

## Verification

- Unit tests cover add/update/delete, timing, edge-aware placement, and export
  filter construction.
- Preview and export use the same placement function.
- GIF retains one global palette after callout overlays.
- Existing 47 unit tests, typecheck, build, and capture E2E remain green.
- A real loaded recording is used to verify the callout visually in the editor.
