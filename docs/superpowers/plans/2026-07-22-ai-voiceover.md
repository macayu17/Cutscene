# AI Voiceover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local Microsoft David voiceover to the existing Cutscene submission video, explicitly covering the product, Codex usage, and GPT-5.6 usage while staying under three minutes.

**Architecture:** Keep the source MP4 unchanged. Save the narration as plain Markdown, synthesize it with Windows `System.Speech`, then use FFmpeg to copy the existing H.264 video and replace its audio with AAC narration.

**Tech Stack:** Windows System.Speech, PowerShell, FFmpeg, FFprobe, Markdown.

---

### Task 1: Write and synthesize the narration

**Files:**
- Create: `artifacts/submission/ai-voiceover-script.md`
- Create locally: `artifacts/submission/ai-voiceover.wav`

- [ ] **Step 1: Write the narration**

Create `ai-voiceover-script.md` with this plain text so it can be read directly by the speech engine:

```text
Most screen recordings are only pixels. When the interface changes, the video cannot tell you what was clicked, why the camera moved, or whether the workflow still works. Cutscene records a Chrome tab and the DOM actions behind it on the same timeline.

Each interaction keeps a stable step ID, element role, accessible name, bounding box, scroll state, and ranked locators. That semantic trace lets the editor lock zooms to the real element instead of guessing from the cursor. It also lets Cutscene mask sensitive values before they are serialized.

From one recording, Cutscene builds a complete demo kit: a polished MP4, a README GIF, step documentation, cropped screenshots, an interactive walkthrough, and a Playwright flow skeleton. The outputs come from the same trace, so the story, visuals, and technical steps stay aligned.

In the interactive guide, playback pauses at every action and places a hotspot over the recorded target. The export is static, local, and easy to share. There is no backend, account, or hosted service required to open it.

Cutscene can also replay the ranked locators against a newer build. If a locator changes, it reports drift and can promote the locator that still resolves. If the element is genuinely gone, it marks the step orphaned and exits with a failure instead of hiding the problem. A maintained demo behaves more like a test than a disposable recording.

I used Codex as the hands-on engineering agent throughout the build. Codex read the product requirements and phase gates, implemented the TypeScript packages, diagnosed clock, geometry, ordering, and playback bugs, wrote focused Vitest and Playwright checks, and verified the real recordings and exported artifacts. I reviewed the results and made the final product decisions.

I used GPT-5.6 for product reasoning and communication: comparing feature directions, simplifying the scope, challenging overcomplicated solutions, structuring the demo, and refining the README and submission story. It helped turn the engineering evidence into an explanation judges can follow without changing what the product actually does.

That is the difference with Cutscene. Record the workflow once, then keep the video, guide, documentation, screenshots, and test flow together as the interface changes.
```

- [ ] **Step 2: Render Microsoft David locally**

Run with Windows PowerShell so the installed .NET speech assembly is available:

```powershell
powershell.exe -NoProfile -Command @'
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice('Microsoft David Desktop')
$synth.Rate = 0
$synth.Volume = 100
$prompt = New-Object System.Speech.Synthesis.PromptBuilder
(Get-Content 'F:\Cutscene\artifacts\submission\ai-voiceover-script.md' -Raw) -split "`r?`n`r?`n" | ForEach-Object {
  $prompt.AppendText($_.Trim())
  $prompt.AppendBreak([TimeSpan]::FromMilliseconds(300))
}
$synth.SetOutputToWaveFile('F:\Cutscene\artifacts\submission\ai-voiceover.wav')
$synth.Speak($prompt)
$synth.Dispose()
'@
```

- [ ] **Step 3: Check that the narration fits**

Run:

```powershell
ffprobe -v error -show_entries format=duration -of default=nw=1 artifacts/submission/ai-voiceover.wav
```

Expected: duration below 145 seconds. If it exceeds 145 seconds, rerender once with `$synth.Rate = 1`.

### Task 2: Mux and verify the final video

**Files:**
- Create locally: `artifacts/submission/cutscene-demo-ai-voice.mp4`

- [ ] **Step 1: Replace the audio in a new copy**

Run:

```powershell
ffmpeg -y -i artifacts/submission/cutscene-demo-final.mp4 -i artifacts/submission/ai-voiceover.wav -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -af apad -shortest artifacts/submission/cutscene-demo-ai-voice.mp4
```

- [ ] **Step 2: Verify media and required narration topics**

Run:

```powershell
ffprobe -v error -show_entries format=duration,size -show_entries stream=codec_name,codec_type,width,height,r_frame_rate -of json artifacts/submission/cutscene-demo-ai-voice.mp4
$script = Get-Content artifacts/submission/ai-voiceover-script.md -Raw
if ($script -notmatch 'Cutscene' -or $script -notmatch 'Codex' -or $script -notmatch 'GPT-5\.6') { throw 'Required narration topic missing.' }
```

Expected: H.264 video, AAC audio, 1920x1080, duration below 180 seconds, and no exception.

- [ ] **Step 3: Preserve repository state**

Run:

```powershell
git status --short
```

Expected: only the committed plan is tracked; submission artifacts remain ignored.
