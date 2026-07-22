# Changelog

Versions refer to the Chrome extension. The editor, trace library, server and
runner ship from the same commit.

## 0.2.0 — unreleased

Phase 10: the regeneration story, installable.

- `@cutscene/trace`, `@cutscene/editor` and `@cutscene/runner` publish to npm.
  `npx cutscene-regenerate --config demo.yml --dry-run` needs no clone.
- A packaged GitHub Action runs the same check and comments the report on the
  pull request that would break the demo.
- Rendering without the editor installed names the fix instead of failing on a
  resolved path. A drift-only install no longer pulls the render pipeline.
- Continuous integration, contributor and security documents, issue and pull
  request templates.

Phase 9: a first run that needs no terminal.

- The editor ships inside the extension. Stopping a recording opens it with that
  recording already loaded, read from IndexedDB on the extension's own origin.
- The editor lists the last five recordings the extension holds, and can open or
  delete each one. Older recordings are evicted.
- A recording is flushed to IndexedDB every fifteen seconds, so a crashed
  service worker or a closed browser no longer loses the whole take.
- ffmpeg's core is served from the extension's own origin instead of a CDN, which
  an extension page's CSP forbids.
- Icon set, recording badge on the toolbar icon, elapsed time in the popup, and a
  warning past ten minutes.
- A privacy policy stating what is recorded, what is masked before it is written,
  where it is stored, and what leaves the machine.

## 0.1.0 — 2026-07-18

Phases 0 through 8, built as gated milestones. See `STATUS.md` for the measured
exit criteria of each and `PRD.md` for what each phase was allowed to contain.

- Tab capture with a versioned JSONL trace: clicks, inputs, navigation,
  scrolling, viewport changes, ranked locators, element bounds and clock sync.
- Element-locked zooms, callouts, selector blur tracks, cursor treatment and
  brand presets.
- GIF, 1080p MP4, 9:16 MP4, step GIFs, documentation, screenshots, a Playwright
  skeleton, captions and a linear interactive click-through.
- A trace-derived quality report, drift detection, and `--heal`.
- Local demo regeneration against a current build.
- An optional self-hosted share server.
