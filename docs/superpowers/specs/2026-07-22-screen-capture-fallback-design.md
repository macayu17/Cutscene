# Phase 12 Screen Capture Without a Trace

Date: 2026-07-22
Status: proposed direction

## Goal

Record a window or a whole screen, not only a Chrome tab, and be honest that the
result is a worse product. A screen recording has no DOM, so it has no elements,
no ranked locators, no drift detection and no regeneration. It is pixels, which
is what every other screen recorder has.

This is deliberately the last phase of the public-tool work. It dilutes the one
claim the product is built on, and it is here only because people arrive
expecting Loom's capture scope and leave when they cannot record a desktop app.

## The risk this phase carries

The failure mode is not a bug. It is a screen recording that looks like a
Cutscene recording, produces a demo that cannot be regenerated, and quietly
teaches the user that the drift claim is marketing. Every decision below exists
to make the degradation visible rather than silent.

## Chosen approach

`getDisplayMedia` in the existing offscreen document, and one new field in the
recording metadata. Nothing else in the pipeline learns a new mode.

```ts
// packages/trace/src/schema.ts, RecordingMeta
capture: { width: number; height: number; fps: number; source?: 'tab' | 'screen' };
```

`source` is optional and absent means `tab`, so every recording made before this
phase still parses. This is the only schema change; `schemaVersion` stays 1
because an omitted optional field is not a breaking change to a reader that
already ignores unknown-but-absent values. Add the field to `parseRecordingMeta`
with an explicit check that rejects any other string.

### Why not a second capture path

`chrome.tabCapture` and `getDisplayMedia` both produce a `MediaStream`. The
recorder, the clock sync, the chunk flush and the bundle writer take a stream and
do not care where it came from. The difference is entirely in what the content
script can contribute, and the content script simply never attaches for a screen
recording.

The one real consequence: there is no page to sync a clock against. The trace
still carries `system.clockSync` markers built from the offscreen document's own
clock, so `fitMediaClock` still fits and every downstream consumer keeps working.
`contentClockMs` and `workerClockMs` become the same clock. That is honest — the
two clocks are the same clock when there is no content script.

## What the editor must refuse

`hasMeaningfulTraceEvents` (`packages/editor/src/timeline.tsx:25`) already
returns false for a trace with no interaction events, and the event list already
falls back to a message. Phase 12 extends that path rather than adding a mode
flag:

- The empty-trace message becomes specific to the cause. Today it says the page
  may render to a canvas. It must instead say which of the two happened: a screen
  recording has no page structure by definition, a tab recording that produced no
  events is the canvas case.
- Element-locked zooms, callouts, the quality report, the demo kit and the
  interactive export are unavailable and say why, in place, rather than being
  hidden. A control the user cannot find teaches them nothing; a control that
  states its precondition teaches them what the product is for.
- Cursor-position zoom remains available and is labelled as what it is. The
  marketing site calls cursor-position zoom a guess. The editor must use the same
  word for it rather than quietly presenting it as equivalent.

## What the runner must refuse

`packages/runner/src/run.ts` replays ranked locators. A pixel-only bundle has
none, so `planReplay` would find nothing to plan. The runner exits 2 with a
message naming the cause, in the same style as the missing-editor message added
in Phase 10. It must not exit 0 having done nothing, and it must not exit 1,
which means drift.

The interactive export refuses for the same reason: its hotspots are recorded
element boxes.

## Capture-time differences that are not optional

- **The picker is the permission.** `getDisplayMedia` shows Chrome's own source
  picker. The extension never enumerates windows and never sees what it was not
  given.
- **Redaction selectors do not apply.** The popup's blur-selector field is
  disabled for a screen recording, because there is no DOM to match against. A
  selector silently matching nothing would be a privacy trap: the user believes
  something is blurred and it is not.
- **The recorded surface can be anything.** A screen recording can capture a
  password manager, another person's message window, or a second monitor the user
  forgot about. The popup states this before the picker opens, once, in the
  copy — not as a dismissible warning that trains people to dismiss it.
- **`system.recordingStop` still terminates the trace**, so the bundle shape is
  unchanged and the editor's parser needs no new branch.

## Privacy policy and store listing consequences

Both currently state that Cutscene records only the tab the user selected. That
stops being true. Before this ships:

- `site/privacy/index.html` gains a paragraph distinguishing the two capture
  modes and stating that a screen recording captures whatever the user grants,
  including content from applications that are not Chrome.
- `docs/store-listing.md` needs its data-use answers revisited. "Web history: no"
  stays true; the description of what is recorded does not.
- The single-purpose statement stays defensible: capture for the purpose of
  producing a demo. Adding a second capture source does not add a second purpose.

## Exit criteria

1. A screen or window recording produces a playable `media.webm`, a parseable
   `trace.jsonl` containing only system events, and a `meta.json` whose
   `capture.source` is `screen`.
2. Every recording made before this phase still parses, with `source` absent
   meaning `tab`.
3. The editor opens a pixel-only bundle, states why the element-dependent tools
   are unavailable, and still exports GIF and MP4.
4. The runner and the interactive export both refuse a pixel-only bundle with a
   message naming the cause, and the runner exits 2.
5. The blur-selector field is unavailable for a screen recording rather than
   silently matching nothing.
6. A fixture bundle asserts 3 and 4 without a human.
7. The privacy policy and listing describe both capture modes before submission.

## Deliberately not in this phase

Desktop application capture outside the browser, OCR or visual element inference
on pixels, and any attempt to reconstruct semantics from a screen recording.
PRD section 14 treats those as separate products, and the honest position stated
there is that pixel-only capture gets a worse product.
