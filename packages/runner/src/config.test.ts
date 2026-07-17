import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { parseRunnerConfig } from './config.ts';

const valid = `version: 1
demos:
  - id: todo-flow
    trace: .cutscene/todo.trace.jsonl
    baseUrl: \${{ env.PREVIEW_URL }}
    seed: pnpm run seed:demo
    inputs:
      step_0001: \${{ env.DEMO_TODO }}
    outputs:
      - type: gif
        path: docs/assets/todo.gif
        width: 800
`;

const environment = {
  PREVIEW_URL: 'http://127.0.0.1:4173',
  DEMO_TODO: 'private value',
};

it('parses version 1 and resolves exact environment references', () => {
  const result = parseRunnerConfig(valid, 'C:/repo/demo.yml', environment);

  expect(result).toEqual({ ok: true, value: {
    version: 1,
    configDir: resolve('C:/repo'),
    demos: [{
      id: 'todo-flow',
      tracePath: resolve('C:/repo/.cutscene/todo.trace.jsonl'),
      baseUrl: 'http://127.0.0.1:4173',
      seed: 'pnpm run seed:demo',
      inputs: { step_0001: 'private value' },
      watch: [],
      staleAfterCommits: null,
      outputs: [{ type: 'gif', path: resolve('C:/repo/docs/assets/todo.gif'), width: 800 }],
    }],
  } });
});

it('parses paired staleness fields', () => {
  const source = valid.replace('    outputs:', `    watch:
      - packages/app/src/routes/analytics/**
    staleAfterCommits: 10
    outputs:`);

  expect(parseRunnerConfig(source, 'C:/repo/demo.yml', environment)).toMatchObject({
    ok: true,
    value: { demos: [{
      watch: ['packages/app/src/routes/analytics/**'],
      staleAfterCommits: 10,
    }] },
  });
});

it.each([
  [valid.replace('    outputs:', '    staleAfterCommits: 10\n    outputs:'),
    'demos[0].watch and staleAfterCommits must be provided together'],
  [valid.replace('    outputs:', '    watch: []\n    staleAfterCommits: 10\n    outputs:'),
    'demos[0].watch must be a non-empty array of repository-relative paths'],
  [valid.replace('    outputs:', '    watch:\n      - ../app/**\n    staleAfterCommits: 10\n    outputs:'),
    'demos[0].watch must be a non-empty array of repository-relative paths'],
  [valid.replace('    outputs:', '    watch:\n      - packages/app/**\n    staleAfterCommits: 0\n    outputs:'),
    'demos[0].staleAfterCommits must be a positive integer'],
  [valid.replace('docs/assets/todo.gif', '../todo.gif'),
    'demos[0].outputs[0].path must stay within config directory'],
])('rejects invalid local-regeneration configuration', (source, message) => {
  expect(parseRunnerConfig(source, 'C:/repo/demo.yml', environment)).toEqual({ ok: false, error: message });
});

it('rejects unknown keys', () => {
  expect(parseRunnerConfig(`${valid}extra: true\n`, 'C:/repo/demo.yml', environment))
    .toEqual({ ok: false, error: 'config has unknown key "extra"' });
});

it('rejects duplicate demo ids', () => {
  const duplicate = valid.replace(/\n$/, `
  - id: todo-flow
    trace: second.jsonl
    baseUrl: http://127.0.0.1:4174
    outputs:
      - type: docs
        path: docs/second.md
`);
  expect(parseRunnerConfig(duplicate, 'C:/repo/demo.yml', environment))
    .toEqual({ ok: false, error: 'duplicate demo id "todo-flow"' });
});

it('rejects a non-HTTP base URL after environment resolution', () => {
  expect(parseRunnerConfig(valid, 'C:/repo/demo.yml', {
    ...environment, PREVIEW_URL: 'file:///tmp/demo',
  })).toEqual({ ok: false, error: 'demos[0].baseUrl must use HTTP or HTTPS' });
});

it('rejects a missing environment variable without starting work', () => {
  expect(parseRunnerConfig(valid, 'C:/repo/demo.yml', { PREVIEW_URL: environment.PREVIEW_URL }))
    .toEqual({ ok: false, error: 'demos[0].inputs.step_0001 requires environment variable DEMO_TODO' });
});

it('rejects partial environment expressions', () => {
  const source = valid.replace('\${{ env.PREVIEW_URL }}', 'http://\${{ env.HOST }}');
  expect(parseRunnerConfig(source, 'C:/repo/demo.yml', environment)).toEqual({
    ok: false,
    error: 'demos[0].baseUrl environment reference must occupy the whole value',
  });
});

it('rejects invalid output widths', () => {
  expect(parseRunnerConfig(valid.replace('width: 800', 'width: 0'), 'C:/repo/demo.yml', environment))
    .toEqual({ ok: false, error: 'demos[0].outputs[0].width must be a positive integer' });
});

it('does not include a resolved input value in errors', () => {
  const result = parseRunnerConfig(valid.replace('step_0001:', 'bad step:'), 'C:/repo/demo.yml', {
    ...environment, DEMO_TODO: 'do-not-print-this',
  });

  expect(result.ok).toBe(false);
  expect(JSON.stringify(result)).not.toContain('do-not-print-this');
});
