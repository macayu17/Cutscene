# Phase 7 Local Regeneration Design

> Historical dry-run slice. The completed local regeneration contract is in
> [2026-07-17-phase7-local-regeneration-completion-design.md](2026-07-17-phase7-local-regeneration-completion-design.md).

## Goal

Build the smallest honest Phase 7 slice: a local command that reads `demo.yml`,
replays a recorded flow with ranked locators, and writes deterministic drift
reports. It does not use hosted CI or open pull requests.

## Scope

The command supports the version 1 `demo.yml` shape from `PRD.md`, including
multiple demos, an optional seed command, a base URL, a reference trace, and the
declared output list. This slice runs in `--dry-run` mode, so it validates but
does not render the declared GIF, MP4, or documentation outputs.

Masked input values are supplied by step ID and may reference environment
variables:

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

Only an entire scalar may be an environment reference. Missing variables fail
validation before the seed command or browser starts. Resolved input values are
kept in memory and are never written to the report or trace.

## Architecture

`packages/runner` is a Node command-line package. It owns filesystem access,
YAML parsing, the seed subprocess, and Playwright. Pure replay planning and
drift-report types live in `packages/trace`, where they can be tested without a
browser and reused by later CI work.

The command is `cutscene-regenerate --config demo.yml --dry-run`, with an
optional `--demo <id>` filter. Relative trace and report paths resolve from the
directory containing `demo.yml`. Declared output paths are validated but are
not used in a dry run. The seed command also runs beside `demo.yml`.

The runner directly consumes parsed trace events. It does not generate and then
parse a Playwright test. Direct execution keeps locator fallbacks and failure
reasons structured.

The only new external parser is `yaml`. Playwright is already present in the
workspace; the runner declares it directly so runtime resolution is explicit.
Neither dependency enters the extension bundle.

## Replay planning

Actionable trace events are `interaction.click` and `interaction.input` events.
Events are grouped by `stepId` in trace order. An event without a target is kept
and becomes orphaned during locator resolution.

- A checkbox or radio click ignores the paired input event emitted by the
  browser.
- Repeated inputs for one target collapse to the last sample. A configured
  value for the step overrides the captured value.
- A non-checkbox input and click in the same step keep their recorded order.
- A masked input without a configured value is a configuration error.
- Multiple distinct input targets in one step are unreplayable and fail before
  browser launch.
- A recorded `interaction.keypress` is unsupported because the version 1 event
  carries no key value. A keyboard action omitted during capture can make a
  later locator orphaned. In either case the runner reports what it knows and
  never invents the missing action.

The optional seed command is the supported way to establish server-side fixture
state before replay. It runs only after configuration and trace validation.

## Locator resolution and classification

For each planned action, locators are attempted in their recorded order. A
locator succeeds only when it resolves exactly one visible element.

- `matched`: the first ranked locator resolves and the action completes.
- `drifted`: a later locator resolves and the action completes.
- `orphaned`: no locator resolves.

An action failure after resolution is recorded as `orphaned` with a technical
reason, then replay stops. Later steps are not classified. The report includes
`plannedSteps`, `evaluatedSteps`, and `abortedAfterStepId`, so an incomplete run
cannot resemble a complete drift scan.

## Outputs and exit codes

Each demo writes:

```text
.cutscene/reports/<demo-id>/drift-report.json
.cutscene/reports/<demo-id>/drift-report.txt
```

The JSON report is versioned with `v: 1` and contains the demo ID, source trace,
base URL, per-step status, the chosen locator tier for each action, and aggregate
counts. The text report follows the compact matched/drifted/orphaned
presentation in `PRD.md`.
Neither report contains resolved input values.

Exit codes are:

- `0`: every planned step was evaluated and matched.
- `1`: at least one step drifted or orphaned.
- `2`: invalid configuration, missing environment value, invalid trace,
  unsupported replay plan, seed failure, browser failure, or report write
  failure.

Each report file is written through a sibling temporary file and rename. The
versioned JSON report is written last and is the authoritative completion
record, so a failed run cannot leave a partial result that looks successful to
automation.

## Errors

Errors state the demo and step involved and what the user must change. Expected
failures are returned as discriminated values inside the replay pipeline. The
CLI is the only boundary that converts them to stderr and an exit code.

The seed command is trusted repository configuration, like an npm script. The
runner executes it only after an explicit local CLI invocation; it does not run
configuration fetched from a remote repository.

## Verification

Unit tests cover strict config parsing, environment resolution, secret
non-disclosure, replay grouping, unsupported steps, locator classification,
stable report formatting, and exit-code selection.

A Playwright test uses a local fixture page to prove all three locator outcomes
and action execution without network access. A separate live TodoMVC dry-run
uses a clean reference trace to demonstrate honest failure reporting. Replay
fills the TodoMVC input through its first-ranked test ID, then stops at the first
checkbox because the source trace did not capture the Enter key that created
the row. The runner does not invent that missing keyboard action.

## Deferred work

Fresh trace capture, screenshot comparison, artifact rendering, staleness by Git
commit, GitHub Actions, paid CI, automatic pull requests, and auto-merge are
separate Phase 7 slices. None is scaffolded in this slice.
