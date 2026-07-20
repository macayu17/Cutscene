# Semantic Demo Kit

Date: 2026-07-20
Status: approved direction

## Goal

Make Cutscene's semantic advantage visible in the editor and provide one
primary export that proves it. A user records one DOM workflow and receives a
coherent package containing a rendered video, README GIF, interactive guide,
step documentation, cropped screenshots, and Playwright flow skeleton.

The product promise is:

> Record one real workflow. Cutscene understands every DOM action and produces
> the video, interactive guide, documentation, screenshots, and Playwright flow
> together. When the UI changes, its local runner identifies drift and rebuilds
> the maintained outputs.

## Scope

This work has two connected parts:

1. Reorganize the loaded-recording editor so semantic structure and the demo
   kit are primary, while existing specialist exports remain available.
2. Add one deterministic `Build demo kit` export assembled entirely from the
   current capture, render, documentation, interactive-player, skeleton, and
   ZIP code paths.

The Phase 7 runner remains a local CLI. The browser editor will not claim to run
Playwright or regeneration itself.

## Editor hierarchy

The top bar keeps recording metadata on the left and exposes four controls on
the right:

- `Load recording`
- `Share` using a native `details` menu
- `Export` using a native `details` menu
- `Build demo kit` as the primary action

The two menus contain the existing controls without changing their behavior:

- Share: create link and update shared demo.
- Export: GIF, MP4, interactive demo, 9:16 MP4, step GIFs, Playwright skeleton,
  documentation, screenshots, caption import, SRT, and VTT.

No router, modal system, menu dependency, or new application state is added.
Each native menu opens and closes through its `summary` control.

The left rail heading changes from `EVENTS` to `SEMANTIC TRACE`. Directly under
the heading, a compact summary shows:

- total human events;
- logical step count;
- click targets with a recorded bounding box; and
- generated zoom count.

Each event row retains its time, event type, and privacy-safe accessible name.
For a selected targeted event, a compact detail block shows only structural
metadata already present in memory:

- step ID;
- element role or tag;
- bounding box in CSS pixels; and
- highest-ranked locator type and confidence percentage.

Locator values, input values, target text beyond the existing privacy-safe
label, and raw trace JSON are never displayed in this summary.

Amber remains limited to semantic event ticks, target boxes, and generated zoom
segments. The demo-kit button uses neutral high contrast, not amber.

## Demo-kit archive

`Build demo kit` downloads `<recording-id>-demo-kit.zip` with this exact layout:

```text
index.html
demo.mp4
demo.gif
docs.md
screenshots/<step image files>
playwright.spec.ts
```

- `demo.mp4` is the existing 1920x1080 rendered export with active zooms,
  callouts, redactions, cursor treatment, and brand configuration.
- `demo.gif` is the existing 800px README GIF using one global palette.
- `index.html` is the existing static interactive player. It references the
  root `demo.mp4`, so the same media bytes are stored only once.
- `docs.md` and `screenshots/` come from one shared `renderStepShots` pass.
- `playwright.spec.ts` comes from the existing deterministic skeleton generator.

The archive deliberately excludes the original WebM, raw trace, metadata,
locators, comments, collaboration credentials, and regeneration configuration.
Those are maintenance inputs and may contain internal application structure;
the demo kit is safe to publish. Local regeneration remains documented and
uses the separately retained recording bundle.

## Data flow

The implementation adds one `buildDemoKit` orchestration function in the editor
package. It accepts the same explicit values currently passed by `App` to the
individual exporters rather than reading Zustand itself.

The stages are sequential to bound browser memory:

1. Validate that media, at least one documented target, and at least one
   clickable interactive target exist.
2. Render MP4 once.
3. Render the README GIF.
4. Seek through the loaded video once to render documentation screenshots.
5. Generate the interactive manifest and HTML, Markdown, and Playwright text.
6. Convert blobs to byte arrays, assemble one store-method ZIP, and release the
   intermediate references.

The existing one-pixel export progress line maps these stages across the full
0–100% range. All export controls remain disabled for the duration. The loaded
recording and edit state remain unchanged on success or failure.

## Errors and privacy

Failures name the stage and required action:

- `Demo kit needs at least one clickable target.`
- `Demo kit video export failed: <existing detail>`
- `Demo kit GIF export failed: <existing detail>`
- `Demo kit screenshot export failed: <existing detail>`

No partial ZIP is downloaded. Existing capture-time masking, selector
redactions, privacy-safe target labels, HTML script escaping, and rendered
redaction behavior are reused unchanged.

## Accessibility

- `Build demo kit`, Share, and Export are keyboard operable.
- Native `details`/`summary` provide menu disclosure without JavaScript focus
  management.
- Existing visible focus styles remain on every action.
- Semantic summary text is available to assistive technology and does not rely
  on colour.
- Export errors remain programmatic outputs, and the progress line receives a
  text status for assistive technology.

## Verification gate

The feature is complete only when all of the following pass:

1. A unit test opens the ZIP directory and verifies the six required artifact
   groups and the absence of trace, locator, comment, and raw-value payloads.
2. The MP4 and GIF signatures, interactive manifest, Markdown step count,
   screenshot count, and Playwright action count match their existing standalone
   exporters for the same fixture.
3. Chromium builds a kit from a real TodoMVC recording, extracts it with native
   Windows `Expand-Archive`, loads `index.html`, and completes every hotspot.
4. The editor screenshot shows the semantic summary, selected-event structural
   detail, compact Share/Export menus, and primary demo-kit action without
   horizontal overflow at 1440x900.
5. Repository tests, typechecks, production builds, and all Chromium E2E flows
   pass locally.

Measured archive size, artifact counts, browser errors, and hotspot alignment
are reported before the feature is called complete.

## Explicitly deferred

No in-browser Playwright execution, regeneration server, GitHub Actions setup,
hosted backend, billing, GPT API, AI voice, translation, OCR, canvas inference,
native capture, branching interactive flows, or new dependency is included.
