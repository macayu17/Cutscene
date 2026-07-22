# Chrome Web Store listing

Everything the submission form asks for. Regenerate the screenshots with:

```sh
pnpm --filter @cutscene/extension build
node packages/extension/scripts/listing.ts
```

They are written to `artifacts/store-listing/` at 1280×800, taken from the
editor inside the built extension with a real recording loaded. The bundle is
`artifacts/submission/clean-recording` unless `CUTSCENE_BUNDLE` says otherwise.

## Name

Cutscene

## Summary (132 characters maximum)

Records a tab and the DOM behind it, so zooms lock onto the element you clicked
instead of guessing from the cursor.

## Category

Developer Tools

## Single purpose

Record a browser tab together with the structure of the page being recorded, and
edit that recording into demo video and documentation.

The extension does one thing: capture. The editor it opens is part of the same
package because the recording never leaves the machine to be edited.

## Description

Every screen recorder saves pixels and throws away everything the browser
already knew. Cutscene records a Chrome tab and the DOM events behind it,
together.

Because the recording knows which element you clicked, and exactly where that
element was, it does not have to guess:

- Zooms frame the element that was clicked, not a rectangle around the cursor.
- Callouts stay anchored to their element through a re-edit.
- One capture exports a 1080p MP4, a README GIF, an interactive click-through,
  step documentation, cropped screenshots, and a Playwright test skeleton.
- The recording audits itself: it reports the elements you interacted with that
  expose no accessible name, straight from the trace.
- The same recording can be replayed against a later build of your app. When the
  product moves, the demo fails like a failing test instead of quietly going
  stale.

Recording and editing happen entirely on your machine. There is no account, no
upload, and no server unless you run one yourself.

What it will not do:

- Chrome only.
- DOM-based web applications only. Canvas, WebGL and maps fall back to pixels.
- Cross-origin iframes cannot be traced.
- Shadow DOM is traced only where the root is open.

Open source, MIT: https://github.com/macayu17/Cutscene

## Permission justifications

Submit these verbatim; each maps to one thing the extension cannot work without.

**tabCapture** — Records the video of the tab the user explicitly selected. This
is the recording itself.

**audioCapture** — Records the microphone, only when the user ticks the
microphone option before starting.

**activeTab** — Identifies which tab the user asked to record when they open the
popup.

**activeTab** also covers the recorded tab for the duration of the capture the user
started, which is why no host permission is requested.

**offscreen** — Encodes the recording in an offscreen document so it survives the
popup closing. MediaRecorder cannot run in a service worker.

**storage** — Remembers an in-progress recording across a service worker restart,
so an interrupted recording is recoverable.

**downloads** — Saves the finished recording to the user's Downloads folder.

**Content scripts on http and https** — The content script reads the structure of
the page being recorded: the role, accessible name and bounds of the elements the
user interacts with. The user chooses which page to record, so the extension
cannot know in advance which host that is. It reads structure only while a
recording is active on that tab, and never sends it anywhere.

No `host_permissions` are requested. The extension makes no cross-origin request
of any kind, and the recorded tab is covered by `activeTab` for the capture the
user started. The `tabs` permission is not requested either: nothing reads a
tab's URL or title.

## Data use disclosures

- Does the extension collect personally identifiable information? No.
- Health, financial, authentication, personal communications, location? No.
- Web history? No. It records only the tab the user chose, only while recording.
- User activity? Yes, within that recording: clicks, typing, scrolling and
  navigation on the recorded page. Stored locally, transmitted nowhere.
- Website content? Yes, within that recording: the video of the tab and the
  structure of the elements interacted with. Stored locally.
- Is any of it sold, transferred, or used for anything unrelated? No.
- Input values are masked at capture, before anything is written to disk.

Privacy policy URL: https://cutscene-editor-sandy.vercel.app/privacy

## Screenshots

1. `01-editor.png` — the editor with a real recording loaded, the semantic trace
   on the left and the trace lane beneath the video.
2. `02-element.png` — a recorded click selected, with the amber box locked onto
   the checkbox it actually landed on.
3. `03-artifacts.png` — the export menu: MP4, GIF, interactive demo, docs,
   screenshots, step GIFs, Playwright skeleton.

## Package

The release workflow uploads `cutscene-extension.zip`, built from
`packages/extension/dist`. Build it locally with `pnpm build`.
