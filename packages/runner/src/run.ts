import { chromium } from '@playwright/test';
import { buildDriftReport, planReplay, reportExitCode } from '@cutscene/trace';
import type { DemoConfig } from './config.ts';
import { readTraceFile } from './trace-file.ts';
import { replay } from './replay.ts';
import { runSeed } from './process.ts';
import { writeReports } from './report-files.ts';

export async function runDemo(demo: DemoConfig, configDir: string): Promise<0 | 1 | 2> {
  const trace = await readTraceFile(demo.tracePath);
  if (!trace.ok) {
    console.error(`${demo.id}: ${trace.error}`);
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

  try {
    const browser = await chromium.launch({ headless: true });
    try {
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
      return reportExitCode(report);
    } finally {
      await browser.close();
    }
  } catch (cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    console.error(`${demo.id}: browser failed: ${detail}`);
    return 2;
  }
}
