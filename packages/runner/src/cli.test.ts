import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ runDemo: vi.fn() }));
vi.mock('./run.ts', () => ({ runDemo: mocks.runDemo }));

import { main } from './cli.ts';

const config = `version: 1
demos:
  - id: matched
    trace: matched.jsonl
    baseUrl: http://127.0.0.1:4173
    outputs:
      - type: docs
        path: docs/matched.md
  - id: drifted
    trace: drifted.jsonl
    baseUrl: http://127.0.0.1:4173
    outputs:
      - type: docs
        path: docs/drifted.md
  - id: failed
    trace: failed.jsonl
    baseUrl: http://127.0.0.1:4173
    outputs:
      - type: docs
        path: docs/failed.md
`;

let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mocks.runDemo.mockReset();
  error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  error.mockRestore();
});

async function withConfig(check: (path: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'cutscene-cli-'));
  const path = join(directory, 'demo.yml');
  try {
    await writeFile(path, config, 'utf8');
    await check(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

it('runs one selected demo and returns its status', async () => {
  await withConfig(async (path) => {
    mocks.runDemo.mockImplementation(async (demo: { id: string }) => {
      if (demo.id === 'matched') return 0;
      return demo.id === 'drifted' ? 1 : 2;
    });

    await expect(main(['--config', path, '--dry-run', '--demo', 'matched'], {})).resolves.toBe(0);
    await expect(main(['--config', path, '--dry-run', '--demo', 'drifted'], {})).resolves.toBe(1);
    await expect(main(['--config', path, '--dry-run', '--demo', 'failed'], {})).resolves.toBe(2);

    expect(mocks.runDemo.mock.calls.map(([demo]) => demo.id)).toEqual(['matched', 'drifted', 'failed']);
  });
});

it('runs every demo sequentially and returns the highest status', async () => {
  await withConfig(async (path) => {
    mocks.runDemo.mockImplementation(async (demo: { id: string }) => {
      if (demo.id === 'matched') return 0;
      return demo.id === 'drifted' ? 1 : 2;
    });

    await expect(main(['--config', path, '--dry-run'], {})).resolves.toBe(2);

    expect(mocks.runDemo.mock.calls.map(([demo]) => demo.id)).toEqual(['matched', 'drifted', 'failed']);
  });
});

it('rejects a missing dry-run flag', async () => {
  await expect(main(['--config', 'demo.yml'], {})).resolves.toBe(2);
  expect(mocks.runDemo).not.toHaveBeenCalled();
});

it('rejects unknown flags and missing option values', async () => {
  await expect(main(['--config', 'demo.yml', '--dry-run', '--unknown'], {})).resolves.toBe(2);
  await expect(main(['--config', '--dry-run'], {})).resolves.toBe(2);
  expect(mocks.runDemo).not.toHaveBeenCalled();
});

it('rejects a demo id that is not configured', async () => {
  await withConfig(async (path) => {
    await expect(main(['--config', path, '--dry-run', '--demo', 'missing'], {})).resolves.toBe(2);
    expect(error).toHaveBeenCalledWith('demo "missing" is not configured');
    expect(mocks.runDemo).not.toHaveBeenCalled();
  });
});
