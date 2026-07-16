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
- A local regeneration dry run that replays ranked locators and writes a drift
  report without rendering assets or opening a pull request.

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

It stores bundles in `data/` and listens on port `4180`. After loading a
recording in the editor, choose **Create share link** and enter the server URL.
The editor uploads the original three files and shows the public link.

## Check a recorded flow against a current build

The Phase 7 runner has one local mode. It validates `demo.yml`, optionally runs
a seed command, replays the stored trace in Chromium, and reports which ranked
locator resolved each action. It does not capture new pixels, render the
declared outputs, use hosted CI, or open a pull request.

```yaml
version: 1
demos:
  - id: todo-flow
    trace: .cutscene/todo-flow.trace.jsonl
    baseUrl: ${{ env.PREVIEW_URL }}
    seed: pnpm run seed:demo
    inputs:
      step_0001: ${{ env.DEMO_TODO }}
    outputs:
      - type: gif
        path: docs/assets/todo-flow.gif
        width: 800
```

An environment reference must occupy the whole value. Input overrides are
keyed by the recorded `stepId` and stay in memory; they are not written to the
trace or reports.

```powershell
$env:PREVIEW_URL='http://127.0.0.1:4173'
$env:DEMO_TODO='Recorded demo value'
pnpm --filter @cutscene/runner regenerate -- --config demo.yml --dry-run
```

Add `--demo todo-flow` to run one configured demo. Reports are written to
`.cutscene/reports/<demo-id>/drift-report.json` and `drift-report.txt` beside
`demo.yml`.

- Exit `0`: every planned step was evaluated and matched its first locator.
- Exit `1`: at least one step drifted, became orphaned, or was not evaluated.
- Exit `2`: the config, trace, replay plan, seed, browser, or report write
  failed.

Version 1 keypress events do not record the key value, so the runner rejects
them instead of inventing an action such as Enter. A keyboard action absent
from the trace can also cause a later locator to become orphaned.

## Record and edit

1. Open a DOM-based page in Chrome.
2. Open the Cutscene extension. Add any CSS selectors that must be visually
   blurred, then start recording. Microphone capture is optional.
3. Stop recording. Chrome downloads `media.webm`, `trace.jsonl`, and `meta.json`
   into one `cutscene-<recording-id>` folder.
4. Choose that folder in the editor.
5. Inspect the trace, adjust the edit, then export video, documentation,
   screenshots, step GIFs, a Playwright skeleton, or captions.
6. To share the recording, start the optional server and choose **Create share
   link** in the editor.

## Measured result

The Phase 1 acceptance run recorded 60.1459 seconds with 15 clicks. Ten sampled
zooms landed on the correct element; mean timing error was 0.258 frame and the
maximum was 0.422 frame. The 800×450 README GIF was 2,352,555 bytes at 15fps.
See [the evidence report](docs/phase-1-evidence.md) for the full measurements.

Phase 7 is in progress. See [`STATUS.md`](STATUS.md) for implementation
evidence, measured artifacts, and gate history.

## Development

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm e2e
```

The repository has five active packages:

- `packages/extension` — Manifest V3 capture extension.
- `packages/trace` — schema, privacy, locators, clock mapping, coordinates, and
  zoom generation.
- `packages/editor` — local React editor and FFmpeg export pipeline.
- `packages/server` — optional self-hosted public share links.
- `packages/runner` — local `demo.yml` validation, replay, and drift reports.
