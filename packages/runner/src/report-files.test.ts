import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDriftReport, diffTraces, formatDriftReport } from '@cutscene/trace';
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

it('writes versioned trace diff and staleness reports without replay values', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cutscene-report-'));
  try {
    const report = buildDriftReport({
      demoId: 'todo-flow', trace: 'trace.jsonl', baseUrl: 'http://127.0.0.1:4173',
      plannedSteps: 0, abortedAfterStepId: null, steps: [],
    });
    const traceEvent = {
      v: 1 as const, id: 'input', t: 1, type: 'interaction.input' as const, stepId: 'step_1', route: '/',
      viewport: { width: 800, height: 600, dpr: 1 }, scroll: { x: 0, y: 0 },
      target: { role: 'textbox', accessibleName: 'Email', text: '', tagName: 'INPUT',
        boundingBox: { x: 1, y: 2, width: 30, height: 20 },
        locators: [{ type: 'label' as const, value: 'Email', confidence: 1 }], value: 'do-not-print-this' },
    };
    const diff = diffTraces([traceEvent], [{ ...traceEvent, id: 'fresh', target: {
      ...traceEvent.target, value: '[MASKED]',
    } }]);
    const staleness = { v: 1 as const, state: 'current' as const, baseline: 'a', head: 'b',
      relevantCommits: 1, threshold: 2 };

    const result = await writeReports(directory, report, { diff, staleness });
    expect(result.ok).toBe(true);
    const reportDirectory = join(directory, '.cutscene', 'reports', 'todo-flow');
    const contents = await Promise.all([
      readFile(join(reportDirectory, 'trace-diff.json'), 'utf8'),
      readFile(join(reportDirectory, 'trace-diff.txt'), 'utf8'),
      readFile(join(reportDirectory, 'staleness.json'), 'utf8'),
    ]);
    expect(JSON.parse(contents[0])).toEqual(diff);
    expect(JSON.parse(contents[2])).toEqual(staleness);
    expect(contents.join('\n')).not.toContain('do-not-print-this');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
