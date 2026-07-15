# Local Brand Presets

## Goal

Add named, browser-local brand presets for exports. A preset controls one
colour, one built-in font family, an optional intro line, an optional outro
line, and an optional text watermark. Existing unbranded exports remain
unchanged until a preset is selected.

## Preset model

```ts
type BrandFont = 'mono' | 'sans' | 'serif';

type BrandPreset = {
  id: string;
  name: string;
  color: string;
  font: BrandFont;
  intro: string;
  outro: string;
  watermark: string;
};
```

Presets and the selected preset id are stored in `localStorage`. Parsed data is
validated before use; corrupt or old data falls back to no presets and no
selection. Names and text are trimmed. Colour accepts only `#RRGGBB`. The
editor provides create, update, select, and delete operations. Changes save
immediately. Deleting the selected preset returns to unbranded export.

There is no built-in branded default. This preserves every current export and
keeps Cutscene branding out of user recordings.

## Editor control

Add one compact `BRAND` row beneath the existing redaction controls. It contains
a preset selector, `New`, and `Delete`, followed by fields for name, colour,
font, intro, outro, and watermark. Fields save immediately. All controls use
the existing dense instrument styling. The preset colour never changes editor
chrome and never uses the semantic amber signal channel.

The selected watermark is shown over the video preview in the lower-right
corner. Intro and outro cards are export-only; the panel fields are their
editor representation. Empty intro, outro, or watermark text disables only
that asset.

## Rendering

Use the browser Canvas API already used for callout PNGs. Brand cards are
full-frame PNGs with the preset colour as the background and centred light or
dark text chosen for contrast. The watermark is a transparent PNG containing
the preset text in the same font and colour. Font choices map to existing
browser families:

- `mono`: IBM Plex Mono, then `monospace`
- `sans`: IBM Plex Sans, then `sans-serif`
- `serif`: `Georgia`, then `serif`

Intro and outro cards last a fixed 1.5 seconds. They use the target export size:
800x450 for GIF, 1920x1080 for MP4, and 1080x1920 for 9:16 MP4. The watermark
is placed inside the lower-right safe area after zoom/crop and redaction, so it
stays constant in output pixels.

For GIF, intro, processed source, and outro are concatenated before the one
existing global palette is generated. For MP4, the same video order is used.
Optional source audio is delayed by the intro duration and padded across the
outro, so picture and sound remain aligned. Empty cards add no duration.

Callout styling remains unchanged. Brand colour and font apply to brand assets,
not to the editor's semantic overlays.

## Failure behaviour

Canvas or PNG encoding failures use the existing export error output. Invalid
persisted data is ignored without preventing the editor from loading. A blank
name becomes `Untitled`; the native colour input supplies a valid colour. No
error crosses an extension message boundary.

## Scope

No uploaded logos, custom fonts, IndexedDB assets, backend, account, shared
kit, trace field, dependency, or new package is introduced. Add uploaded assets
only after users demonstrate that text watermarking is insufficient.

## Verification

- Unit-test validation, persistence fallback, create/update/delete, and selected
  preset behaviour.
- Unit-test deterministic card and watermark layout inputs.
- Unit-test filter ordering, exact 1.5 second card durations, one GIF palette,
  unchanged unbranded plans, and MP4 audio delay/padding.
- Export a branded GIF, 16:9 MP4, and 9:16 MP4 through the real editor. Inspect
  intro, source watermark, outro, portrait safe-area placement, dimensions,
  duration, and audio sync.
- Reload the editor and confirm two named presets remain local and selectable.

Phase 3 remains active after this slice because cursor treatment and the
different-project repeat-use exit criterion remain open.
