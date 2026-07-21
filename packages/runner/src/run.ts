import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type BrowserContext } from '@playwright/test';
import {
  buildDriftReport,
  diffTraces,
  healTrace,
  serializeTrace,
  planReplay,
  reportExitCode,
  type RecordingMeta,
  type TraceEvent,
} from '@cutscene/trace';
import type { DemoConfig } from './config.ts';
import { probeWebm, writeFreshBundle } from './bundle-files.ts';
import { readTraceFile } from './trace-file.ts';
import { replay } from './replay.ts';
import { runSeed } from './process.ts';
import { writeReports } from './report-files.ts';
import { detectStaleness, readGitHead, type StalenessResult } from './staleness.ts';
import { renderOutputs } from './render.ts';

export type RunOptions = { dryRun: boolean; heal?: boolean };

function route(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function systemEvent(source: TraceEvent, input: {
  id: string;
  type: 'system.recordingStart' | 'system.recordingStop' | 'navigation';
  t: number;
  route: string;
}): TraceEvent {
  return {
    v: 1,
    id: input.id,
    t: input.t,
    type: input.type,
    stepId: 'system',
    route: input.route,
    viewport: source.viewport,
    scroll: source.scroll,
  };
}

function clockEvent(source: TraceEvent, id: string, t: number, workerClockMs: number,
  mediaTimeMs: number, currentRoute: string): TraceEvent {
  return {
    v: 1,
    id,
    t,
    type: 'system.clockSync',
    stepId: 'system',
    route: currentRoute,
    viewport: source.viewport,
    scroll: source.scroll,
    contentClockMs: t,
    workerClockMs,
    mediaTimeMs,
  };
}

function unavailableStaleness(): StalenessResult {
  return { v: 1, state: 'unavailable', reason: 'watch paths are not configured' };
}

const editorDist = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'editor', 'dist');

export async function runDemo(demo: DemoConfig, configDir: string,
  options: RunOptions = { dryRun: true }): Promise<0 | 1 | 2> {
  const trace = await readTraceFile(demo.tracePath);
  if (!trace.ok) {
    console.error(`${demo.id}: ${trace.error}`);
    return 2;
  }
  const source = trace.value[0];
  if (source === undefined) {
    console.error(`${demo.id}: trace has no events`);
    return 2;
  }
  const plan = planReplay(trace.value, demo.inputs);
  if (!plan.ok) {
    console.error(`${demo.id}: ${plan.error}`);
    return 2;
  }
  const seeded = await runSeed(demo.seed, configDir);
  if (!seeded.ok) {
    console.error(`${demo.id}: ${seeded.error}`);
    return 2;
  }

  let context: BrowserContext | null = null;
  const videoDirectory = resolve(configDir, '.cutscene', 'capture', demo.id);
  try {
    const browser = await chromium.launch({ headless: true });
    try {
      if (options.dryRun) {
        const page = await browser.newPage();
        await page.goto(demo.baseUrl, { waitUntil: 'domcontentloaded' });
        const run = await replay(page, plan.value);
        const report = buildDriftReport({
          demoId: demo.id,
          trace: demo.tracePath,
          baseUrl: demo.baseUrl,
          plannedSteps: plan.value.steps.length,
          abortedAfterStepId: run.abortedAfterStepId,
          steps: run.steps,
        });
        const written = await writeReports(configDir, report);
        if (!written.ok) {
          console.error(`${demo.id}: ${written.error}`);
          return 2;
        }
        console.log(`${demo.id}: ${written.value}`);
        if (options.heal) {
          const { events, healed } = healTrace(trace.value, report);
          if (healed.length > 0) {
            await writeFile(demo.tracePath, serializeTrace(events), 'utf8');
            for (const step of healed) {
              console.log(`${demo.id}: healed ${step.stepId} ${step.from} -> ${step.to}`);
            }
          }
          // Orphaned steps have no locator left to promote, so a heal run only
          // clears the gate when every drifted step was actually repaired.
          return report.counts.orphaned === 0 && healed.length === report.counts.drifted
            ? 0
            : reportExitCode(report);
        }
        return reportExitCode(report);
      }

      await rm(videoDirectory, { recursive: true, force: true });
      await mkdir(videoDirectory, { recursive: true });
      context = await browser.newContext({
        viewport: { width: source.viewport.width, height: source.viewport.height },
        deviceScaleFactor: source.viewport.dpr,
        recordVideo: {
          dir: videoDirectory,
          size: { width: source.viewport.width, height: source.viewport.height },
        },
      });
      const startedAt = performance.now();
      const sessionEpoch = Date.now();
      const page = await context.newPage();
      const video = page.video();
      await page.goto(demo.baseUrl, { waitUntil: 'domcontentloaded' });
      const initialUrl = page.url();
      const run = await replay(page, plan.value, { reference: trace.value, startedAt });
      const finalUrl = page.url();
      const elapsed = Math.max(1, performance.now() - startedAt);
      const report = buildDriftReport({
        demoId: demo.id,
        trace: demo.tracePath,
        baseUrl: demo.baseUrl,
        plannedSteps: plan.value.steps.length,
        abortedAfterStepId: run.abortedAfterStepId,
        steps: run.steps,
      });
      if (reportExitCode(report) !== 0) {
        const written = await writeReports(configDir, report);
        await context.close();
        context = null;
        if (!written.ok) {
          console.error(`${demo.id}: ${written.error}`);
          return 2;
        }
        console.log(`${demo.id}: ${written.value}`);
        return 1;
      }
      if (video === null) {
        console.error(`${demo.id}: Playwright did not create a recording`);
        return 2;
      }
      await page.waitForTimeout(100);
      await context.close();
      context = null;
      const recordedPath = await video.path();
      const probe = await probeWebm(browser, recordedPath);
      if (!probe.ok) {
        console.error(`${demo.id}: ${probe.error}`);
        return 2;
      }

      const selectors = [...new Set(trace.value
        .filter((event) => event.type === 'annotation.redaction')
        .map((event) => event.selector))];
      const staleness = demo.staleAfterCommits === null
        ? unavailableStaleness()
        : await detectStaleness(configDir, demo.tracePath, demo.watch, demo.staleAfterCommits);
      const commit = staleness.state === 'unavailable' ? await readGitHead(configDir) : staleness.head;
      const endTime = Math.max(elapsed, probe.value.durationMs);
      const freshEvents: TraceEvent[] = [
        systemEvent(source, { id: 'fresh:recording-start', type: 'system.recordingStart', t: 0,
          route: route(initialUrl) }),
        clockEvent(source, 'fresh:clock-start', 0, sessionEpoch, 0, route(initialUrl)),
        systemEvent(source, { id: 'fresh:navigation-start', type: 'navigation', t: 0,
          route: route(initialUrl) }),
        ...run.events,
        clockEvent(source, 'fresh:clock-stop', endTime, Date.now(), probe.value.durationMs, route(finalUrl)),
        systemEvent(source, { id: 'fresh:recording-stop', type: 'system.recordingStop', t: endTime,
          route: route(finalUrl) }),
      ].sort((left, right) => left.t - right.t);
      const meta: RecordingMeta = {
        schemaVersion: 1,
        recordingId: `${demo.id}-${sessionEpoch}`,
        createdAt: new Date(sessionEpoch).toISOString(),
        sessionEpoch,
        url: initialUrl,
        origin: new URL(initialUrl).origin,
        viewport: source.viewport,
        // Playwright's bundled recorder is fixed at 25 fps (videoRecorder.ts).
        capture: { width: probe.value.width, height: probe.value.height, fps: 25 },
        media: { mimeType: 'video/webm', hasAudio: false, durationMs: probe.value.durationMs },
        privacy: {
          maskInputValues: true,
          captureNetwork: false,
          maskedSelectors: [],
          ...(selectors.length === 0 ? {} : { visualRedactionSelectors: selectors }),
        },
        app: { commit, version: null, environment: null },
      };
      const bundle = await writeFreshBundle({
        configDir,
        demoId: demo.id,
        mediaPath: recordedPath,
        events: freshEvents,
        meta,
      });
      if (!bundle.ok) {
        console.error(`${demo.id}: ${bundle.error}`);
        return 2;
      }
      const diff = diffTraces(trace.value, freshEvents);
      const written = await writeReports(configDir, report, { diff, staleness });
      if (!written.ok) {
        console.error(`${demo.id}: ${written.error}`);
        return 2;
      }
      const rendered = await renderOutputs({ configDir, editorDist, bundle: bundle.value, outputs: demo.outputs });
      if (!rendered.ok) {
        console.error(`${demo.id}: ${rendered.error}`);
        return 2;
      }
      console.log(`${demo.id}: ${written.value}`);
      return 0;
    } finally {
      if (context !== null) await context.close().catch(() => undefined);
      await browser.close();
    }
  } catch (cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    console.error(`${demo.id}: browser failed: ${detail}`);
    return 2;
  } finally {
    await rm(videoDirectory, { recursive: true, force: true });
  }
}
