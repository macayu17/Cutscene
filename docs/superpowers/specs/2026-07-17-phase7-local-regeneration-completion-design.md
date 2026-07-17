# Phase 7 Local Regeneration Completion

## Goal

Complete the Phase 7 regeneration loop locally. A successful non-dry run must
replay a stored trace, capture fresh pixels and a fresh privacy-safe trace,
compare the traces, and replace every declared GIF, MP4, and documentation
output. Hosted CI, pull requests, and auto-merge are optional integrations and
are not part of the local exit gate.

## Exit gate

Phase 7 passes when a real `demo.yml` regeneration produces:

- a playable fresh WebM and valid version 1 metadata and trace files;
- a semantic trace diff;
- every declared GIF, MP4, and documentation output;
- zero drifted or orphaned replay steps;
- zero captured printable keys and zero configured input values in traces,
  reports, or generated documentation;
- a staleness result when route-relevant paths are configured.

The generated files must be measured and the repository test, typecheck, build,
and Chromium end-to-end gates must pass. `STATUS.md` may advance to Phase 8 only
after this evidence is recorded.

## Command and configuration

The existing command keeps `--dry-run` as the validation and locator-check mode:

```text
cutscene-regenerate --config demo.yml --dry-run
```

Omitting `--dry-run` performs full regeneration:

```text
cutscene-regenerate --config demo.yml
```

The Phase 7 schema remains backward compatible. Two optional fields describe
staleness without guessing which source files implement a route:

```yaml
version: 1
demos:
  - id: analytics-overview
    trace: .cutscene/analytics-overview.trace.jsonl
    baseUrl: ${{ env.PREVIEW_URL }}
    seed: pnpm run seed:demo
    inputs:
      step_0001: ${{ env.DEMO_TITLE }}
    watch:
      - packages/app/src/routes/analytics/**
    staleAfterCommits: 10
    outputs:
      - type: gif
        path: docs/assets/analytics.gif
        width: 800
      - type: mp4
        path: docs/assets/analytics.mp4
      - type: docs
        path: docs/guides/analytics.md
```

`watch` and `staleAfterCommits` must either both be present or both be absent.
Paths are repository-relative Git pathspecs. The threshold is a positive
integer. Existing configs without these fields remain valid and report
staleness as unavailable.

Output paths resolve from the directory containing `demo.yml` and must remain
inside that directory. Full regeneration refuses to overwrite an output until
all replay, capture, diff, and render work has succeeded.

## Replay and fresh capture

The runner keeps the existing ranked-locator replay. A full run creates a
Playwright context with video recording enabled before navigation. The runner
uses the first recorded viewport as the initial viewport and applies recorded
viewport and scroll context before each replay action.

Each successfully resolved action produces a fresh trace event at execution
time. The event uses the current route, viewport, scroll position, live bounding
box, and the surviving suffix of the original ranked locator list beginning at
the locator that resolved. This honestly removes failed higher-ranked locators
without inventing new semantic locators.

The fresh trace also contains recording start and stop events, navigation and
viewport changes observed by the runner, and start/end clock markers. Runner
elapsed time and recorded media time share one monotonic origin, so the clock
fit remains explicit. Replay retains the recorded delays between actionable
events, with no artificial animation timing.

Input and keypress targets always serialize `value: "[MASKED]"`. Only Enter is
captured as a keypress. Resolved input overrides stay in memory and never enter
the fresh trace or generated artifacts.

The fresh bundle is written atomically under:

```text
.cutscene/runs/<demo-id>/media.webm
.cutscene/runs/<demo-id>/trace.jsonl
.cutscene/runs/<demo-id>/meta.json
```

The video element in the headless export page supplies the final encoded width,
height, and duration before metadata is committed.

## Trace diff and staleness

The semantic diff compares replayable actions by `stepId` and action order. It
reports unchanged, changed, added, and removed actions. A changed action records
only structural reasons: action kind, route, semantic label, first locator, or
geometry. It never includes input values.

The version 1 JSON and compact text files are written beside the drift report:

```text
.cutscene/reports/<demo-id>/trace-diff.json
.cutscene/reports/<demo-id>/trace-diff.txt
.cutscene/reports/<demo-id>/staleness.json
```

Staleness uses Git only. The baseline is the most recent commit containing the
configured reference trace. The runner counts later commits that touch any
configured `watch` pathspec. The demo is stale when that count exceeds
`staleAfterCommits`. An untracked trace or non-Git directory produces an
explicit unavailable result rather than a guessed status.

## Rendering

Rendering reuses the editor rather than adding a second codec pipeline. Vite
builds a small `automation.html` entry beside the normal editor. The runner
serves the built editor and fresh bundle through a loopback-only native Node
HTTP server, then drives the page with Playwright.

The automation entry calls the existing `exportRecording`, automatic zoom,
clock fitting, and step-shot functions:

- GIF uses the existing global-palette FFmpeg.wasm path and honours configured
  width while preserving aspect ratio.
- MP4 uses the existing FFmpeg.wasm MP4 path.
- Documentation uses the existing DOM-derived action copy and 2x cropped PNG
  screenshots. Screenshots are written beside the Markdown under a
  `screenshots` directory, matching existing Markdown links.

Binary video outputs are transferred as browser downloads. Markdown and PNG
step shots are returned directly to the runner. No native FFmpeg process, new
codec dependency, generated Playwright test, or editor UI clicking is added.

All declared outputs render to sibling temporary paths first. They replace
their destinations only after every output has rendered successfully. A
rendering failure leaves existing repository assets untouched.

## Errors and exit codes

- Exit 0: every step matched, fresh capture and trace diff succeeded, and all
  declared outputs were replaced.
- Exit 1: any step drifted or became orphaned. Reports are written, but fresh
  assets do not replace declared outputs.
- Exit 2: configuration, seed, capture, metadata, diff, staleness, rendering,
  or filesystem work failed.

Dry-run behavior and exit codes stay unchanged. Errors name the demo and failed
stage. Expected pipeline failures remain discriminated result values; only the
CLI writes stderr and sets the process exit code.

## Verification

Unit tests cover config compatibility and staleness fields, privacy-safe fresh
events, trace diff classifications, Git staleness, path containment, atomic
output replacement, and command modes.

Browser tests prove live geometry capture, WebM playback, editor-bridge GIF and
MP4 rendering, documentation screenshots, and failure preservation. The final
real TodoMVC run declares all three output types and must report all steps
matched through first-ranked locators, zero privacy leaks, valid media probes,
and non-empty generated artifacts.

## Not implemented

Hosted CI, automatic pull requests, and auto-merge are not scaffolded. They can
later call the same local command without changing its trace, diff, or rendering
contracts.
