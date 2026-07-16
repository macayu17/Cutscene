import { expect, it } from 'vitest';
import { runSeed } from './process.ts';

const node = `"${process.execPath}"`;

it('skips an omitted seed command', async () => {
  await expect(runSeed(null, process.cwd())).resolves.toEqual({ ok: true, value: undefined });
});

it('returns success for a zero-exit seed', async () => {
  await expect(runSeed(`${node} -e "process.exit(0)"`, process.cwd()))
    .resolves.toEqual({ ok: true, value: undefined });
});

it('returns the exit code for a failed seed', async () => {
  await expect(runSeed(`${node} -e "process.exit(7)"`, process.cwd()))
    .resolves.toEqual({ ok: false, error: 'seed failed with exit code 7' });
});
