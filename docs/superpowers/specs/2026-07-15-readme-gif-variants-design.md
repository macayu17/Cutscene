# README GIF Variants

## Goal

The full-flow README GIF already exists (the `gif` export). This adds the second
half of PRD.md §10's "README GIF variants": one GIF per step, for docs. Each
per-step GIF is the same tuned 800px global-palette GIF, trimmed to that step's
zoom window.

## Where it lives

The export pipeline gains an optional time window; a thin `gif-export.ts` in the
editor loops the zoom segments and packages the per-step GIFs with the existing
store-method ZIP writer. No new dependency.

## The window

`buildExportPlan` takes an optional `{ startSeconds, endSeconds }`. For a GIF it
inserts `trim=start:end,setpts=PTS-STARTPTS` **after** the camera and overlays,
so their absolute-time expressions stay correct, and **before** the palette
split, so `palettegen` and `paletteuse` both see only the windowed frames and the
one-global-palette rule is preserved. Without a window the plan is byte-for-byte
unchanged.

## Per-step export

`exportStepGifs` orders the zoom segments by start time and exports one GIF per
segment, each with only that segment's camera and a window of the segment's
`[startMs, endMs]`. Per-step GIFs are unbranded and callout-free by design: they
are documentation snippets, not the hero clip. Redactions and cursor treatment
are kept because they are correctness and privacy, not decoration. Files are
named `step-01.gif`, `step-02.gif`, ... in segment order and zipped.

## Editor control

One `Export step GIFs` action, disabled when there are no zoom segments (a
recording whose only click was suppressed by a scroll produces none) or during
another export.

## Failure behaviour

Each GIF runs through the existing FFmpeg path; a failure surfaces through the
existing export-error output. The full-flow GIF path is untouched.

## Verification

- Unit-test that a window inserts the trim after the camera and before the single
  palette, and that no window leaves the plan unchanged.
- Drive the built editor in Chromium with a 15-click recording: export the
  per-step archive and confirm every entry is a valid GIF89a at 800x450 with a
  distinct size (each a different window), with zero console errors.

Phase 3 remains formally unmet on repeat use; Phase 4 proceeds under the
recorded 2026-07-15 owner override.
