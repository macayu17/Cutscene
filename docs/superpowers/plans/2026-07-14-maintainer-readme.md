# Maintainer-first README Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a factual maintainer-facing README led by the real element-locked zoom comparison.

**Architecture:** Track one optimized GIF under `docs/assets` so GitHub renders the comparison inline. Keep all explanation in the root `README.md`, using only current commands, measured evidence, and implemented Phase 1 behavior.

**Tech Stack:** Markdown, FFmpeg, pnpm

---

### Task 1: Track the comparison

**Files:**
- Create: `docs/assets/element-locked-comparison.gif`

- [ ] **Step 1: Create one GitHub-renderable GIF from the measured comparison video**

```powershell
New-Item -ItemType Directory -Force docs/assets | Out-Null
ffmpeg -y -i artifacts/side-by-side-v2.mp4 -filter_complex "[0:v]fps=12,scale=1000:-2:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle" -loop 0 docs/assets/element-locked-comparison.gif
```

- [ ] **Step 2: Verify the asset**

```powershell
ffprobe -v error -show_entries stream=width,height,r_frame_rate:format=duration,size -of default=noprint_wrappers=1 docs/assets/element-locked-comparison.gif
```

Expected: `1000x282`, `12 fps`, about `6.25s`, and a file small enough for normal GitHub rendering.

### Task 2: Write the README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Add the approved maintainer-first content**

```markdown
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
- Recordings stay local. There is no hosted service, account system, or backend.

## What works today

- Tab video capture with optional microphone audio.
- A versioned JSONL trace containing clicks, inputs, navigation, scrolling,
  viewport changes, ranked locators, element bounds, and clock-sync markers.
- Capture-time masking for input values and sensitive elements.
- A local editor with an event list and trace lane. Hover a tick to inspect its
  recorded element; click it to seek.
- Automatic element-locked zooms with manual add, delete, retime, and retarget
  controls.
- README GIF export with one global palette, plus 1080p H.264 MP4 export.

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

## Record and edit

1. Open a DOM-based page in Chrome.
2. Open the Cutscene extension and start recording. Microphone capture is
   optional.
3. Stop recording. Chrome downloads `media.webm`, `trace.jsonl`, and `meta.json`
   into one `cutscene-<recording-id>` folder.
4. Choose that folder in the editor.
5. Inspect the trace, adjust zoom segments, then export a GIF or MP4.

## Measured result

The Phase 1 acceptance run recorded 60.1459 seconds with 15 clicks. Ten sampled
zooms landed on the correct element; mean timing error was 0.258 frame and the
maximum was 0.422 frame. The 800x450 README GIF was 2,352,555 bytes at 15 fps.
See [the evidence report](docs/phase-1-evidence.md) for the full measurements.

Phase 1 passed. Phase 2's external-PR experiment was waived by an explicit
owner decision because of contributor-account risk. Phase 3 is authorized but
not implemented.

## Development

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm e2e
```

The repository has three active packages:

- `packages/extension` — Manifest V3 capture extension.
- `packages/trace` — schema, privacy, locators, clock mapping, coordinates, and
  zoom generation.
- `packages/editor` — local React editor and FFmpeg export pipeline.

`packages/spike` is retained only as Phase 0 evidence and is not active product
code.
```

### Task 3: Verify the README against the repository

**Files:**
- Verify: `README.md`
- Verify: `docs/assets/element-locked-comparison.gif`

- [ ] **Step 1: Verify every documented repository command**

```powershell
pnpm test
pnpm typecheck
pnpm build
pnpm e2e
```

Expected: all commands exit `0`.

- [ ] **Step 2: Verify prose and paths**

```powershell
rg "Limitations|What works today|Run locally|Measured result" README.md
Test-Path docs/assets/element-locked-comparison.gif
git diff --check
```

Expected: all four headings are found, the asset check prints `True`, and the diff check is silent.

### Task 4: Version the README

**Files:**
- Add: `README.md`
- Add: `docs/assets/element-locked-comparison.gif`

- [ ] **Step 1: Commit and push**

```powershell
git add README.md docs/assets/element-locked-comparison.gif
git commit -m "docs: add maintainer-first README"
git push
```
