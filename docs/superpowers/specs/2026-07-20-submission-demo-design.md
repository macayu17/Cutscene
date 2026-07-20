# Cutscene Submission Demo

Date: 2026-07-20
Status: approved direction

## Goal

Create a clean, public-facing Cutscene submission package without synthetic
speech, paid services, hosted CI, or fabricated product behavior. The package
must show why Cutscene is more than a screen recorder: one captured DOM workflow
becomes a polished video, semantic trace, interactive guide, documentation,
screenshots, and Playwright flow.

## Chosen approach

Use the existing clean-capture path to record a new TodoMVC workflow with five
real click targets and no injected secret fixture. Build a fresh Semantic Demo
Kit from that recording. Then record a paced browser walkthrough of the editor
and extracted interactive player. The final video remains silent so the owner
can add their own voice; a timestamped narration script is delivered beside it.

This is preferable to reusing the earlier Phase 6 recording, whose deliberate
privacy fixture is visible in the pixels, and preferable to local TTS because
the owner's voice will sound more credible.

## Artifacts

All final files live under `artifacts/submission/` and remain uncommitted:

```text
clean-recording/
  media.webm
  trace.jsonl
  meta.json
demo-kit/
  <recording-id>-demo-kit.zip
  extracted/
screenshots/
  editor.png
  player.png
cutscene-demo-silent.mp4
narration.md
submission-copy.md
```

The source workflow creates five plainly named todos, records five checkbox
clicks, and uses visual redaction only for the TodoMVC input and list rows. It
must contain none of the test strings `raw-secret`, `raw-nested-secret`, or
`raw-nested-label` in either serialized data or visible screenshots.

## Video story

Target duration is 90 to 120 seconds, comfortably below the three-minute
submission limit.

1. **Problem, 0-12s:** show the clean workflow and state that ordinary screen
   recordings know only pixels.
2. **Semantic capture, 12-35s:** show `SEMANTIC TRACE`, event counts, step IDs,
   element role, CSS-pixel bounds, ranked locator type, and element-locked zoom.
3. **One action, 35-60s:** select `Build demo kit` and show its progress without
   waiting through the entire render in real time.
4. **Outputs, 60-85s:** show the extracted MP4, GIF, Markdown, screenshots, and
   Playwright skeleton.
5. **Interactive proof, 85-105s:** run the five aligned hotspots to completion.
6. **Close, 105-115s:** show the local regeneration command and the concise
   claim: record once, keep the demo and its supporting artifacts together.

The walkthrough uses real UI only. Cuts may remove waiting time, but controls,
files, metrics, and outputs may not be simulated.

## Narration

`narration.md` contains short timestamped paragraphs written for natural speech,
not marketing copy. It explains the problem, semantic trace, Demo Kit, local
privacy model, and regeneration. It does not claim OCR, AI voice, native capture,
or cloud automation. The owner records the narration separately and may combine
it with the silent MP4 using the included one-line FFmpeg command.

## Submission copy

`submission-copy.md` contains copy-pasteable project name, tagline, short pitch,
project story, built-with tags, installation/testing instructions, and media
checklist. It references GPT-5.6 or Codex only where the owner can truthfully
confirm their use; no unsupported model claim is invented.

README and licensing changes are deferred until the owner confirms the exact
model-use wording and preferred license. GitHub push, YouTube upload, and Devpost
submission remain manual public actions.

## Verification

- Clean bundle: playable media, five clicks, no forbidden test strings.
- Demo Kit: valid MP4/GIF signatures, expected artifact groups, native Windows
  extraction, five interactive hotspots, zero browser errors.
- Editor and player screenshots: 1440x900, nonblank, no horizontal overflow,
  no visible secret fixture.
- Silent video: H.264/yuv420p, 1920x1080, 90-120 seconds, no audio stream.
- Narration: fits the video timestamps when read at a normal pace.
- Repository remains clean except for intentional documentation commits; large
  media stays ignored and no hosted credits are used.
