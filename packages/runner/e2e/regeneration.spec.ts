import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Locator } from '@cutscene/trace';
import { expect, test } from '@playwright/test';

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const secret = 'local-e2e-secret';
const box = { x: 10, y: 10, width: 100, height: 30 };

function event(
  id: string,
  stepId: string,
  type: 'interaction.click' | 'interaction.input' | 'interaction.keypress',
  name: string,
  locators: Locator[],
  value?: string,
): string {
  return JSON.stringify({
    v: 1,
    id,
    t: Number(stepId.slice(-1)) * 100,
    type,
    stepId,
    route: '/',
    viewport: { width: 800, height: 600, dpr: 1 },
    scroll: { x: 0, y: 0 },
    target: {
      role: type === 'interaction.click' ? 'button' : 'textbox',
      accessibleName: name,
      text: name,
      tagName: type === 'interaction.click' ? 'BUTTON' : 'INPUT',
      boundingBox: box,
      locators,
      ...(value === undefined ? {} : { value }),
    },
    ...(type === 'interaction.keypress' ? { key: 'Enter' } : {}),
  });
}

function runCli(configPath: string, cwd: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(packageDirectory, 'src', 'cli.ts'),
      '--config', configPath, '--dry-run'], {
      cwd,
      env: { ...process.env, DEMO_VALUE: secret },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.once('error', reject);
    child.once('exit', (code) => resolve({ code, stdout, stderr }));
  });
}

test('the real CLI reports matched, drifted, and orphaned steps without input values', async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html>
      <button data-testid="primary">Primary</button>
      <button aria-label="Recovered">Recovered</button>
      <input aria-label="Private value">
    `);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    server.close();
    throw new Error('fixture server did not expose a TCP port');
  }

  const directory = await mkdtemp(join(tmpdir(), 'cutscene-e2e-'));
  try {
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const trace = [
      event('primary', 'step_1', 'interaction.click', 'Primary', [
        { type: 'testId', value: 'primary', confidence: 1 },
      ]),
      event('recovered', 'step_2', 'interaction.click', 'Recovered', [
        { type: 'testId', value: 'old-recovered', confidence: 1 },
        { type: 'role', role: 'button', name: 'Recovered', confidence: 0.9 },
      ]),
      event('private', 'step_3', 'interaction.input', 'Private value', [
        { type: 'label', value: 'Private value', confidence: 1 },
      ], '[MASKED]'),
      event('submit-private', 'step_3', 'interaction.keypress', 'Private value', [
        { type: 'label', value: 'Private value', confidence: 1 },
      ]),
      event('removed', 'step_4', 'interaction.click', 'Removed', [
        { type: 'testId', value: 'removed', confidence: 1 },
      ]),
    ].join('\n');
    const configPath = join(directory, 'demo.yml');
    await writeFile(join(directory, 'trace.jsonl'), `${trace}\n`, 'utf8');
    await writeFile(configPath, `version: 1
demos:
  - id: local-proof
    trace: trace.jsonl
    baseUrl: ${baseUrl}
    inputs:
      step_3: \${{ env.DEMO_VALUE }}
    outputs:
      - type: docs
        path: docs/proof.md
`, 'utf8');

    const result = await runCli(configPath, directory);
    expect(result.code, result.stderr).toBe(1);

    const reportDirectory = join(directory, '.cutscene', 'reports', 'local-proof');
    const [json, text] = await Promise.all([
      readFile(join(reportDirectory, 'drift-report.json'), 'utf8'),
      readFile(join(reportDirectory, 'drift-report.txt'), 'utf8'),
    ]);
    const report = JSON.parse(json) as {
      counts: unknown;
      abortedAfterStepId: unknown;
      steps: Array<{ actions: Array<{ locatorType: unknown; locatorIndex: unknown }> }>;
    };
    expect(report.counts).toEqual({ matched: 2, drifted: 1, orphaned: 1 });
    expect(report.abortedAfterStepId).toBe('step_4');
    expect(report.steps.map((step) => step.actions[0])).toMatchObject([
      { locatorType: 'testId', locatorIndex: 0 },
      { locatorType: 'role', locatorIndex: 1 },
      { locatorType: 'label', locatorIndex: 0 },
      { locatorType: null, locatorIndex: null },
    ]);
    expect(report.steps[2]?.actions).toMatchObject([
      { kind: 'fill', locatorType: 'label', locatorIndex: 0 },
      { kind: 'press', locatorType: 'label', locatorIndex: 0 },
    ]);
    expect(`${json}\n${text}\n${result.stdout}\n${result.stderr}`).not.toContain(secret);
  } finally {
    await rm(directory, { recursive: true, force: true });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
