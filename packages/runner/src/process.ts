import { spawn } from 'node:child_process';
import type { Result } from '@cutscene/trace';

export function runSeed(command: string | null, cwd: string): Promise<Result<undefined>> {
  if (command === null) {
    return Promise.resolve({ ok: true, value: undefined });
  }

  return new Promise((resolve) => {
    const child = spawn(command, { cwd, shell: true, stdio: 'inherit' });
    child.once('error', (cause) => {
      resolve({ ok: false, error: `seed failed: ${cause.message}` });
    });
    child.once('exit', (code) => {
      resolve(code === 0
        ? { ok: true, value: undefined }
        : { ok: false, error: `seed failed with exit code ${code ?? 'unknown'}` });
    });
  });
}
