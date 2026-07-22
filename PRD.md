# Cutscene: Product Requirements Document

Version 0.2
Status: pre-build
Owner: Ayush Kumar

---

## 0. How to read this document

This PRD contains the **entire product vision**, from the first spike to demo-as-code and collaboration. It is organised as gated phases in implementation order.

**A phase may not be started until the previous phase's exit criteria are met.** The later phases are here so the data model is designed for them, not so they can be built now. An agent that reads Phase 6 and starts writing a permissions model has misread this document.

Each phase states its goal, its scope, and measurable exit criteria that gate the next phase.

---

## 1. The product

### One sentence

A screen recorder that captures the structure of the page alongside the pixels, so a demo can be edited, regenerated and maintained as data rather than as video.

### The thesis

Every screen recorder stores a recording as pixels. Editors then reverse-engineer intent: guess where to zoom from a click coordinate, guess a section boundary from silence. The inference is lossy and the output looks like a guess.

If the recorder captures the page's own structure, it does not guess. It knows the click landed on the "Create report" button and it knows the button's exact bounds. Everything downstream follows: correct zooms, callouts that survive a re-edit, comments that survive a redesign, and demos that regenerate when the product changes.

### The three layers, in order of defensibility

```
Visible wedge     element-locked zoom            easy to copy, easy to demo
Core product      one capture, many artifacts    hard to copy, hard to demo
Long-term moat    demo-as-code, regeneration     very hard to copy, needs users first
```

Build in that order. Design the data model for all three from day one.

### The user

An open source maintainer or a devrel engineer at a developer tools startup. They ship a DOM-based web product frequently. They own the demo GIF in the README and the video on the landing page, and both are perpetually out of date. They live in GitHub, they understand CI, they will adopt an open source tool with a rough edge, and they will not create an account to try something.

### Honest limitations, stated in the README before any feature list

- DOM-based web applications only. Canvas-heavy products (Figma-like editors, maps, WebGL, some charting dashboards) expose no semantic elements and degrade to cursor-based behaviour.
- Cross-origin iframes cannot be traced.
- Shadow DOM is traced only where the root is open.
- Chrome only.

---

## 2. Architecture

```
Chrome extension (MV3)     capture surface. tab video, mic, semantic trace.
                           small. no product here.
       │
       │  recording bundle
       ▼
Editor (local web app)     the product surface. trace lane, zoom generation,
                           editing, export. React, ffmpeg.wasm.
       │
       ▼
packages/trace             the actual intellectual content. schema, locator
                           ranking, clock model. no DOM dependency.
                           imported by both the extension and the editor.

[Phase 5+] Backend         storage, sharing, collaboration, regeneration.
                           does not exist before Phase 5.
```

The extension is a necessity, not a choice: it is the only way to read the DOM of an arbitrary tab. The editor is a normal web app so that it is not constrained by MV3.

**There is no backend until Phase 5.** Recordings live in IndexedDB and on the user's disk. If a phase before 5 appears to need a server, it has been scoped wrong.

---

## 3. The trace format

The irreversible decision in the project. The editor and the renderer can be rewritten. The trace format determines what is possible for the lifetime of the product.

Phase 1 reads almost none of this. Capture it anyway. The point of the format is that Phase 7 does not require every user to re-record.

### Bundle layout

```
recording-<id>/
  media.webm      tab video, optional mic track
  trace.jsonl     one JSON object per line, ordered by t
  meta.json       session metadata
```

Newline-delimited so the trace can be appended while recording without rewriting.

### meta.json

```json
{
  "schemaVersion": 1,
  "recordingId": "rec_01H8XK",
  "createdAt": "2026-07-14T09:00:00.000Z",
  "sessionEpoch": 1752483600000,
  "url": "https://app.example.com/dashboard",
  "origin": "https://app.example.com",
  "viewport": { "width": 1440, "height": 900, "dpr": 2 },
  "capture":  { "width": 2880, "height": 1800, "fps": 30 },
  "media": {
    "mimeType": "video/webm;codecs=vp9,opus",
    "hasAudio": true,
    "durationMs": 61340
  },
  "privacy": {
    "maskInputValues": true,
    "captureNetwork": false,
    "maskedSelectors": ["[data-sensitive]", "input[type=password]"]
  },
  "app": { "commit": null, "version": null, "environment": null }
}
```

`viewport` and `capture` are different and both must be recorded. See §9.

`app` is null in Phase 1 and populated in Phase 7, where regeneration must know which build a recording was made against. The field exists now so that Phase 1 recordings are not orphaned later.

### Event envelope

```json
{
  "v": 1,
  "id": "evt_0184",
  "t": 4200,
  "type": "interaction.click",
  "stepId": "step_003",
  "route": "/projects",
  "viewport": { "width": 1440, "height": 900, "dpr": 2 },
  "scroll": { "x": 0, "y": 240 }
}
```

`t` is milliseconds from `sessionEpoch`, never from page load. Page load resets on navigation; the session clock must not.

`stepId` groups related events into a logical step. Phase 1 assigns one step per click. Later phases merge and split steps. **This field must exist from Phase 1**, because comments (Phase 6), documentation (Phase 4) and regeneration (Phase 7) all anchor to it. A recording without step identity cannot be upgraded.

`scroll` is required on every event. A box captured at one scroll offset is wrong at another.

### Event types

Phase 1 emits:

```
system.recordingStart
system.recordingStop
system.clockSync
navigation
interaction.click
interaction.input
interaction.scroll
viewport.resize
```

Reserved. Defined in the schema now, emitted at the stated phase:

```
interaction.hover      Phase 3
annotation.callout     Phase 3
interaction.keypress   Phase 4
dom.mutation           Phase 4
network.request        Phase 4, off by default, forever
annotation.comment     Phase 6
system.checkpoint      Phase 7
```

### Target descriptor

Attached to any event with an element target.

```json
{
  "target": {
    "role": "button",
    "accessibleName": "Create report",
    "text": "Create report",
    "tagName": "BUTTON",
    "boundingBox": { "x": 1120, "y": 74, "width": 156, "height": 42 },
    "locators": [
      { "type": "testId", "value": "create-report",                  "confidence": 1.00 },
      { "type": "role",   "role": "button", "name": "Create report", "confidence": 0.90 },
      { "type": "label",  "value": "Create report",                  "confidence": 0.80 },
      { "type": "text",   "value": "Create report",                  "confidence": 0.60 },
      { "type": "css",    "value": "main > header > button.primary", "confidence": 0.20 }
    ]
  }
}
```

Locators are ordered by descending confidence and resolved in order by any consumer. A CSS selector is the last resort, never the primary.

**Phase 1 uses only `boundingBox` and ignores everything else here. Capture everything else anyway.** This is the single most important instruction in the document.

`boundingBox` is in CSS pixels, viewport-relative, not page-relative.

### Clock synchronisation

Three clocks exist and none agree:

1. `MediaRecorder` media time
2. content script `performance.now()`
3. service worker `Date.now()`

Required approach:

- The service worker establishes `sessionEpoch` at record start and broadcasts it.
- The content script computes `contentOffset = sessionEpoch - performance.timeOrigin` and stamps every event `t = performance.now() + contentOffset`.
- Every 2 seconds, emit `system.clockSync` with all three readings.
- The editor maps `t` to media time by linear fit across the sync markers. It does not assume they are identical.

```json
{
  "v": 1,
  "id": "evt_0200",
  "t": 10000,
  "type": "system.clockSync",
  "contentClockMs": 8347.2,
  "workerClockMs": 10002.8,
  "mediaTimeMs": 9976.0
}
```

If zooms land visibly late, this is why. Solve it in Phase 0 or fight it forever.

### Privacy, at capture time

Masking happens when the event is constructed, inside `packages/trace`, before serialisation. There must be **no code path** where a raw secret is written to `trace.jsonl` and stripped later. Write a test that asserts this.

| Data | Default |
|---|---|
| `input[type=password]` | never captured, not even the target |
| input values | replaced with `"[MASKED]"` |
| `[data-sensitive]`, `[data-private]` | target captured, text and value masked |
| network requests and bodies | not captured |
| cookies, auth headers | never captured |
| element text content | captured, needed for locators |

`unmaskSelectors` exists and must be set explicitly. There is no "unmask everything" switch, in any phase.

The tradeoff being accepted: capture-time redaction cannot be revisited later. Accept it.

---

## 4. Phase 0 — the spike

**Blocking. Nothing else begins until this passes.**

### Goal

Prove that a recorded bounding box lands on the correct element at the correct video frame. If this is not true, the project does not work, and no architecture fixes it.

### In scope

1. Minimal MV3 extension. `chrome.tabCapture` to a webm.
2. Content script logging every click with role, accessible name, test id, bounding box, scroll offset.
3. Session epoch established, `system.clockSync` every 2 seconds.
4. A throwaway page that plays the video and draws each recorded box as an outline at its recorded time.

Lives in `packages/spike`. Deleted when Phase 1 lands.

### Exit criteria

Across a 60 second recording of a real third-party web application:

- At least 15 click events captured.
- On 10 sampled events, the drawn box lands on the correct element within roughly 4 CSS pixels and roughly one frame.
- **Reported as measured numbers, not as an assertion that it looks right.**

If it fails, stop and write up the failure. That result is more valuable than a workaround.

---

## 5. Phase 1 — the wedge

### Goal

Element-locked zoom, and a GIF a maintainer would actually put in a README.

### In scope

**Capture.** Full trace format from §3, including every field Phase 1 does not use. Tab video, optional microphone. Capture-time masking on by default.

**`packages/trace`.** Versioned schema types. Locator generation and ranking. Clock model and media-time mapping. The coordinate transform (§9).

**Editor.**
- Load a recording bundle
- Event list
- **The trace lane.** A dense horizontal band under the scrubber where every captured event is a tick. Hovering a tick draws that event's bounding box on the video at that moment. Clicking seeks there. This is the signature element of the product. Build it first and build it properly.
- Automatic zoom generation (§8)
- Manual adjustment: add, delete, retime, re-target a segment. Nothing more.

**Export.** GIF tuned hard for README use (§8). MP4, 16:9, 1080p.

### Out of scope

Callouts. Redaction UI. Captions. Vertical export. Brand kits. Accounts. Backend. Sharing. Everything in Phase 3 and later.

### Exit criteria

- A GIF under 3MB at 800px wide in which the zoomed UI text is legible.
- Zooms land within one frame of their click across a 60 second recording.
- A side-by-side comparison video: cursor zoom left, element-locked zoom right, identical footage. The difference must be obvious within ten seconds to someone who was not told what to look for.

---

## 6. Phase 2 — the experiment

### Goal

Find out whether anyone cares. This phase contains almost no code and it is the most important phase in the document.

### In scope

- README with the side-by-side comparison at the top and the limitations above the feature list.
- Use the tool on a repository we already contribute to. Open a PR replacing its demo GIF.
- Repeat on two more repositories.

### Exit criteria

**A maintainer of a repository we do not control merges a PR containing a GIF produced by this tool.**

That is the gate. Not stars, not installs, not signups.

If three PRs are opened and none are merged, the wedge is wrong. Stop and reconsider before Phase 3. Do not build a better editor for a product nobody wants.

### Owner override — 2026-07-14

The external PR experiment is waived because public AI-assisted contributions
create an unacceptable account-safety risk for the owner. No external PRs are
authorised. Phase 3 may begin without this demand-validation evidence; this is
an accepted product risk, not a successful Phase 2 result.

---

## 7. Phase 3 — element-aware editing

Only after Phase 2 passes.

### Goal

Turn the wedge into something a person uses more than once.

### In scope

**Element-anchored callouts.** A callout targets an element identity, not a timestamp.

```json
{
  "type": "annotation.callout",
  "anchor": { "stepId": "step_003", "locators": [] },
  "text": "Real-time analytics",
  "placement": "auto"
}
```

Because the anchor is an element, the callout survives a trim, a re-crop and a reframe. The renderer places it relative to the resolved box, avoiding overlap with the box itself.

**Selector-based redaction as an editing feature.** Capture-time masking already protects secrets in the trace. This is visual blur in the video: blur every `.customer-email`, not a rectangle that drifts when the table scrolls.

**Vertical export, 9:16.** Note the correction. Reframing is **not** free. The trace does not let us re-render the page at a new viewport, because responsive layout, menus and text wrapping all change. It lets us choose an intelligent crop and pan target over the original raster. Frame on the active element per segment, pan between them. Claim no more than that.

**Brand presets.** Local only. Colour, font, intro card, outro card, watermark. No accounts, no team kits.

**Cursor treatment.** Smoothing, size, click ripple, idle hiding.

### Out of scope

Anything requiring a server. Still no backend.

### Exit criteria

Someone who used the tool once uses it again on a different project, unprompted.

---

## 8. Rendering specifications

Applies from Phase 1 onward.

### Zoom generation

1. For each `interaction.click` with a target, create a candidate segment.
2. Focus rect = target box padded 48 CSS px each side, expanded to the output aspect ratio.
3. Clamp to viewport. Never zoom past a scale showing fewer than roughly 320 CSS px of width. Past that it stops reading as a UI and starts reading as a texture.
4. Cap zoom at 2.5x. Higher looks aggressive and exposes compression artefacts.
5. Timing: begin 400ms before the click, hold through it, hold 900ms after, return. A starting point, not a law. Tune by watching output.
6. Merge overlapping segments. Two clicks within 1200ms with overlapping focus rects produce one zoom covering both, not two zooms fighting.
7. Suppress zooms during scroll. A zoom that moves while the page moves is nauseating.
8. Symmetric cubic easing. Not linear. Not bounce.

### GIF

The artifact people actually publish. It gets the most attention.

- 800px wide, roughly the render width of a GitHub README.
- Under 3MB. 5MB is the hard ceiling.
- 12 to 15fps. Higher wastes bytes on a format that cannot use them.
- **One global palette for the whole clip, with dithering.** Per-frame palettes make flat UI backgrounds shimmer.
- ffmpeg `palettegen` and `paletteuse`, `bayer` dithering, `diff` stats mode.
- **Legibility at 800px is the pass condition.** If the text in the zoomed region cannot be read, the export failed regardless of file size. This is the entire reason element-locked zoom matters.

### MP4

16:9, 1080p, H.264, yuv420p. Audio sync verified against the clock mapping, not assumed.

### Renderer

`ffmpeg.wasm` in Phase 1. Zoom and blur are expressible as ffmpeg filters directly (`crop` and `scale` with time-varying expressions, `boxblur` over a region, `overlay` for callouts), which keeps the mechanical effects fast.

Remotion is a reasonable option from Phase 3 for animated callouts, with two caveats to check first: it requires a paid company licence above a size threshold, which matters for downstream open source users, and it renders through headless Chrome, which is slow on long recordings. Design the timeline model so it can emit either an ffmpeg filtergraph or a Remotion composition.

---

## 9. Coordinate spaces

A silent project-killer. Handle it once, centrally, in `packages/trace`.

Three spaces:

1. **CSS pixels, viewport-relative.** What `getBoundingClientRect()` returns.
2. **Device pixels.** CSS pixels times `devicePixelRatio`.
3. **Capture pixels.** What the video actually contains. `chrome.tabCapture` may not equal `innerWidth * dpr`.

Establish the transform once, from a known reference, and test it. Do not scatter conversions across the codebase.

Every recorded box carries the scroll offset at capture time. A box is invalid at any other scroll offset and must be recomputed or explicitly marked stale. **Never render a stale box.**

---

## 10. Phase 4 — one capture, many artifacts

### Goal

Make the recording worth more than the video. This is where the product stops being a recorder and becomes infrastructure.

### In scope

From the same trace, generate:

**Step-by-step documentation.** Markdown, one section per `stepId`, with a screenshot cropped to the target element and the element's accessible name as the action text: "Click **Create report**." The copy comes from the DOM, not from a language model.

**Screenshot set.** One per step, cropped and zoomed to the target, exported at 2x.

**README GIF variants.** The full flow, plus one GIF per step for docs.

**Playwright flow skeleton.** Not a test. A skeleton.

```ts
await page.getByTestId('create-report').click();
await page.getByRole('textbox', { name: 'Report name' }).fill('...');
// suggested: route changed to /reports/new
// suggested: text "Report created" became visible
```

Assertions are *suggested*, derived from observed route changes, newly visible elements and successful responses, and left as comments. The recorder does not know intent. Calling this a generated test would be a lie, and the README must call it a skeleton.

**Transcript and captions.** Word-level timing. SRT and VTT export.

### Exit criteria

A user generates docs from a recording they made for a video, without being prompted to.

---

## 11. Phase 5 — the backend

Only when Phase 4 users are asking to share things. Not before.

### Goal

The minimum server that unlocks collaboration and regeneration. Nothing more.

### In scope

- Auth. GitHub OAuth first; this audience already has it. Email second.
- Recording storage. Bundle upload. Signed URLs.
- Bring-your-own storage: S3, R2, MinIO. **Self-hosting is a first-class path, not an afterthought.** This audience will ask on day one and the answer must already be yes.
- Share links: public, private, expiring, password protected.
- Project and version model. A project holds recordings, traces, timelines and exports.
- Basic view analytics.

### Out of scope

Teams. Roles. Billing. Comments. Storage and sharing only.

### Exit criteria

A user shares a link to a demo with someone who is not a user.

---

## 12. Phase 6 — collaboration

### Goal

The one collaboration problem only this architecture can solve: **comments that survive the product changing under them.**

Every video review tool anchors comments to a timestamp. Trim four seconds off the intro and every comment points at the wrong frame. Regenerate against a redesigned UI and every comment is garbage. This is a real, universal, annoying problem, and the semantic layer is the only thing that can fix it.

### In scope

**Element-anchored comments.**

```json
{
  "type": "annotation.comment",
  "anchor": {
    "stepId": "step_003",
    "locators": [],
    "mediaTimeMs": 4200
  },
  "body": "Change this callout to mention PDF export."
}
```

`mediaTimeMs` is a fallback, never the primary anchor.

**Re-anchoring across versions.** When a timeline is re-edited or a demo is regenerated, every open comment is re-resolved against the new trace and classified:

- **matched** — locator resolved at high confidence, comment moves to the new timestamp automatically
- **drifted** — resolved via a lower-confidence locator, flagged for human confirmation
- **orphaned** — no locator resolved, comment surfaced as "the button this referred to was removed"

This is the hard, interesting problem in the whole product. It is the same class as re-anchoring code review comments across a force-push. There is no clean answer, which is why it is worth doing.

**Multiplayer, in this order.**

1. Presence and soft locks. Cheap, immediately visible, prevents the worst conflicts.
2. Yjs on the timeline document. The timeline is a list of zoom segments, callouts and redactions: a `Y.Array` of `Y.Map`, close to the ideal CRDT shape. The video is never shared; only the edit document.
3. Version history derived from the Yjs snapshot log, which comes nearly free rather than needing a separate diffing system.

**Teams.** Workspace, invitations, four roles: owner, editor, commenter, viewer. Project-level sharing without workspace membership.

**Review states.** Draft, in review, changes requested, approved, published, outdated.

**Shared brand kits.**

### Out of scope

Simultaneous timeline manipulation before presence and soft locks work. Video calls. Chat. Task management. Audit logs. Org hierarchies.

### Exit criteria

Two people on the same team review and approve a demo, and at least one comment survives a re-edit that moved its timestamp.

---

## 13. Phase 7 — demo-as-code

The moat. It sits at the end because it requires a seeded demo environment and
stable recorded flows. It runs locally first. Hosted CI and repository write
access are optional integrations, not requirements for regeneration.

### Goal

Product videos become build artifacts.

### In scope

**`demo.yml`**, committed to the user's repository.

```yaml
version: 1
demos:
  - id: analytics-overview
    trace: .cutscene/analytics-overview.trace.jsonl
    baseUrl: ${{ env.PREVIEW_URL }}
    seed: pnpm run seed:demo
    outputs:
      - type: gif
        path: docs/assets/analytics.gif
        width: 800
      - type: mp4
        path: docs/assets/analytics.mp4
      - type: docs
        path: docs/guides/analytics.md
```

**The regeneration loop.**

```
start the current build or preview environment
    ↓
seed the demo account and fixture data
    ↓
replay the recorded flow with Playwright, resolving ranked locators in order
    ↓
capture a fresh trace and fresh pixels
    ↓
diff the new trace against the stored one
    ↓
render the outputs
    ↓
replace the declared assets and write local reports
```

A team may run the same command in hosted CI and open a pull request with the
result. Cutscene does not require or automatically perform that repository
write.

**Locator recovery and the drift report.** The interesting engineering. Each step resolves through its ranked locators in order.

```
Analytics Overview regenerated against a1b3f9c

  7 steps matched
  1 step drifted    "Generate report"  testId missing, recovered by role + name
  1 step orphaned   "Export as CSV"    no locator resolved, needs review
  2 screenshots changed
```

Drifted and orphaned steps fail regeneration before outputs are replaced.

**Staleness detection.** A demo whose recording predates the current build by more than N commits touching the relevant routes is marked outdated.

### Exit criteria

A normal, non-dry run against a real third-party DOM application must:

1. replay every planned step without drift or orphaning;
2. capture a playable fresh WebM and a privacy-safe fresh trace;
3. write a semantic trace diff and a Git staleness result;
4. replace declared GIF, MP4, and documentation outputs; and
5. contain none of the configured input values in the trace, reports, or
   generated documentation.

The measured files, counts, locator tiers, privacy scan, tests, build, and
browser end-to-end result are recorded in `STATUS.md`. Hosted CI, pull requests,
and auto-merge are optional and are not part of this gate.

---

## 14. Phase 8 — the long tail

Not planned in detail. Listed so it is not mistaken for permanently out of scope.

- **Interactive demos.** A linear click-through is achievable from the trace. Branching, arbitrary input and multiple navigation paths require real state modelling and are a separate product.
- **Native capture.** Desktop app for Electron and native applications, pixel-only, no semantic layer. The honest position is that these get a worse product.
- **Canvas fallback.** OCR and visual element inference. Expensive, unreliable, worth building only if canvas users show up in numbers.
- **AI voice and translation.** Voiceover generation, sentence replacement, caption and voiceover translation. Any voice cloning requires explicit consent from the voice owner.
- **A hosted product with billing.**

---

## 15. Phase 9 — zero-friction first run

Phases 0 through 8 built a product nobody can reach. Every path to value runs through a clone, an install, a build, `chrome://extensions`, a dev server, a download folder and a folder picker. Phase 9 removes all of it.

### Goal

A person with only Chrome installs the extension, records a tab, and lands in a loaded editor. No terminal, no file picker, no dev server.

### Scope

- **The editor ships inside the extension.** The extension bundle contains the editor as an extension page. It is the same editor build that is deployed as a static site; the only difference is where the recording comes from.
- **The handoff is IndexedDB, not the disk.** `saveBundle` already writes the bundle to IndexedDB before the download fires. The editor page reads it back from the same origin. Downloading the three files becomes an editor action, not a mandatory step.
- **Recordings are a list, not a single latest.** The editor's empty state lists the bundles held in IndexedDB with their date, duration and click count, and can delete them. Retention is capped and the oldest bundle is evicted, because IndexedDB quota is finite.
- **The recorder behaves like a public tool.** A visible recording indicator, a readable refusal on tabs that cannot be recorded, and a bundle that remains openable when the recording ends abnormally.
- **The listing requirements are product work, not paperwork.** A privacy policy stating what leaves the machine and when, an icon set, and a justification for every permission.

Out of scope for this phase: hosted storage, accounts, billing, screen capture without a trace.

### Constraints

- One editor codebase and one editor build. A second copy of the editor is a defect.
- No new runtime dependency reaches the extension bundle without justification. `ffmpeg.wasm` currently fetches its core from a CDN, which an extension page's CSP forbids; the core is served from the extension's own origin instead.
- Nothing recorded leaves the machine in this phase.

### Exit criteria

1. From a clean Chrome profile with the built extension loaded, recording a tab and stopping it opens the editor with that recording already loaded. No download and no file picker are involved.
2. The editor's export paths — GIF, MP4, interactive demo, demo kit — work from inside the extension page, not only from the dev server.
3. The empty state lists every retained recording and can open and delete each one.
4. An end-to-end test asserts criterion 1 without human intervention.
5. `pnpm test && pnpm typecheck && pnpm build && pnpm e2e` pass, and the numbers are recorded in `STATUS.md`.

---

## 16. Scope discipline

The failure mode of this project is not a bad architecture. It is building Phase 6 during Phase 1.

Every phase after 2 is gated on evidence from a real user. If that evidence does not arrive, the correct action is to stop and reconsider, not to build the next phase and hope.

The one thing that cannot be deferred is **capturing the full trace format in Phase 1**, including every field that only Phases 4, 6 and 7 will read. A field not captured is a field that forces every user to re-record.

Capture everything. Build almost nothing.
