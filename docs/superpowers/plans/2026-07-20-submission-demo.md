# Cutscene Submission Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a clean, silent 90–120 second submission video, narration script, screenshots, Demo Kit, and Devpost-ready copy from a fresh five-click TodoMVC recording.

**Architecture:** Reuse the extension's existing clean-capture E2E and the editor's real Demo Kit export. Use two temporary Playwright proof files only to drive the built UI and record real browser pixels, then delete them; assemble the source and walkthrough clips with the installed FFmpeg binary. Keep all large outputs ignored under `artifacts/submission/`.

**Tech Stack:** Existing MV3 extension, Playwright Chromium, Vite preview, FFmpeg/FFprobe, PowerShell, Markdown.

---

### Task 1: Capture a clean semantic source bundle

**Files:**
- Create locally: `artifacts/submission/clean-recording/media.webm`
- Create locally: `artifacts/submission/clean-recording/trace.jsonl`
- Create locally: `artifacts/submission/clean-recording/meta.json`

- [ ] **Step 1: Build the extension**

Run:

```powershell
pnpm --filter @cutscene/extension build
```

Expected: Vite builds `packages/extension/dist` with exit code 0.

- [ ] **Step 2: Run the existing clean capture**

Run in one PowerShell process so the environment is scoped to the test:

```powershell
$capture = Join-Path $env:TEMP "cutscene-submission-$([guid]::NewGuid())"
$env:CUTSCENE_DURATION_SECONDS='16'
$env:CUTSCENE_CLICK_COUNT='5'
$env:CUTSCENE_CLICK_MODE='toggle'
$env:CUTSCENE_CLEAN_DEMO='1'
$env:CUTSCENE_ARTIFACT_DIR=$capture
pnpm --filter @cutscene/extension exec playwright test e2e/capture.spec.ts
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
New-Item -ItemType Directory -Force artifacts/submission/clean-recording | Out-Null
$downloads = Get-ChildItem -LiteralPath $capture | Sort-Object LastWriteTime
Copy-Item -LiteralPath (($downloads | Where-Object Extension -eq '.webm' | Select-Object -Last 1).FullName) -Destination artifacts/submission/clean-recording/media.webm
Copy-Item -LiteralPath (($downloads | Where-Object Extension -eq '.jsonl' | Select-Object -Last 1).FullName) -Destination artifacts/submission/clean-recording/trace.jsonl
Copy-Item -LiteralPath (($downloads | Where-Object Extension -eq '.json' | Select-Object -Last 1).FullName) -Destination artifacts/submission/clean-recording/meta.json
```

Expected: the focused Chromium capture passes and the three bundle files exist.

- [ ] **Step 3: Measure and privacy-check the bundle**

Run:

```powershell
$root='artifacts/submission/clean-recording'
$trace=Get-Content "$root/trace.jsonl" -Raw
$events=$trace.Trim() -split "`r?`n" | ForEach-Object { $_ | ConvertFrom-Json }
$probe=ffprobe -v error -show_entries format=duration -show_entries stream=codec_name,width,height -of json "$root/media.webm" | ConvertFrom-Json
[pscustomobject]@{
  Events=$events.Count
  Clicks=($events | Where-Object type -eq 'interaction.click').Count
  Forbidden=([regex]::Matches($trace,'raw-secret|raw-nested-secret|raw-nested-label')).Count
  Duration=[double]$probe.format.duration
  Width=$probe.streams[0].width
  Height=$probe.streams[0].height
} | Format-List
```

Expected: 5 clicks, zero forbidden strings, playable 1920×1080 WebM, and roughly 16 seconds duration.

### Task 2: Build and inspect the real Demo Kit

**Files:**
- Temporarily create then delete: `packages/editor/e2e/submission-kit-proof.spec.ts`
- Create locally: `artifacts/submission/demo-kit/<recording-id>-demo-kit.zip`
- Create locally: `artifacts/submission/demo-kit/extracted/`
- Create locally: `artifacts/submission/screenshots/editor.png`
- Create locally: `artifacts/submission/screenshots/player.png`

- [ ] **Step 1: Build and start the editor preview**

Run `pnpm --filter @cutscene/editor build`, then start the built editor at
`http://127.0.0.1:4176` with a hidden PowerShell process and verify HTTP 200.

```powershell
pnpm --filter @cutscene/editor build
$out=Join-Path $env:TEMP 'cutscene-submission-editor.out.log'
$err=Join-Path $env:TEMP 'cutscene-submission-editor.err.log'
Start-Process -FilePath 'C:\Program Files\PowerShell\7\pwsh.exe' -ArgumentList @(
  '-NoProfile','-Command','pnpm --filter @cutscene/editor exec vite preview --host 127.0.0.1 --port 4176 --strictPort'
) -WorkingDirectory 'F:\Cutscene' -RedirectStandardOutput $out -RedirectStandardError $err -WindowStyle Hidden
for($i=0;$i -lt 30;$i++){
  try{if((Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4176 -TimeoutSec 2).StatusCode -eq 200){break}}catch{}
  Start-Sleep -Milliseconds 500
}
```

- [ ] **Step 2: Create the temporary real-browser export proof**

Create `packages/editor/e2e/submission-kit-proof.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('exports the clean submission kit', async ({ page }) => {
  test.setTimeout(360_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 1_440, height: 900 });
  await page.goto('http://127.0.0.1:4176');
  await page.locator('input[webkitdirectory]').setInputFiles('F:/Cutscene/artifacts/submission/clean-recording');
  await expect(page.locator('.semantic-summary')).toContainText('5 targets');
  await page.locator('.event').filter({ hasText: 'interaction.click' }).first().click();
  await expect(page.locator('.event-detail')).toContainText('LOCATOR');
  await page.locator('.events').evaluate((element) => element.scrollTo(0, 0));
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  await page.screenshot({ path: 'F:/Cutscene/artifacts/submission/screenshots/editor.png', fullPage: true });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Build demo kit' }).click();
  const file = await download;
  await file.saveAs(`F:/Cutscene/artifacts/submission/demo-kit/${file.suggestedFilename()}`);
  expect(errors).toEqual([]);
});
```

- [ ] **Step 3: Run the export proof and extract the result**

Run:

```powershell
New-Item -ItemType Directory -Force artifacts/submission/screenshots,artifacts/submission/demo-kit | Out-Null
pnpm --filter @cutscene/editor exec playwright test e2e/submission-kit-proof.spec.ts
$zip=Get-ChildItem artifacts/submission/demo-kit/*.zip | Select-Object -First 1
Expand-Archive -LiteralPath $zip.FullName -DestinationPath artifacts/submission/demo-kit/extracted
```

Expected: one ZIP downloads, the screenshot exists, and native extraction succeeds.

- [ ] **Step 4: Verify the extracted player and capture it**

Serve `artifacts/submission/demo-kit/extracted` on `127.0.0.1:4177`, then create
`packages/editor/e2e/submission-player-proof.spec.ts`:

```powershell
$out=Join-Path $env:TEMP 'cutscene-submission-player.out.log'
$err=Join-Path $env:TEMP 'cutscene-submission-player.err.log'
Start-Process -FilePath 'python' -ArgumentList @('-m','http.server','4177','--bind','127.0.0.1') `
  -WorkingDirectory 'F:\Cutscene\artifacts\submission\demo-kit\extracted' `
  -RedirectStandardOutput $out -RedirectStandardError $err -WindowStyle Hidden
```

```ts
import { expect, test } from '@playwright/test';

test('completes the clean submission player', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 1_440, height: 900 });
  await page.goto('http://127.0.0.1:4177');
  const manifest = await page.locator('#manifest').evaluate((node) => JSON.parse(node.textContent ?? '')) as {
    steps: unknown[];
  };
  expect(manifest.steps).toHaveLength(5);
  await page.getByRole('button', { name: 'Start demo' }).click();
  for (let index = 0; index < manifest.steps.length; index += 1) {
    const hotspot = page.locator('#hotspot');
    await expect(hotspot).toBeVisible({ timeout: 20_000 });
    if (index === 0) {
      await page.screenshot({ path: 'F:/Cutscene/artifacts/submission/screenshots/player.png', fullPage: true });
    }
    await hotspot.click();
  }
  await expect(page.locator('#complete-panel')).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});
```

Run:

```powershell
pnpm --filter @cutscene/editor exec playwright test e2e/submission-player-proof.spec.ts
```

Expected: 5/5 hotspots complete with no browser errors.

- [ ] **Step 5: Delete the two temporary proof files**

Use `apply_patch` to delete both temporary `submission-*-proof.spec.ts` files.
Confirm `git status --short` lists no E2E proof file.

### Task 3: Record and assemble the silent walkthrough

**Files:**
- Temporarily create then delete: `packages/editor/e2e/submission-walkthrough.spec.ts`
- Create locally: `artifacts/submission/walkthrough.webm`
- Create locally: `artifacts/submission/cutscene-demo-silent.mp4`

- [ ] **Step 1: Record the real browser walkthrough**

Create a temporary Playwright test that opens a new 1920×1080 context with
`recordVideo`, then performs this exact paced sequence:

```ts
import { expect, test } from '@playwright/test';

test('records the submission walkthrough', async ({ browser }) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({ viewport: { width: 1_920, height: 1_080 },
    recordVideo: { dir: 'F:/Cutscene/artifacts/submission/video-work', size: { width: 1_920, height: 1_080 } } });
  const page = await context.newPage();
  const recording = page.video();
  await page.goto('http://127.0.0.1:4176');
  await page.locator('input[webkitdirectory]').setInputFiles('F:/Cutscene/artifacts/submission/clean-recording');
  await expect(page.locator('.semantic-summary')).toContainText('5 targets');
  await page.waitForTimeout(4_000);
  for (const event of await page.locator('.event').filter({ hasText: 'interaction.click' }).all()) {
    await event.click();
    await page.waitForTimeout(1_400);
  }
  await page.locator('.events').evaluate((element) => element.scrollTo(0, 0));
  await page.waitForTimeout(3_000);
  await page.getByText('Export', { exact: true }).click();
  await page.waitForTimeout(4_000);
  await page.getByText('Export', { exact: true }).click();
  await page.getByRole('button', { name: 'Build demo kit' }).click();
  await page.waitForTimeout(3_000);
  await page.goto('file:///F:/Cutscene/artifacts/submission/demo-kit/extracted/demo.gif');
  await page.waitForTimeout(7_000);
  await page.goto('file:///F:/Cutscene/artifacts/submission/demo-kit/extracted/docs.md');
  await page.waitForTimeout(7_000);
  await page.goto('file:///F:/Cutscene/artifacts/submission/demo-kit/extracted/playwright.spec.ts');
  await page.waitForTimeout(7_000);
  await page.goto('http://127.0.0.1:4177');
  await page.getByRole('button', { name: 'Start demo' }).click();
  for (let index = 0; index < 5; index += 1) {
    const hotspot = page.locator('#hotspot');
    await expect(hotspot).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1_000);
    await hotspot.click();
  }
  await expect(page.locator('#complete-panel')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(4_000);
  await context.close();
  if (!recording) throw new Error('Playwright video recording unavailable.');
  await recording.saveAs('F:/Cutscene/artifacts/submission/walkthrough.webm');
});
```

Run the focused test and delete the temporary test afterward.

```powershell
New-Item -ItemType Directory -Force artifacts/submission/video-work | Out-Null
pnpm --filter @cutscene/editor exec playwright test e2e/submission-walkthrough.spec.ts
```

- [ ] **Step 2: Assemble the silent H.264 video**

Run:

```powershell
ffmpeg -y -t 10 -i artifacts/submission/clean-recording/media.webm -t 105 -i artifacts/submission/walkthrough.webm -filter_complex "[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=30,setpts=PTS-STARTPTS[v0];[1:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=30,setpts=PTS-STARTPTS[v1];[v0][v1]concat=n=2:v=1:a=0[out]" -map "[out]" -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -movflags +faststart -an artifacts/submission/cutscene-demo-silent.mp4
```

Expected: H.264/yuv420p, 1920×1080, no audio stream, duration 90–120 seconds.

### Task 4: Write narration and submission copy

**Files:**
- Create locally: `artifacts/submission/narration.md`
- Create locally: `artifacts/submission/submission-copy.md`

- [ ] **Step 1: Write the timestamped narration**

Use this exact natural script, adjusting only timestamp endpoints to the measured
video cuts:

````markdown
# Cutscene narration

## 0:00–0:10
Most screen recorders save pixels and throw away everything the browser knew about the page. Cutscene records the tab and the DOM actions behind it together.

## 0:10–0:32
That gives the editor a semantic trace. Every click has a real step ID, element role, bounding box, and ranked locator. The zoom follows the element itself instead of guessing from the cursor.

## 0:32–0:45
The editor stays local, and sensitive fields can be masked or visually blurred before anything is serialized. From this one recording, I can build the whole demo kit with one action.

## 0:45–1:08
The kit contains a polished MP4, a README GIF with a stable global palette, step documentation, cropped screenshots, an interactive walkthrough, and a Playwright flow skeleton. These are generated from the same trace, so the story and the technical artifacts stay aligned.

## 1:08–1:38
The interactive player pauses on each recorded action and places a hotspot over the actual target. It is a static export, so anyone can open it without installing Cutscene or signing in.

## 1:38–end
Cutscene can also replay ranked locators against a current build, report drift, and regenerate maintained outputs locally. Record the workflow once, then keep the video, guide, docs, screenshots, and test flow together as the UI changes.

## Add your voice

```powershell
ffmpeg -i cutscene-demo-silent.mp4 -i voice.wav -c:v copy -c:a aac -b:a 192k -shortest cutscene-demo-final.mp4
```
````

- [ ] **Step 2: Write Devpost-ready copy**

Create `submission-copy.md` with these exact sections:

```markdown
# Devpost submission copy

## Project name
Cutscene

## Elevator pitch
Record one Chrome workflow and turn it into a polished video, interactive guide, docs, screenshots, and a Playwright flow.

## Built with
Chrome Extensions, TypeScript, React, Vite, Zustand, Playwright, FFmpeg WebAssembly, Vitest, Yjs, Node.js

## Try it out
https://github.com/macayu17/Cutscene

## Project story

### Inspiration
I kept seeing the same workflow documented several times: once as a screen recording, again as screenshots, again as written steps, and again as an automated browser test. The video looked polished, but it had forgotten the structure the browser already knew.

### What it does
Cutscene captures a Chrome tab and a synchronized semantic trace of the DOM actions behind it. Its editor generates element-locked zooms and can export an MP4, README GIF, interactive click-through, step documentation, cropped screenshots, captions, and a Playwright flow skeleton. A local runner can replay ranked locators against a current build, report drift, and regenerate maintained outputs.

### How I built it
The extension uses Manifest V3, chrome.tabCapture, MediaRecorder, and a content script. The trace package owns versioned events, ranked locators, privacy masking, clock fitting, coordinate transforms, and regeneration logic. The React editor uses Zustand and ffmpeg.wasm for local rendering. Playwright verifies capture, collaboration, interactive playback, and regeneration end to end.

### Challenges
The hard parts were not the video controls. Three clocks had to be aligned without assuming they started together. DOM boxes had to be mapped from CSS pixels into captured video coordinates. Scroll and resize events could invalidate geometry, and private input values had to be masked before serialization rather than cleaned up later.

### Accomplishments
On the original 60-second spike, 10 sampled boxes landed on the correct element with a maximum spatial error of 0.37 CSS pixels and a maximum timing error of one frame. The final Demo Kit packages six artifact groups from one recording, and its five interactive hotspots measured a maximum rendered edge error below one pixel in Chromium.

### What I learned
A screen recording becomes much more useful when pixels and browser semantics share one timeline. Keeping the trace small and deterministic also made privacy checks, replay, and export verification easier.

### What's next
The next useful work is better onboarding, cleaner public demo hosting, and broader capture support only where real users ask for it. OCR, AI voice, and canvas inference remain deliberately out of scope for now.

## Codex usage
I used Codex as a hands-on engineering partner to inspect the repository, implement scoped phases, diagnose timing and layout regressions, write focused tests, and verify real browser artifacts. The work stayed source-grounded: every completion claim was backed by local tests, measured geometry, generated files, or Chromium runs.

## GPT-5.6 disclosure
Only add a GPT-5.6 claim if the submitted /feedback session confirms that model was used. Do not replace this note with an unverified claim.

## Judge instructions
1. Install dependencies with `pnpm install` and build with `pnpm build`.
2. Load `packages/extension/dist` through Chrome's Load unpacked flow.
3. Record a DOM-based tab and stop the capture.
4. Start the editor with `pnpm --filter @cutscene/editor exec vite`.
5. Load the downloaded recording folder and choose Build demo kit.
6. Run `pnpm test`, `pnpm typecheck`, `pnpm build`, and `pnpm e2e` for the complete local verification gate.

## Manual fields still required
- Public YouTube demo URL
- `/feedback` session ID
- Submitter type, country, and category
- License choice before public release
```

- [ ] **Step 3: Verify final media and repository state**

Run FFprobe on the final MP4, compute SHA-256 hashes for the video and Demo Kit,
scan all text artifacts for forbidden secret strings, open both PNG screenshots,
and run `git status --short`.

Expected: video satisfies the measured format/duration gate, both images are
real and clean, privacy scan is zero, and ignored media created no source diff.

- [ ] **Step 4: Commit only the plan**

Do not commit `artifacts/submission/`. Do not push, upload, create a PR, or use
hosted credits.
