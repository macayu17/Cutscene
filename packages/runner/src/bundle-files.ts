import { copyFile, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { RecordingMeta, Result, TraceEvent } from '@cutscene/trace';
import type { Browser } from '@playwright/test';

export type FreshBundle = {
  directory: string;
  mediaPath: string;
  tracePath: string;
  metaPath: string;
};

export type VideoProbe = { width: number; height: number; durationMs: number };

export async function probeWebm(browser: Browser, mediaPath: string): Promise<Result<VideoProbe>> {
  const page = await browser.newPage();
  try {
    await page.goto(pathToFileURL(mediaPath).href);
    const video = page.locator('video');
    await video.waitFor({ state: 'attached' });
    const probe = await video.evaluate(async (node) => {
      const media = node as unknown as {
        readyState: number;
        videoWidth: number;
        videoHeight: number;
        duration: number;
        addEventListener(type: string, listener: () => void, options: { once: boolean }): void;
      };
      if (media.readyState < 1) {
        await new Promise<void>((resolve) => media.addEventListener('loadedmetadata', resolve, { once: true }));
      }
      return { width: media.videoWidth, height: media.videoHeight, durationMs: media.duration * 1000 };
    });
    if (probe.width <= 0 || probe.height <= 0 || !Number.isFinite(probe.durationMs) || probe.durationMs <= 0) {
      return { ok: false, error: 'recorded WebM metadata is invalid' };
    }
    return { ok: true, value: probe };
  } catch (cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, error: `cannot probe recorded WebM: ${detail}` };
  } finally {
    await page.close();
  }
}

export async function writeFreshBundle(input: {
  configDir: string;
  demoId: string;
  mediaPath: string;
  events: readonly TraceEvent[];
  meta: RecordingMeta;
}): Promise<Result<FreshBundle>> {
  const directory = join(input.configDir, '.cutscene', 'runs', input.demoId);
  const staging = `${directory}.${process.pid}.${Date.now()}.tmp`;
  try {
    await mkdir(dirname(directory), { recursive: true });
    await rm(staging, { recursive: true, force: true });
    await mkdir(staging);
    await copyFile(input.mediaPath, join(staging, 'media.webm'));
    const trace = input.events.map((event) => JSON.stringify(event)).join('\n');
    await writeFile(join(staging, 'trace.jsonl'), `${trace}${trace ? '\n' : ''}`, 'utf8');
    // Metadata is the completion marker. A staged failure cannot resemble a valid bundle.
    await writeFile(join(staging, 'meta.json'), `${JSON.stringify(input.meta, null, 2)}\n`, 'utf8');
    await rm(directory, { recursive: true, force: true });
    await rename(staging, directory);
    return {
      ok: true,
      value: {
        directory,
        mediaPath: join(directory, 'media.webm'),
        tracePath: join(directory, 'trace.jsonl'),
        metaPath: join(directory, 'meta.json'),
      },
    };
  } catch (cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, error: `cannot write fresh bundle: ${detail}` };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
