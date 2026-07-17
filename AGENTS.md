# AGENTS.md

Instructions for any coding agent working in this repository. Read this fully before writing code. Read `PRD.md` too. Where they conflict, `PRD.md` wins on what to build and this file wins on how.

---

## 1. Ground rules

**`PRD.md` contains the whole product, in phases. It is not a backlog.** Phases 3 through 8 are documented so the data model is designed for them. They are not authorisation to build them. If you find yourself writing a permissions model, a comments feature, a backend or a `demo.yml` parser, you have jumped ahead by years of work. Stop.

**Phases are gated.** A phase begins only when the previous phase's exit criteria in `PRD.md` are met and reported. The current phase is recorded in `STATUS.md` at the repo root. Read it before you start. If it says Phase 0, you may only write Phase 0 code.

**Phase 7 is completed locally.** Its gate is the measured normal regeneration
in `PRD.md` §13. Do not open a pull request, spend hosted CI credits, or enable
auto-merge to satisfy it. Those integrations require separate, explicit owner
authorisation.

**Phase 0 is blocking and may fail.** If the spike does not meet its exit criteria, report the measured numbers and stop. Do not paper over a mis-anchored bounding box with a heuristic offset and continue. A spike that "runs" while silently mis-anchoring is the worst possible outcome.

**Capture everything, build almost nothing.** The trace format in `PRD.md` §3 is implemented in full during Phase 1, including every field that only Phases 4, 6 and 7 read: `stepId`, ranked `locators`, `scroll`, `app`. Phase 1 code uses almost none of them. Capture them anyway. A field not captured forces every existing user to re-record.

**Ask before inventing.** If a decision is not specified here or in the PRD and it is load-bearing (a schema field, a clock strategy, an export codec), ask. If it is not load-bearing (a variable name, a file split), just decide.

**Do not add dependencies casually.** Every dependency in a browser extension costs bundle size and a permissions review. Justify each one in the PR description.

---

## 2. Stack

Fixed. Do not substitute.

- **Extension:** Manifest V3, TypeScript, Vite (`@crxjs/vite-plugin`)
- **Capture:** `chrome.tabCapture` for video, `MediaRecorder` for encoding, content script for the trace
- **Editor:** React + TypeScript + Vite, single page, no router
- **Rendering and export:** `ffmpeg.wasm`
- **State:** Zustand. Not Redux. Not context-as-state.
- **Styling:** plain CSS with custom properties in a single tokens file. No Tailwind, no CSS-in-JS, no component library.
- **Testing:** Vitest for units, Playwright for the capture end-to-end
- **Package manager:** pnpm

No backend. No database. No auth. Recordings live in IndexedDB and on the user's disk.

## 3. Repository layout

```
packages/
  extension/        MV3 extension: service worker, content script, capture
  trace/            shared: schema types, locator generation, clock model
  editor/           React editor and export pipeline
  spike/            Milestone 0 only. Delete once Milestone 1 lands.
```

`packages/trace` is the heart of the project. It has no DOM dependencies at its core, it is fully unit tested, and both the extension and the editor import from it. Locator ranking and clock mapping live here and nowhere else.

## 4. Code conventions

- TypeScript strict. No `any`. No non-null assertions without a comment saying why.
- Comments only where the *why* is non-obvious. Do not narrate the code. `// increment counter` is noise; `// bayer dither: floyd-steinberg shimmers on flat UI fills` is worth its line.
- No default exports except for React components.
- Errors are values in the trace pipeline. Do not throw across the extension message boundary; return a discriminated union.
- Every schema type in `packages/trace` carries `v: 1`. Write the version field before you write anything else.
- Do not write a class where a function will do.

## 5. Things that will silently ruin this project

Take these seriously. They are the actual engineering risk.

**Clock drift.** Three clocks (`MediaRecorder` media time, content script `performance.now()`, service worker `Date.now()`) start at different moments and diverge. Do not assume any two are equal. Implement the sync-marker approach in `PRD.md` §8 and build the media-time mapping by linear fit across markers. If zooms land visibly late, this is why.

**Bounding boxes in the wrong coordinate space.** `getBoundingClientRect()` is viewport-relative in CSS pixels. The captured video is in device pixels at the tab's capture resolution, which may not equal `window.innerWidth * dpr`. Establish the transform once, from a known reference, and test it. Do not scatter conversions across the codebase.

**Scroll invalidates boxes.** A box captured at t=4000 is wrong at t=6000 if the page scrolled between. Record scroll offsets and either recompute or explicitly mark stale boxes. Never render a stale box.

**Masked data leaking into the trace.** Masking is applied at event construction, inside `packages/trace`, before the event is ever serialised. There must be no code path where a raw password or a raw input value is written to `trace.jsonl` and stripped later. Write a test that asserts this.

**GIF palette shimmer.** Per-frame palettes make flat UI backgrounds crawl. Use one global palette for the clip.

---

## 6. Design brief for the editor

The instruction "do not make an AI slop frontend" is taken literally here. This section is binding.

### What to avoid, specifically

Do not produce any of these. They are the current defaults and they are recognisable on sight:

- Cream or off-white background (`#F4F1EA` family) with a high-contrast serif display and a terracotta or clay accent (`#D97757` family)
- Near-black background with a single acid-green or vermilion accent
- Broadsheet layout: hairline rules, zero border radius, dense newspaper columns
- Purple-to-blue gradients, anywhere, for any reason
- Glassmorphism, frosted panels, `backdrop-filter` blur as decoration
- Rounded cards floating on a background with a soft shadow
- Inter as the interface face
- Large centred hero text with a subheading in muted grey
- Emoji as iconography
- Lucide icons used decoratively next to every label

If a decision could have been made identically for a CRM, a fitness app or a note taker, it is the wrong decision for this project.

### The subject

This is an instrument, not an app. Its closest relatives are an oscilloscope, a logic analyser, a waveform editor and the browser devtools performance panel. It exists to show a person a structured signal that was hiding inside something they thought was just pixels.

The design should feel like a measurement device: dense, quiet, precise, unglamorous, and confident that the user is technical.

### Palette

Dark, because the video is the subject and a bright surround competes with it. Cold graphite rather than black.

```css
--bg:        #16181C;  /* base */
--surface:   #1E2126;  /* raised: panels, timeline */
--line:      #2C3037;  /* hairlines, dividers */
--text:      #C8CDD4;  /* primary */
--text-dim:  #727A85;  /* labels, units, metadata */
--signal:    #F2A63B;  /* amber. see rule below */
--danger:    #C7524B;  /* destructive only */
```

**The signal rule, which is the whole idea of the design:** amber is used *only* for things the machine semantically understands. The bounding box overlay on the video. The event ticks in the trace lane. The generated zoom segments. Nothing else on screen is ever coloured. Buttons are not amber. Links are not amber. The logo is not amber.

The result is that a user watching a recording sees a grey video with amber outlines snapping onto real UI elements, and they understand the product without reading a word. Colour carries meaning here. Spend it nowhere else.

### Type

The entire interface is set in **IBM Plex Mono**. Not just the code and the numbers. The buttons, the labels, the menus, all of it.

This is the one real risk in the design and it is justified: the product's claim is that a recording is structured data, not pixels. A monospaced interface asserts that claim on every screen. It also puts the design a long way from every other video tool, which are all set in a friendly grotesk.

**IBM Plex Sans** appears only in prose: the empty state, error explanations, the onboarding line. Sans is for talking to the human, mono is for showing them the machine.

Type scale, tight and small. This is a dense tool, not a marketing page:

```css
--t-xs: 11px;  /* units, timecodes, tick labels */
--t-sm: 12px;  /* labels, buttons, most of the UI */
--t-md: 13px;  /* default body */
--t-lg: 16px;  /* panel headings, used sparingly */
```

Tracking slightly positive on the small mono sizes. Line height 1.4 in the interface, 1.6 in prose.

### Layout

Three regions. No sidebar shell with icon rail. No cards.

```
┌───────────────────────────────────────────────────────────────┐
│  rec_01H8… · app.example.com · 1440×900 · 61.3s      [export] │  32px bar
├────────────────────┬──────────────────────────────────────────┤
│                    │                                          │
│   EVENTS           │              VIDEO                       │
│                    │      amber bbox overlay drawn here       │
│   00:01.2  click   │                                          │
│   ▸ Create report  │                                          │
│   00:04.2  click   │                                          │
│     Save draft     │                                          │
│   00:06.0  route   │                                          │
│     /reports/new   │                                          │
│                    │                                          │
│   240px            │                                          │
├────────────────────┴──────────────────────────────────────────┤
│  ▁▂▅▇▅▂▁▂▇▅▂▁  waveform                                       │
│  ──┼─────┼──────────┼───────┼──────────  trace lane           │  the signature
│    ▭▭▭▭▭▭▭         ▭▭▭▭▭▭▭▭▭▭            zoom segments        │
└───────────────────────────────────────────────────────────────┘
```

**The signature element is the trace lane.** A dense horizontal band beneath the scrubber where every captured event is a tick mark. Hovering a tick draws that event's recorded bounding box on the video, in amber, at that moment. Clicking it seeks there.

That single interaction is the product. Build it first, build it well, and let the rest of the interface be quiet around it.

### Motion

Almost none.

- The zoom preview in the video is the only significant motion, and it is the actual product output, not decoration.
- The bounding box overlay snaps. It does not fade in. Instruments do not fade.
- One exception: the box may draw its outline in a 120ms stroke reveal, which reads as a measurement being taken.
- Honour `prefers-reduced-motion` by disabling the stroke reveal.

No page transitions. No hover lift. No skeleton shimmer. Show a hairline progress bar during export and nothing else.

### Copy

Plain, technical, no marketing voice. The user is an engineer.

- Buttons say exactly what happens. "Export GIF", not "Get started".
- Errors state what failed and what to do. "No trace events captured. The page may render to a canvas, which cannot be traced." Not "Oops, something went wrong."
- The empty state is an instruction, not an illustration. "Record a tab to begin. Chrome only. Works on DOM-based pages."
- Never apologise. Never use an exclamation mark.
- Units always shown: `61.3s`, `1440×900`, `2.4 MB`, `12 fps`.

### Quality floor, unannounced

Keyboard focus visible on every control. Full keyboard operation of the timeline (arrow keys seek, `[` and `]` set segment bounds). Reduced motion respected. This is a desktop tool and does not need a mobile layout; do not build one.

---

## 7. Definition of done for Phase 0

Do not report the spike as complete until all of these hold:

1. A 60 second recording of a real, third-party web application produces both a playable `media.webm` and a `trace.jsonl` with at least 15 click events.
2. A throwaway playback page draws each recorded bounding box at its recorded time.
3. Measured against manual inspection of ten sampled events: boxes land on the correct element, within roughly 4 CSS pixels and roughly one frame.
4. **The measurement is reported as numbers, not as an assertion that it "looks right".**

If any of these fail, write up what failed and stop. That result is more valuable than a workaround.

When Phase 0 passes, update `STATUS.md` to Phase 1 and do not touch `packages/spike` again except to delete it.

---

## 8. STATUS.md

The repo root contains `STATUS.md`, which is one line:

```
Phase: 0
```

It is the only thing that authorises what you may build. Update it only when the current phase's exit criteria in `PRD.md` have been met and the evidence has been recorded beneath that line. Never update it because a phase feels finished.
