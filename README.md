# Cutscene

Cutscene records a Chrome tab and the DOM events behind it. The editor uses
recorded element bounds to frame clicks instead of guessing from cursor
coordinates.

![Cursor-position zoom on the left and element-locked zoom on the right](docs/assets/element-locked-comparison.gif)

Same recording. Cursor-position zoom on the left; recorded-element zoom on the
right.

## Limitations

- Chrome only.
- DOM-based web applications only. Canvas, WebGL, maps, and similar surfaces
  fall back to pixels because they do not expose useful semantic elements.
- Cross-origin iframes cannot be traced.
- Shadow DOM is traced only when its root is open.
- Recording and editing are local by default. The optional self-hosted share
  server has public UUID links only; it has no accounts or private links.

## What works today

- Tab video capture with optional microphone audio.
- A versioned JSONL trace containing clicks, inputs, navigation, scrolling,
  viewport changes, ranked locators, element bounds, and clock-sync markers.
- Capture-time masking for input values and sensitive elements.
- A local editor with an event list and trace lane. Hover a tick to inspect its
  recorded element; click it to seek.
- Automatic element-locked zooms with manual add, delete, retime, and retarget
  controls.
- Element-anchored callouts rendered consistently in preview, GIF, and MP4.
- Preconfigured CSS-selector blur tracks with enable/delete controls and the
  same redaction in preview, GIF, and MP4.
- Cursor smoothing, click ripple, idle hiding, local brand presets, and 9:16
  crop export.
- README GIF export with one global palette, plus 1080p H.264 MP4 export.
- Step documentation, cropped screenshots, per-step GIFs, a Playwright flow
  skeleton, and imported SRT/VTT captions.
- A minimal filesystem-backed server for uploading a bundle and sharing its
  video through a public link.

## Run locally

You need Chrome, Node.js, and pnpm 11.6.0.

```sh
pnpm install
pnpm build
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**,
and select `packages/extension/dist`.

Start the editor:

```sh
pnpm --filter @cutscene/editor exec vite
```

Open the local URL printed by Vite.

Start the optional share server:

```sh
pnpm --filter @cutscene/server start
```

It stores bundles in `data/` and listens on port `4180`. Create a recording with
`POST /api/recordings`, upload `media.webm`, `trace.jsonl`, and `meta.json` with
`PUT /api/recordings/<id>/<file>`, then share `/r/<id>`.

## Record and edit

1. Open a DOM-based page in Chrome.
2. Open the Cutscene extension. Add any CSS selectors that must be visually
   blurred, then start recording. Microphone capture is optional.
3. Stop recording. Chrome downloads `media.webm`, `trace.jsonl`, and `meta.json`
   into one `cutscene-<recording-id>` folder.
4. Choose that folder in the editor.
5. Inspect the trace, adjust the edit, then export video, documentation,
   screenshots, step GIFs, a Playwright skeleton, or captions.

## Measured result

The Phase 1 acceptance run recorded 60.1459 seconds with 15 clicks. Ten sampled
zooms landed on the correct element; mean timing error was 0.258 frame and the
maximum was 0.422 frame. The 800×450 README GIF was 2,352,555 bytes at 15fps.
See [the evidence report](docs/phase-1-evidence.md) for the full measurements.

Phase 5 is in progress. See [`STATUS.md`](STATUS.md) for implementation
evidence, measured artifacts, and gate history.

## Development

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm e2e
```

The repository has four active packages:

- `packages/extension` — Manifest V3 capture extension.
- `packages/trace` — schema, privacy, locators, clock mapping, coordinates, and
  zoom generation.
- `packages/editor` — local React editor and FFmpeg export pipeline.
- `packages/server` — optional self-hosted public share links.
