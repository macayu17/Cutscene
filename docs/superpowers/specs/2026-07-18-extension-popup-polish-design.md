# Extension Popup Polish

Date: 2026-07-18
Status: approved direction

## Goal

Make the existing capture popup easier to scan without changing its workflow.
It remains a small technical control surface for starting and stopping a tab
recording, choosing microphone capture, and entering selectors to blur.

## Chosen approach

Use semantic HTML and the existing plain CSS only. Preserve the current control
IDs, button names, message flow, permissions, and recorder logic so the capture
end-to-end test continues to exercise the same product behaviour.

The popup becomes 320px wide and is divided by hairlines into three quiet
regions:

1. A compact `CUTSCENE / TAB CAPTURE` header with the current status.
2. A capture-settings region for the microphone and blur selectors.
3. A two-button action row for `Record tab` and `Stop and save`.

This is preferred over a multi-view popup or a component rewrite. The popup has
one short task, and navigation or new state would make it slower without adding
capability.

## Visual rules

- Reuse the product's cold graphite palette and small monospaced type.
- Use IBM Plex Mono when available, with the current system monospace fallback.
- Keep buttons neutral. Amber is not used because no popup control represents a
  trace target, event tick, or generated zoom segment.
- Use the danger colour only for an actual error message, not for the stop
  button.
- No cards, gradients, shadows, icons, decorative motion, or rounded floating
  surfaces.
- Strong hierarchy comes from spacing, uppercase section labels, contrast, and
  one-pixel dividers.

## Behaviour and accessibility

- `Include microphone` remains a native checkbox.
- `Blur selectors` remains a resizable textarea accepting one selector per
  line, with a short explanatory hint.
- The status is exposed as a live region so start, recording, saved, and error
  changes are announced.
- Existing visible keyboard focus is retained and every action remains operable
  by keyboard.
- Disabled controls remain visibly distinct while preserving readable contrast.
- Recorder errors set an error state on the existing output; no new state model
  is introduced.

## Verification

1. Extension typechecking and production build pass.
2. Existing extension unit and Chromium capture tests pass without selector or
   workflow changes.
3. A real Chromium screenshot confirms the popup at its intended dimensions,
   with no clipping or overflow.
4. The browser console reports no popup errors.

## Explicitly deferred

No recording history, presets, timer, waveform, routing, native capture, OCR,
AI voice, new permissions, or dependencies are part of this polish pass.
