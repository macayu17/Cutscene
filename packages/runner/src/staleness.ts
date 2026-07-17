import { execFile } from 'node:child_process';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

export type StalenessResult =
  | { v: 1; state: 'unavailable'; reason: string }
  | {
    v: 1;
    state: 'current' | 'stale';
    baseline: string;
    head: string;
    relevantCommits: number;
    threshold: number;
  };

const execute = promisify(execFile);

async function git(directory: string, args: readonly string[]): Promise<string | null> {
  try {
    const { stdout } = await execute('git', args, { cwd: directory });
    return stdout.trim();
  } catch {
    return null;
  }
}

export function readGitHead(directory: string): Promise<string | null> {
  return git(directory, ['rev-parse', 'HEAD']);
}

export async function detectStaleness(
  configDir: string,
  tracePath: string,
  watch: readonly string[],
  threshold: number,
): Promise<StalenessResult> {
  const root = await git(configDir, ['rev-parse', '--show-toplevel']);
  if (root === null) {
    return { v: 1, state: 'unavailable', reason: 'config directory is not in a Git repository' };
  }

  const relativeTrace = relative(root, resolve(configDir, tracePath));
  if (relativeTrace === '..' || relativeTrace.startsWith(`..${sep}`) || isAbsolute(relativeTrace)) {
    return { v: 1, state: 'unavailable', reason: 'trace is outside the Git repository' };
  }

  const baseline = await git(root, [
    'log',
    '-1',
    '--format=%H',
    '--',
    relativeTrace.split(sep).join('/'),
  ]);
  if (!baseline) {
    return { v: 1, state: 'unavailable', reason: 'trace is not tracked by Git' };
  }

  const head = await git(root, ['rev-parse', 'HEAD']);
  const count = await git(root, ['rev-list', '--count', `${baseline}..HEAD`, '--', ...watch]);
  const relevantCommits = count === null ? Number.NaN : Number(count);
  if (head === null || !Number.isInteger(relevantCommits)) {
    return { v: 1, state: 'unavailable', reason: 'Git history is unavailable' };
  }

  return {
    v: 1,
    state: relevantCommits > threshold ? 'stale' : 'current',
    baseline,
    head,
    relevantCommits,
    threshold,
  };
}
