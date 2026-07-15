# Step-by-step Documentation and Screenshot Set

## Goal

From the same trace, generate two artifacts (PRD.md §10): step-by-step
Markdown documentation and a per-step screenshot set. The action copy comes
from the DOM's accessible name, never from a language model. Screenshots are
cropped to the target element and exported at 2x.

## Where it lives

Copy generation is pure trace-to-string with no DOM dependency, in
`packages/trace/docs`. It emits a `DocStep[]` model and the Markdown. Screenshot
rendering needs the decoded video, so it lives in the editor
(`docs-export.ts`) using Canvas 2D. Packaging uses a store-method ZIP writer
(`zip.ts`) so both artifacts download as one archive with no dependency.

## Documented steps

One step per `navigation`, `interaction.click`, and `interaction.input`. Hovers,
scrolls, redaction samples, resizes, and clock syncs are not documented. Each
step carries its target box for cropping and a screenshot path when a box exists;
navigation steps have no screenshot.

## Action copy

Derived from the descriptor already captured:

- click -> `Click **<label>**.`
- input with a real value -> `Enter \`<value>\` into **<label>**.`
- input with a masked value -> `Fill in **<label>**.`
- navigation -> `Open \`<route>\`.`

`<label>` prefers the accessible name, then the visible text, then the role,
then the tag name. A masked accessible name or value never reaches the doc: the
label falls back to a structural name and the masked value is never printed.

## Screenshots

For each step with a target box, seek the loaded video to the step's media time
through the existing linear clock fit, map the viewport box into capture pixels
with the existing capture transform, pad by 24 CSS px, and draw the crop to a
Canvas at 2x. Encode PNG. The screenshot set is the same PNGs without the
Markdown.

## Editor controls

Two header actions: `Export docs` (Markdown plus screenshots) and
`Export screenshots` (screenshots only). Both reuse one rendering pass and are
disabled during an FFmpeg export. Neither touches FFmpeg.

## Failure behaviour

Copy generation is pure and cannot fail on a parsed bundle; an empty flow yields
an explicit empty-doc body. A missing 2D context or a failed PNG encode surfaces
through the existing export-error output.

## Verification

- Unit-test documented-event selection, action copy, masked-name and
  masked-value safety, label fallback, and screenshot naming.
- Unit-test the ZIP writer: CRC-32 against a known value, store method,
  signatures, entry counts, and the empty archive.
- Externally round-trip a written archive through the platform unzip.
- Drive the built editor with a real bundle in Chromium: export both archives,
  confirm zero console errors, and report the documented step count, screenshot
  count, and each screenshot's decoded dimensions.

Phase 3 remains formally unmet on repeat use; Phase 4 proceeds under the
recorded 2026-07-15 owner override.
