# Transcript and Captions

## Goal

Bring a transcript into the editor and export clean SRT and VTT anchored to the
demo (PRD.md §10). Phase 4 does not transcribe audio: an ASR engine is tens of
megabytes and browser-only ASR is Phase 8 territory (PRD.md §14). Word-level
timing comes from an imported caption file or manual entry. The cue model is
anchored to media time so a later ASR pass fills the same structure with no
schema change.

## Where it lives

Parsing and serialisation are pure and DOM-free, in `packages/trace/captions`.
The editor holds the parsed cues in the Zustand store and exports both formats.
No dependency and no FFmpeg.

## Cue model

```ts
type CaptionCue = { startMs: number; endMs: number; text: string };
```

## Import

One parser accepts both SRT and VTT. It strips a BOM, normalises CRLF, skips the
`WEBVTT` header, `NOTE` blocks, and cue identifiers, and accepts timestamps with
or without an hours field and with either `,` or `.` before the milliseconds.
Multi-line cue text is preserved. A transcript with no cues, or a cue that ends
before it starts, is rejected with a message; the editor shows it and imports
nothing.

## Export

`Export SRT` writes comma-delimited timestamps with 1-based indices. `Export VTT`
writes a `WEBVTT` header with dot-delimited timestamps. Both are disabled until a
transcript is imported. Re-exporting a file imported in the other format
normalises it: hours are filled in, notes and identifiers are dropped, and line
endings are regularised.

## Failure behaviour

Parsing returns a discriminated result; a malformed transcript surfaces its error
through a caption-error output and leaves any previously loaded cues cleared.
Loading a new recording clears captions so they never cross recordings.

## Verification

- Unit-test SRT and VTT serialisation, round-trip through parse, hours-less VTT,
  BOM and CRLF tolerance, NOTE and identifier skipping, and the empty and
  backwards-cue rejections.
- Drive the built editor in Chromium: import a messy hours-less CRLF VTT with a
  NOTE, export SRT and VTT, and confirm both are normalised with zero console
  errors.

Phase 3 remains formally unmet on repeat use; Phase 4 proceeds under the
recorded 2026-07-15 owner override.
