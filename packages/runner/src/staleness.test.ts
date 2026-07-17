import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { detectStaleness, readGitHead } from './staleness.ts';

const execute = promisify(execFile);

async function git(directory: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execute('git', args, { cwd: directory });
  return stdout.trim();
}

async function commit(directory: string, path: string, contents: string, message: string): Promise<string> {
  await writeFile(join(directory, path), contents, 'utf8');
  await git(directory, ['add', '--', path]);
  await git(directory, ['commit', '-m', message]);
  return git(directory, ['rev-parse', 'HEAD']);
}

async function withRepository(
  check: (fixture: { directory: string; tracePath: string; baseline: string }) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'cutscene-staleness-'));
  const tracePath = join(directory, '.cutscene', 'demo.trace.jsonl');
  try {
    await git(directory, ['init']);
    await git(directory, ['config', 'user.email', 'cutscene@example.test']);
    await git(directory, ['config', 'user.name', 'Cutscene Test']);
    await mkdir(join(directory, '.cutscene'), { recursive: true });
    await mkdir(join(directory, 'packages', 'app'), { recursive: true });
    await writeFile(tracePath, '{}\n', 'utf8');
    await writeFile(join(directory, 'packages', 'app', 'route.ts'), 'export const route = 0;\n', 'utf8');
    await writeFile(join(directory, 'README.md'), 'baseline\n', 'utf8');
    await git(directory, ['add', '.']);
    await git(directory, ['commit', '-m', 'record demo']);
    const baseline = await git(directory, ['rev-parse', 'HEAD']);
    await check({ directory, tracePath, baseline });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

it('counts relevant commits, ignores unrelated paths, and stays current at the threshold', { timeout: 15_000 }, async () => {
  await withRepository(async ({ directory, tracePath, baseline }) => {
    await commit(directory, 'packages/app/route.ts', 'export const route = 1;\n', 'change route once');
    await commit(directory, 'README.md', 'unrelated\n', 'change docs');
    const head = await commit(
      directory,
      'packages/app/route.ts',
      'export const route = 2;\n',
      'change route twice',
    );

    await expect(detectStaleness(directory, tracePath, ['packages/app/**'], 2)).resolves.toEqual({
      v: 1,
      state: 'current',
      baseline,
      head,
      relevantCommits: 2,
      threshold: 2,
    });
  });
});

it('becomes stale only when relevant commits exceed the threshold', { timeout: 15_000 }, async () => {
  await withRepository(async ({ directory, tracePath, baseline }) => {
    await commit(directory, 'packages/app/route.ts', 'export const route = 1;\n', 'change route once');
    const head = await commit(
      directory,
      'packages/app/route.ts',
      'export const route = 2;\n',
      'change route twice',
    );

    await expect(detectStaleness(directory, tracePath, ['packages/app/**'], 1)).resolves.toEqual({
      v: 1,
      state: 'stale',
      baseline,
      head,
      relevantCommits: 2,
      threshold: 1,
    });
  });
});

it('reports an untracked trace as unavailable', { timeout: 15_000 }, async () => {
  await withRepository(async ({ directory }) => {
    const tracePath = join(directory, '.cutscene', 'untracked.trace.jsonl');
    await writeFile(tracePath, '{}\n', 'utf8');

    await expect(detectStaleness(directory, tracePath, ['packages/app/**'], 1)).resolves.toEqual({
      v: 1,
      state: 'unavailable',
      reason: 'trace is not tracked by Git',
    });
  });
});

it('reports a non-Git directory as unavailable', { timeout: 15_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cutscene-staleness-no-git-'));
  try {
    await expect(detectStaleness(directory, join(directory, 'trace.jsonl'), [], 1)).resolves.toEqual({
      v: 1,
      state: 'unavailable',
      reason: 'config directory is not in a Git repository',
    });
    await expect(readGitHead(directory)).resolves.toBeNull();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
