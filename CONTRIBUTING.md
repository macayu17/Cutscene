# Contributing

## Before you write code

Read [`AGENTS.md`](AGENTS.md). It is written for coding agents but the rules are
the project's rules: phases are gated, `STATUS.md` records what is authorised,
and the trace format in [`PRD.md`](PRD.md) is captured in full even where nothing
reads it yet.

The design brief in `AGENTS.md` section 6 is binding for anything visual. Amber
is spent only on things the machine semantically understands.

## Running it

```sh
pnpm install
pnpm build
```

Load `packages/extension/dist` as an unpacked extension in Chrome, record a tab,
and the editor opens with the recording loaded.

## Verification

Everything must pass before a change lands:

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm e2e
```

`pnpm e2e` includes the extension capture suite, which drives a headed Chrome
against a third-party site. CI runs everything except that suite, so run it
locally before proposing a change to capture.

## What a good change looks like

- A number, not an adjective. If you claim a behaviour improved, say by how much
  and how it was measured. `STATUS.md` is the record of those numbers.
- One runnable check per non-trivial behaviour. Vitest for units, Playwright for
  anything that needs a browser.
- No new runtime dependency without a justification in the pull request. Every
  dependency in the extension costs bundle size and a store review.
- TypeScript strict, no `any`, no default exports outside React components.
- Comments explain why, never what.

## Reporting a problem

Open an issue with the page you recorded, what you expected, and what happened.
A `trace.jsonl` helps enormously — check it for anything private first; input
values are masked at capture, but URLs and accessible names are not.

Security problems go to [`SECURITY.md`](SECURITY.md) instead, never to an issue.
