import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { formatDriftReport, type DriftReport, type Result } from '@cutscene/trace';

async function replace(path: string, contents: string): Promise<void> {
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, contents, 'utf8');
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function writeReports(
  configDir: string,
  report: DriftReport,
): Promise<Result<string>> {
  const directory = join(configDir, '.cutscene', 'reports', report.demoId);
  try {
    await mkdir(directory, { recursive: true });
    await replace(join(directory, 'drift-report.txt'), formatDriftReport(report));
    await replace(join(directory, 'drift-report.json'), `${JSON.stringify(report, null, 2)}\n`);
    return { ok: true, value: directory };
  } catch (cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, error: `cannot write drift report: ${detail}` };
  }
}
