import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDriftReport, formatDriftReport } from '@cutscene/trace';
import { expect, it } from 'vitest';
import { writeReports } from './report-files.ts';

async function missing(path: string): Promise<boolean> {
  try {
    await access(path);
    return false;
  } catch {
    return true;
  }
}

it('writes deterministic text and authoritative JSON without replay values', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cutscene-report-'));
  try {
    const action = {
      eventId: 'input',
      kind: 'fill' as const,
      status: 'matched' as const,
      locatorType: 'label' as const,
      locatorIndex: 0,
      reason: null,
      value: 'do-not-print-this',
    };
    const report = buildDriftReport({
      demoId: 'todo-flow',
      trace: '.cutscene/todo.trace.jsonl',
      baseUrl: 'http://127.0.0.1:4173',
      plannedSteps: 1,
      abortedAfterStepId: null,
      steps: [{ stepId: 'step_1', label: 'Email', actions: [action] }],
    });
    const reportDirectory = join(directory, '.cutscene', 'reports', 'todo-flow');
    await expect(writeReports(directory, report)).resolves.toEqual({ ok: true, value: reportDirectory });
    await expect(writeReports(directory, report)).resolves.toEqual({ ok: true, value: reportDirectory });

    const textPath = join(reportDirectory, 'drift-report.txt');
    const jsonPath = join(reportDirectory, 'drift-report.json');
    const [text, json, textStat, jsonStat] = await Promise.all([
      readFile(textPath, 'utf8'),
      readFile(jsonPath, 'utf8'),
      stat(textPath),
      stat(jsonPath),
    ]);
    expect(text).toBe(formatDriftReport(report));
    expect(json).toBe(`${JSON.stringify(report, null, 2)}\n`);
    expect(`${text}\n${json}`).not.toContain('do-not-print-this');
    expect(jsonStat.mtimeMs).toBeGreaterThanOrEqual(textStat.mtimeMs);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('replaces stale temporary files and removes them after writing', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cutscene-report-'));
  try {
    const report = buildDriftReport({
      demoId: 'todo-flow',
      trace: 'trace.jsonl',
      baseUrl: 'http://127.0.0.1:4173',
      plannedSteps: 0,
      abortedAfterStepId: null,
      steps: [],
    });
    const reportDirectory = join(directory, '.cutscene', 'reports', 'todo-flow');
    const textTemp = join(reportDirectory, `drift-report.txt.${process.pid}.tmp`);
    const jsonTemp = join(reportDirectory, `drift-report.json.${process.pid}.tmp`);
    await mkdir(reportDirectory, { recursive: true });
    await Promise.all([
      writeFile(textTemp, 'stale', 'utf8'),
      writeFile(jsonTemp, 'stale', 'utf8'),
    ]);

    await writeReports(directory, report);

    await expect(Promise.all([missing(textTemp), missing(jsonTemp)])).resolves.toEqual([true, true]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
