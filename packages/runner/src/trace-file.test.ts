import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { readTraceFile } from './trace-file.ts';

const event = {
  v: 1,
  id: 'event_1',
  t: 100,
  type: 'interaction.click',
  stepId: 'step_1',
  route: '/',
  viewport: { width: 1280, height: 720, dpr: 1 },
  scroll: { x: 0, y: 0 },
};

async function withTrace(
  contents: string,
  check: (path: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'cutscene-trace-'));
  const path = join(directory, 'trace.jsonl');
  try {
    await writeFile(path, contents, 'utf8');
    await check(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

it('loads valid JSONL events and skips blank lines', async () => {
  await withTrace(`${JSON.stringify(event)}\n\n`, async (path) => {
    await expect(readTraceFile(path)).resolves.toEqual({ ok: true, value: [event] });
  });
});

it('reports the physical line containing invalid JSON', async () => {
  await withTrace(`${JSON.stringify(event)}\n\n{bad`, async (path) => {
    await expect(readTraceFile(path)).resolves.toEqual({
      ok: false,
      error: 'trace line 3 is invalid JSON',
    });
  });
});

it('reports line-numbered schema errors', async () => {
  await withTrace(`${JSON.stringify(event)}\n${JSON.stringify({ ...event, v: 2 })}\n`, async (path) => {
    await expect(readTraceFile(path)).resolves.toEqual({
      ok: false,
      error: 'trace line 2: trace event must have v: 1',
    });
  });
});

it('rejects an empty trace', async () => {
  await withTrace('\n', async (path) => {
    await expect(readTraceFile(path)).resolves.toEqual({ ok: false, error: 'trace has no events' });
  });
});
