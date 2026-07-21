# AI voiceover design

## Goal

Create a submission-ready copy of `artifacts/submission/cutscene-demo-final.mp4`
with a local Windows voiceover. The narration must explain what Cutscene is,
how Codex was used, and how ChatGPT 5.6 was used. The finished video must remain
under three minutes.

## Design

- Preserve the existing MP4 and write `cutscene-demo-ai-voice.mp4`.
- Use Windows `System.Speech` with Microsoft Zira, the enabled local voice.
  Microsoft David was preferred but its installed package is disabled and
  incomplete. No API, network service, new dependency, or hosted credit is
  needed.
- Keep the narration in `artifacts/submission/ai-voiceover-script.md` and render
  it to a temporary WAV beside the submission artifacts.
- Replace the destination video's audio with the synthesized narration through
  FFmpeg while copying the existing H.264 video stream unchanged.
- Structure the narration around the visible demo: problem, semantic capture,
  generated kit, interactive guide, regeneration, Codex usage, ChatGPT 5.6 usage,
  and closing distinction.

## Failure handling and verification

- Stop if Microsoft Zira is unavailable or speech synthesis fails.
- Stop if FFmpeg reports an error or the output lacks either video or audio.
- Use FFprobe to confirm H.264 video, AAC audio, and a duration below 180
  seconds.
- Check the saved script contains explicit sections for Cutscene, Codex, and
  ChatGPT 5.6.

Public YouTube upload and the submission-form URL remain manual because this
task only authorizes local media creation.
