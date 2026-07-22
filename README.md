# Cutscene

Cutscene records a Chrome tab and the DOM events behind it. The editor uses
recorded element bounds to frame clicks instead of guessing from cursor
coordinates.

**[Click through a live demo](https://cutscene-editor-sandy.vercel.app/demo)**
· [what it is](https://cutscene-editor-sandy.vercel.app)

The demo is a static file exported by the editor from the recording below. It
pauses the video at every recorded click and waits for you to hit the real
element. No install and no account.

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
  server has public UUID links only; it has no accounts or private links. What
  is recorded and what leaves the machine is stated in the
  [privacy policy](site/privacy/index.html).

## What works today

- Tab video capture with optional microphone audio. Stopping a recording opens
  the editor with it already loaded; the extension keeps the five most recent
  recordings and flushes the take to storage while it runs, so an interrupted
  recording is openable instead of lost.
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
- Linear interactive-demo export that pauses the rendered video at every
  recorded click and continues through element-aligned hotspots.
- Step documentation, cropped screenshots, per-step GIFs, a Playwright flow
  skeleton, and imported SRT/VTT captions.
- A recording quality report derived from the trace alone: interactions on
  elements with no accessible name or role, and steps whose strongest locator
  is one an ordinary edit breaks.
- A minimal filesystem-backed server for uploading a bundle and sharing its
  video through a public link.
- Local demo regeneration that replays ranked locators, records fresh pixels
  and trace data, compares the trace, and rebuilds GIF, MP4, and documentation
  outputs without opening a pull request.

## Run locally

You need Chrome, Node.js, and pnpm 11.6.0.

```sh
pnpm install
pnpm build
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**,
and select `packages/extension/dist`.

The editor ships inside the extension, so recording a tab opens it directly.
To run the editor as a standalone page instead — for recordings you already
have on disk:

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
The editor uploads the original three files and shows the public link and the
date it expires.

Before pointing anything public at it, know what it does and does not do. A
share link is public and unguessable; there are no accounts and no private
links. Recordings are deleted after their retention window, whether or not the
sweep has run. The owner token can delete a recording immediately with
`DELETE /api/recordings/<id>`. Writes are rate limited per address and the
server refuses new recordings once its store is full.

| Variable | Default | Meaning |
| --- | --- | --- |
| `CUTSCENE_DATA` | `data` | Where bundles are stored. |
| `PORT` | `4180` | Listening port. |
| `CUTSCENE_RETENTION_DAYS` | `30` | Days before a recording expires and is swept. |
| `CUTSCENE_STORE_LIMIT_BYTES` | 20 GiB | Refuse new recordings past this total. |
| `CUTSCENE_WRITE_BURST` | `20` | Writes one address may make at once. |
| `CUTSCENE_WRITE_PER_MINUTE` | `20` | Sustained write rate per address. |
| `CUTSCENE_TRUST_PROXY` | unset | Set to `1` only behind a proxy you control, so `X-Forwarded-For` is believed. |

## Check a recorded flow against a current build

Install the runner where the check should happen. Drift checks need only the
runner and a browser; rebuilding GIF, MP4 or documentation also needs the
editor, which carries the render pipeline.

```sh
npm install --save-dev @cutscene/runner @playwright/test
npx playwright install chromium
npx cutscene-regenerate --config demo.yml --dry-run

npm install --save-dev @cutscene/editor   # only if you rebuild outputs
```

Node 22.18 or newer. In GitHub Actions, the packaged action does the same thing
and comments the report on the pull request:

```yaml
- uses: macayu17/Cutscene@main
  with:
    config: demo.yml
    dry-run: true
```

The step fails when a demo drifts, exactly as a failing test does. Add
`heal: true` to promote the locator that actually resolved instead.

The runner validates `demo.yml`, optionally runs a seed command, and
replays the stored trace in Chromium. A normal run records a fresh WebM and
trace, compares the semantic actions, and rebuilds every declared output. Add
`--dry-run` to check locator drift without recording or rendering.

```yaml
version: 1
demos:
  - id: todo-flow
    trace: .cutscene/todo-flow.trace.jsonl
    baseUrl: ${{ env.PREVIEW_URL }}
    seed: pnpm run seed:demo
    inputs:
      step_0001: ${{ env.DEMO_TODO }}
    watch:
      - packages/app/src/routes/reports/**
    staleAfterCommits: 10
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

Remove `--dry-run` to rebuild the declared outputs. Add `--demo todo-flow` to
run one configured demo. Fresh bundles are written under
`.cutscene/runs/<demo-id>/`; drift, trace-diff, and staleness reports are under
`.cutscene/reports/<demo-id>/`. `watch` and `staleAfterCommits` are optional,
but must be provided together.

- Exit `0`: every planned step matched; a normal run also wrote the fresh
  bundle, reports, and all declared outputs.
- Exit `1`: at least one step drifted, became orphaned, or was not evaluated;
  a normal run leaves the declared outputs unchanged.
- Exit `2`: configuration, seed, capture, report, or rendering failed.

### Repair recoverable drift

A step drifts when its strongest locator stops resolving but a lower-ranked one
still finds the element. Add `--heal` to promote the locator that actually
resolved and write the trace back, so the next run matches instead of drifting
again.

```powershell
pnpm --filter @cutscene/runner regenerate -- --config demo.yml --dry-run --heal
```

Healing never invents a locator. An orphaned step has nothing left to promote,
so it stays orphaned and the run still exits `1`. `--heal` repairs what is
recoverable and refuses to hide what is not.

Version 1 records and replays only `Enter`. Printable keys, modifiers, and all
other control keys are omitted. A step with more than one recorded Enter is
rejected as ambiguous instead of guessing an action sequence.

## Record and edit

1. Open a DOM-based page in Chrome.
2. Open the Cutscene extension. Add any CSS selectors that must be visually
   blurred, then start recording. Microphone capture is optional.
3. Stop recording. The editor opens in a new tab with that recording already
   loaded. Chrome also downloads `media.webm`, `trace.jsonl`, and `meta.json`
   into one `cutscene-<recording-id>` folder.
4. Open the extension's editor at any time to pick from the last five
   recordings it still holds, or choose a downloaded folder in a browser tab
   running the editor.
5. Inspect the trace, adjust the edit, then export video, an interactive demo,
   documentation, screenshots, step GIFs, a Playwright skeleton, or captions.
   Extract an interactive ZIP and keep `index.html` beside `demo.mp4`; open the
   HTML file to run the click-through locally.
6. To share the recording, start the optional server and choose **Create share
   link** in the editor.

## Measured result

The Phase 1 acceptance run recorded 60.1459 seconds with 15 clicks. Ten sampled
zooms landed on the correct element; mean timing error was 0.258 frame and the
maximum was 0.422 frame. The 800×450 README GIF was 2,352,555 bytes at 15fps.
See [the evidence report](docs/phase-1-evidence.md) for the full measurements.

Phase 7 is complete locally. See [`STATUS.md`](STATUS.md) for the measured
TodoMVC regeneration and full verification record. Phase 8's linear interactive
demo is implemented; the unrelated long-tail items remain deferred.

## How Codex and GPT-5.6 were used

Cutscene was built with Codex CLI running `gpt-5.6-sol` at high reasoning
effort. Codex wrote the implementation; the phase gates, the schema decisions,
and every acceptance number were owner-reviewed before a phase advanced.

The working method was constraint, not prompting. [`PRD.md`](PRD.md) defines the
whole product as eight gated phases with measurable exit criteria.
[`AGENTS.md`](AGENTS.md) makes those gates binding: a phase may not begin until
the previous phase's numbers are reported in [`STATUS.md`](STATUS.md), and Phase
0 is allowed to fail. Given "build the recorder", a capable agent builds all
eight phases badly. Given "Phase 0 exit criteria are these three numbers, and
you may not proceed until you report them", it builds one phase well and stops.

Where GPT-5.6's reasoning did the load-bearing work:

- **Ranked locator generation and drift detection** in `packages/trace` — the
  ranking strategy and the rule that a drifted or orphaned step exits `1` rather
  than clicking the wrong element.
- **Clock alignment** between the video clock and the DOM event clock, measured
  down to a 0.258-frame mean error across ten sampled zooms.
- **The privacy boundary on the interactive export** — reducing the shipped
  manifest to `v`, `recordingId`, `width`, `height`, `steps`, then verifying zero
  locators, zero raw trace, and zero input values in `index.html`.
- **The `demo.yml` replay and trace-diff runner** in `packages/runner`.

Codex also ran the verification loop it was measured against: 327 unit tests,
5/5 typecheck, production builds, and 6/6 Chromium E2E, all local. No pull
request, hosted CI, paid credit, or subagent was used at any point.

Design and plan documents for each slice are under
[`docs/superpowers/`](docs/superpowers/), written before the corresponding
implementation.

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

## License

Cutscene's own source is MIT, as stated in [`LICENSE`](LICENSE).

The built extension package additionally bundles [`@ffmpeg/core`
0.12.10](https://github.com/ffmpegwasm/ffmpeg.wasm), which is licensed
GPL-2.0-or-later because it includes x264 for H.264 export. An extension page
may not load that core from a CDN or a `blob:` URL, so it is served from the
extension's own origin and therefore distributed with it. The distributed
package is a combined work and carries GPL terms; Cutscene's own source remains
MIT and is available in this repository, which is where the corresponding
source for the bundled core is also linked from. Building the editor without
H.264 export removes that dependency.
