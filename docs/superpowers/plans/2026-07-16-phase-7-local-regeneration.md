# Phase 7 Local Regeneration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local `demo.yml` dry-run command that replays trace steps with ranked Playwright locators and emits deterministic drift reports.

**Architecture:** Pure replay planning and drift-report construction live in `packages/trace`. A new Node-only `packages/runner` package owns strict YAML configuration, seed execution, Playwright, filesystem output, and the CLI. The first slice never renders artifacts, starts hosted CI, or opens a pull request.

**Tech Stack:** TypeScript strict mode, Node 22, `yaml`, `@playwright/test`, Vitest, pnpm.

---

## File map

- `packages/trace/src/regeneration.ts`: browser-free replay plan and report model.
- `packages/trace/src/regeneration.test.ts`: plan and report unit coverage.
- `packages/trace/src/index.ts`: public regeneration exports.
- `packages/runner/src/config.ts`: strict `demo.yml` parsing and environment resolution.
- `packages/runner/src/config.test.ts`: configuration and secret-handling tests.
- `packages/runner/src/trace-file.ts`: strict JSONL loading.
- `packages/runner/src/trace-file.test.ts`: invalid-line and valid-trace tests.
- `packages/runner/src/replay.ts`: Playwright locator resolution and action execution.
- `packages/runner/src/report-files.ts`: deterministic, temporary-file report writes.
- `packages/runner/src/process.ts`: trusted local seed command execution.
- `packages/runner/src/run.ts`: per-demo orchestration.
- `packages/runner/src/cli.ts`: arguments, stderr, and exit code boundary.
- `packages/runner/src/cli.test.ts`: argument and aggregate exit-code tests.
- `packages/runner/e2e/regeneration.spec.ts`: local HTTP fixture and real CLI proof.
- `packages/runner/playwright.config.ts`: isolated runner E2E configuration.
- `packages/runner/package.json`, `packages/runner/tsconfig.json`: package definition.
- `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `package.json`: workspace, lock, and root E2E wiring.
- `README.md`, `STATUS.md`: user command and measured Phase 7 progress.

### Task 1: Create the runner package and strict configuration parser

**Files:**
- Modify: `pnpm-workspace.yaml`
- Create: `packages/runner/package.json`
- Create: `packages/runner/tsconfig.json`
- Create: `packages/runner/src/config.test.ts`
- Create: `packages/runner/src/config.ts`
- Modify mechanically: `pnpm-lock.yaml`

- [ ] **Step 1: Add the runner workspace entry and package manifests**

Add `packages/runner` to `pnpm-workspace.yaml`. Create `packages/runner/package.json`:

```json
{
  "name": "@cutscene/runner",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": { "cutscene-regenerate": "src/cli.ts" },
  "scripts": {
    "regenerate": "node src/cli.ts",
    "test": "vitest run src",
    "typecheck": "tsc --noEmit",
    "e2e": "playwright test"
  },
  "dependencies": {
    "@cutscene/trace": "workspace:*",
    "@playwright/test": "^1.61.1",
    "yaml": "^2.8.1"
  },
  "devDependencies": { "@types/node": "^24.13.3" }
}
```

Create `packages/runner/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "types": ["node", "vitest/globals"],
    "noEmit": true
  },
  "include": ["src", "e2e", "playwright.config.ts"]
}
```

- [ ] **Step 2: Write failing configuration tests**

Create `packages/runner/src/config.test.ts` with cases for the PRD example, duplicate IDs, unknown keys, malformed URLs, missing environment variables, partial environment expressions, invalid output widths, and secret non-disclosure:

```ts
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

it('parses version 1 and resolves exact environment references', () => {
  const result = parseRunnerConfig(valid, 'C:/repo/demo.yml', {
    PREVIEW_URL: 'http://127.0.0.1:4173', DEMO_TODO: 'private value',
  });
  expect(result).toMatchObject({ ok: true, value: { version: 1, demos: [{
    id: 'todo-flow', baseUrl: 'http://127.0.0.1:4173', inputs: { step_0001: 'private value' },
  }] } });
});

it.each([
  ['version: 2\ndemos: []', 'config must have version: 1'],
  ['version: 1\ndemos: []\nextra: true', 'config has unknown key "extra"'],
  [valid.replace('width: 800', 'width: 0'), 'output width must be a positive integer'],
])('rejects invalid configuration', (source, message) => {
  const result = parseRunnerConfig(source, 'C:/repo/demo.yml', {
    PREVIEW_URL: 'http://127.0.0.1:4173', DEMO_TODO: 'private value',
  });
  expect(result).toEqual({ ok: false, error: message });
});

it('rejects a non-HTTP base URL after environment resolution', () => {
  expect(parseRunnerConfig(valid, 'C:/repo/demo.yml', {
    PREVIEW_URL: 'file:///tmp/demo', DEMO_TODO: 'private value',
  })).toEqual({ ok: false, error: 'baseUrl must use HTTP or HTTPS' });
});

it('does not include a resolved secret in errors', () => {
  const result = parseRunnerConfig(valid.replace('step_0001:', 'bad step:'), 'C:/repo/demo.yml', {
    PREVIEW_URL: 'http://127.0.0.1:4173', DEMO_TODO: 'do-not-print-this',
  });
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result)).not.toContain('do-not-print-this');
});
```

- [ ] **Step 3: Run the test and verify the red state**

Run:

```powershell
pnpm --filter @cutscene/runner test -- config.test.ts
```

Expected: FAIL because `src/config.ts` does not exist.

- [ ] **Step 4: Implement the strict parser**

Create `packages/runner/src/config.ts` with these public types and entry point:

```ts
import { dirname, resolve } from 'node:path';
import { parse } from 'yaml';
import type { Result } from '@cutscene/trace';

export type DemoOutput = { type: 'gif' | 'mp4' | 'docs'; path: string; width?: number };
export type DemoConfig = {
  id: string;
  tracePath: string;
  baseUrl: string;
  seed: string | null;
  inputs: Readonly<Record<string, string>>;
  outputs: readonly DemoOutput[];
};
export type RunnerConfig = { version: 1; configDir: string; demos: readonly DemoConfig[] };

const TOP_KEYS = new Set(['version', 'demos']);
const DEMO_KEYS = new Set(['id', 'trace', 'baseUrl', 'seed', 'inputs', 'outputs']);
const OUTPUT_KEYS = new Set(['type', 'path', 'width']);
const ENV = /^\$\{\{\s*env\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unknownKey(value: Record<string, unknown>, allowed: ReadonlySet<string>): string | null {
  return Object.keys(value).find((key) => !allowed.has(key)) ?? null;
}

function scalar(value: unknown, env: Readonly<Record<string, string | undefined>>,
  field: string): Result<string> {
  if (typeof value !== 'string') return { ok: false, error: `${field} must be a string` };
  const match = ENV.exec(value);
  if (!match) return value.includes('${{')
    ? { ok: false, error: `${field} environment reference must occupy the whole value` }
    : { ok: true, value };
  const name = match[1];
  const resolved = name ? env[name] : undefined;
  return resolved === undefined
    ? { ok: false, error: `${field} requires environment variable ${name ?? ''}` }
    : { ok: true, value: resolved };
}

export function parseRunnerConfig(source: string, configPath: string,
  env: Readonly<Record<string, string | undefined>>): Result<RunnerConfig> {
  let input: unknown;
  try { input = parse(source, { maxAliasCount: 0, uniqueKeys: true }); }
  catch (cause: unknown) { return { ok: false, error: `demo.yml is invalid: ${cause instanceof Error ? cause.message : String(cause)}` }; }
  if (!record(input) || input.version !== 1) return { ok: false, error: 'config must have version: 1' };
  const topUnknown = unknownKey(input, TOP_KEYS);
  if (topUnknown) return { ok: false, error: `config has unknown key "${topUnknown}"` };
  if (!Array.isArray(input.demos) || input.demos.length === 0) return { ok: false, error: 'config demos must be a non-empty array' };

  const configDir = dirname(resolve(configPath));
  const ids = new Set<string>();
  const demos: DemoConfig[] = [];
  for (const [index, value] of input.demos.entries()) {
    const field = `demos[${index}]`;
    if (!record(value)) return { ok: false, error: `${field} must be an object` };
    const demoUnknown = unknownKey(value, DEMO_KEYS);
    if (demoUnknown) return { ok: false, error: `${field} has unknown key "${demoUnknown}"` };
    if (typeof value.id !== 'string' || !ID.test(value.id)) return { ok: false, error: `${field}.id is invalid` };
    if (ids.has(value.id)) return { ok: false, error: `duplicate demo id "${value.id}"` };
    ids.add(value.id);
    if (typeof value.trace !== 'string' || value.trace.length === 0) return { ok: false, error: `${field}.trace must be a path` };
    const baseUrl = scalar(value.baseUrl, env, `${field}.baseUrl`);
    if (!baseUrl.ok) return baseUrl;
    try { const url = new URL(baseUrl.value); if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(); }
    catch { return { ok: false, error: 'baseUrl must use HTTP or HTTPS' }; }
    if (value.seed !== undefined && typeof value.seed !== 'string') return { ok: false, error: `${field}.seed must be a string` };

    const inputs: Record<string, string> = {};
    if (value.inputs !== undefined) {
      if (!record(value.inputs)) return { ok: false, error: `${field}.inputs must be an object` };
      for (const [stepId, raw] of Object.entries(value.inputs)) {
        if (!ID.test(stepId)) return { ok: false, error: `${field}.inputs has invalid step id "${stepId}"` };
        const resolved = scalar(raw, env, `${field}.inputs.${stepId}`);
        if (!resolved.ok) return resolved;
        inputs[stepId] = resolved.value;
      }
    }

    if (!Array.isArray(value.outputs) || value.outputs.length === 0) return { ok: false, error: `${field}.outputs must be a non-empty array` };
    const outputs: DemoOutput[] = [];
    for (const [outputIndex, output] of value.outputs.entries()) {
      const outputField = `${field}.outputs[${outputIndex}]`;
      if (!record(output)) return { ok: false, error: `${outputField} must be an object` };
      const outputUnknown = unknownKey(output, OUTPUT_KEYS);
      if (outputUnknown) return { ok: false, error: `${outputField} has unknown key "${outputUnknown}"` };
      if (output.type !== 'gif' && output.type !== 'mp4' && output.type !== 'docs') return { ok: false, error: `${outputField}.type is invalid` };
      if (typeof output.path !== 'string' || output.path.length === 0) return { ok: false, error: `${outputField}.path must be a path` };
      if (output.width !== undefined && (!Number.isInteger(output.width) || output.width <= 0)) return { ok: false, error: 'output width must be a positive integer' };
      outputs.push(output.width === undefined ? { type: output.type, path: output.path }
        : { type: output.type, path: output.path, width: output.width });
    }
    demos.push({ id: value.id, tracePath: resolve(configDir, value.trace), baseUrl: baseUrl.value,
      seed: typeof value.seed === 'string' && value.seed.length > 0 ? value.seed : null, inputs, outputs });
  }
  return { ok: true, value: { version: 1, configDir, demos } };
}
```

- [ ] **Step 5: Install and verify**

Run:

```powershell
pnpm install
pnpm --filter @cutscene/runner test -- config.test.ts
pnpm --filter @cutscene/runner typecheck
```

Expected: configuration tests pass; runner typecheck passes.

- [ ] **Step 6: Commit**

```powershell
git add pnpm-workspace.yaml pnpm-lock.yaml packages/runner
git commit -m "feat(runner): parse demo configuration"
```

### Task 2: Add pure replay planning

**Files:**
- Create: `packages/trace/src/regeneration.test.ts`
- Create: `packages/trace/src/regeneration.ts`
- Modify: `packages/trace/src/index.ts`

- [ ] **Step 1: Write failing replay-plan tests**

Cover a primary click, a masked fill override, paired checkbox input suppression, a distinct fill before a click, missing masked input, two click events in one step, and recorded keypress rejection. Use this contract:

```ts
import { expect, it } from 'vitest';
import { planReplay } from './regeneration.ts';
import type { TargetDescriptor, TraceEvent } from './schema.ts';

const box = { x: 1, y: 2, width: 30, height: 20 };
function target(name: string, value?: string): TargetDescriptor {
  return { role: 'button', accessibleName: name, text: name, tagName: 'BUTTON', boundingBox: box,
    locators: [{ type: 'testId', value: name.toLowerCase(), confidence: 1 }], ...(value === undefined ? {} : { value }) };
}
function event(id: string, stepId: string, type: TraceEvent['type'], targetValue?: TargetDescriptor): TraceEvent {
  return { v: 1, id, t: 1, type, stepId, route: '/', viewport: { width: 100, height: 100, dpr: 1 },
    scroll: { x: 0, y: 0 }, ...(targetValue ? { target: targetValue } : {}) } as TraceEvent;
}

it('uses a configured value for a masked input without putting it in labels', () => {
  const result = planReplay([event('input', 'step_1', 'interaction.input', target('Email', '[MASKED]'))],
    { step_1: 'secret@example.com' });
  expect(result).toMatchObject({ ok: true, value: { steps: [{ stepId: 'step_1', label: 'Email',
    actions: [{ kind: 'fill', value: 'secret@example.com' }] }] } });
  expect(result.ok && result.value.steps[0]?.label).not.toContain('secret@example.com');
});

it('rejects a recorded keypress because version 1 has no key detail', () => {
  expect(planReplay([event('key', 'step_1', 'interaction.keypress')], {})).toEqual({
    ok: false, error: 'step step_1 contains an unsupported keypress event',
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

```powershell
pnpm --filter @cutscene/trace test -- regeneration.test.ts
```

Expected: FAIL because `regeneration.ts` does not exist.

- [ ] **Step 3: Implement `planReplay`**

Create `packages/trace/src/regeneration.ts`:

```ts
import type { Locator, Result, TargetDescriptor, TraceEvent } from './schema.ts';

export type ReplayAction =
  | { eventId: string; kind: 'click'; target: TargetDescriptor | null }
  | { eventId: string; kind: 'fill'; target: TargetDescriptor | null; value: string };
export type ReplayStep = { stepId: string; label: string; actions: readonly ReplayAction[] };
export type ReplayPlan = { steps: readonly ReplayStep[] };

function identity(target: TargetDescriptor | undefined): string {
  return target ? JSON.stringify(target.locators) : '';
}

function label(target: TargetDescriptor | undefined, stepId: string): string {
  return target?.accessibleName || target?.role || target?.tagName || stepId;
}

export function planReplay(events: readonly TraceEvent[], inputs: Readonly<Record<string, string>>): Result<ReplayPlan> {
  const grouped = new Map<string, TraceEvent[]>();
  for (const event of events) {
    if (event.type !== 'interaction.click' && event.type !== 'interaction.input' &&
        event.type !== 'interaction.keypress') continue;
    const group = grouped.get(event.stepId) ?? [];
    group.push(event);
    grouped.set(event.stepId, group);
  }

  const steps: ReplayStep[] = [];
  for (const [stepId, group] of grouped) {
    if (group.some((event) => event.type === 'interaction.keypress')) return {
      ok: false, error: `step ${stepId} contains an unsupported keypress event`,
    };
    const clicks = group.filter((event) => event.type === 'interaction.click');
    if (clicks.length > 1) return { ok: false, error: `step ${stepId} contains multiple click events` };
    const inputEvents = group.filter((event) => event.type === 'interaction.input');
    const click = clicks[0];
    const clickIdentity = identity(click?.target);
    const distinctInputs = new Map<string, TraceEvent>();
    for (const input of inputEvents) {
      const inputIdentity = identity(input.target);
      if (click && inputIdentity === clickIdentity) continue;
      distinctInputs.set(inputIdentity, input);
    }
    if (distinctInputs.size > 1) return { ok: false, error: `step ${stepId} contains multiple input targets` };

    const actions: ReplayAction[] = [];
    const input = [...distinctInputs.values()][0];
    if (input) {
      const captured = input.target?.value;
      const value = inputs[stepId] ?? captured;
      if (value === undefined || value === '[MASKED]') return {
        ok: false, error: `step ${stepId} requires an input override`,
      };
      actions.push({ eventId: input.id, kind: 'fill', target: input.target ?? null, value });
    }
    if (click) actions.push({ eventId: click.id, kind: 'click', target: click.target ?? null });
    if (actions.length > 0) {
      const primary = click?.target ?? input?.target;
      steps.push({ stepId, label: label(primary, stepId), actions });
    }
  }
  return { ok: true, value: { steps } };
}

export type ActionResult = {
  eventId: string;
  kind: ReplayAction['kind'];
  status: 'matched' | 'drifted' | 'orphaned';
  locatorType: Locator['type'] | null;
  locatorIndex: number | null;
  reason: string | null;
};
```

Export it from `packages/trace/src/index.ts`:

```ts
export * from './regeneration.ts';
```

- [ ] **Step 4: Run trace tests and typecheck**

```powershell
pnpm --filter @cutscene/trace test
pnpm --filter @cutscene/trace typecheck
```

Expected: all trace tests pass.

- [ ] **Step 5: Commit**

```powershell
git add packages/trace/src/regeneration.ts packages/trace/src/regeneration.test.ts packages/trace/src/index.ts
git commit -m "feat(trace): plan deterministic replay steps"
```

### Task 3: Add drift-report construction and formatting

**Files:**
- Modify: `packages/trace/src/regeneration.test.ts`
- Modify: `packages/trace/src/regeneration.ts`

- [ ] **Step 1: Add failing report tests**

Add tests proving aggregate status, abort metadata, deterministic text, and no action value leakage:

```ts
import { buildDriftReport, formatDriftReport, reportExitCode } from './regeneration.ts';

it('aggregates action outcomes and formats the PRD drift summary', () => {
  const report = buildDriftReport({ demoId: 'todo-flow', trace: '.cutscene/todo.trace.jsonl',
    baseUrl: 'http://127.0.0.1:4173', plannedSteps: 3, abortedAfterStepId: 'step_3', steps: [
      { stepId: 'step_1', label: 'Save', actions: [{ eventId: 'a', kind: 'click', status: 'matched',
        locatorType: 'testId', locatorIndex: 0, reason: null }] },
      { stepId: 'step_2', label: 'Export', actions: [{ eventId: 'b', kind: 'click', status: 'drifted',
        locatorType: 'role', locatorIndex: 1, reason: null }] },
      { stepId: 'step_3', label: 'Removed', actions: [{ eventId: 'c', kind: 'click', status: 'orphaned',
        locatorType: null, locatorIndex: null, reason: 'no locator resolved' }] },
    ] });
  expect(report).toMatchObject({ v: 1, counts: { matched: 1, drifted: 1, orphaned: 1 },
    plannedSteps: 3, evaluatedSteps: 3, abortedAfterStepId: 'step_3' });
  expect(formatDriftReport(report)).toContain('1 step drifted    Export');
  expect(reportExitCode(report)).toBe(1);
});
```

- [ ] **Step 2: Run the focused test and verify failure**

```powershell
pnpm --filter @cutscene/trace test -- regeneration.test.ts
```

Expected: FAIL because report functions are missing.

- [ ] **Step 3: Implement report functions**

Append to `packages/trace/src/regeneration.ts`:

```ts
export type DriftStep = { stepId: string; label: string; actions: readonly ActionResult[] };
export type DriftReport = {
  v: 1;
  demoId: string;
  trace: string;
  baseUrl: string;
  plannedSteps: number;
  evaluatedSteps: number;
  abortedAfterStepId: string | null;
  counts: { matched: number; drifted: number; orphaned: number };
  steps: readonly (DriftStep & { status: ActionResult['status'] })[];
};

function stepStatus(actions: readonly ActionResult[]): ActionResult['status'] {
  if (actions.some((action) => action.status === 'orphaned')) return 'orphaned';
  return actions.some((action) => action.status === 'drifted') ? 'drifted' : 'matched';
}

export function buildDriftReport(input: Omit<DriftReport, 'v' | 'evaluatedSteps' | 'counts' | 'steps'> &
  { steps: readonly DriftStep[] }): DriftReport {
  const steps = input.steps.map((step) => ({ ...step, status: stepStatus(step.actions) }));
  const counts = { matched: 0, drifted: 0, orphaned: 0 };
  for (const step of steps) counts[step.status] += 1;
  return { v: 1, demoId: input.demoId, trace: input.trace, baseUrl: input.baseUrl,
    plannedSteps: input.plannedSteps, evaluatedSteps: steps.length,
    abortedAfterStepId: input.abortedAfterStepId, counts, steps };
}

function rows(report: DriftReport, status: ActionResult['status']): string[] {
  return report.steps.filter((step) => step.status === status).map((step) => {
    const action = step.actions.find((value) => value.status === status) ?? step.actions[0];
    const detail = action?.locatorType ? `  ${action.locatorType}` : action?.reason ? `  ${action.reason}` : '';
    return `  1 step ${status.padEnd(10)} ${step.label}${detail}`;
  });
}

export function formatDriftReport(report: DriftReport): string {
  const lines = [`${report.demoId} regenerated against ${report.baseUrl}`, '',
    `  ${report.counts.matched} steps matched`];
  for (const status of ['drifted', 'orphaned'] as const) lines.push(...rows(report, status));
  if (report.abortedAfterStepId) lines.push('', `  replay stopped after ${report.abortedAfterStepId}`);
  return `${lines.join('\n')}\n`;
}

export function reportExitCode(report: DriftReport): 0 | 1 {
  return report.counts.drifted === 0 && report.counts.orphaned === 0 &&
    report.evaluatedSteps === report.plannedSteps ? 0 : 1;
}
```

- [ ] **Step 4: Run trace tests and typecheck**

```powershell
pnpm --filter @cutscene/trace test
pnpm --filter @cutscene/trace typecheck
```

Expected: all trace tests pass.

- [ ] **Step 5: Commit**

```powershell
git add packages/trace/src/regeneration.ts packages/trace/src/regeneration.test.ts
git commit -m "feat(trace): model regeneration drift reports"
```

### Task 4: Load traces and execute ranked Playwright locators

**Files:**
- Create: `packages/runner/src/trace-file.test.ts`
- Create: `packages/runner/src/trace-file.ts`
- Create: `packages/runner/src/replay.test.ts`
- Create: `packages/runner/src/replay.ts`

- [ ] **Step 1: Write failing JSONL loader tests**

Use a temporary file and assert line-numbered invalid JSON/schema errors plus successful `TraceEvent[]` parsing. The expected public function is:

```ts
export async function readTraceFile(path: string): Promise<Result<TraceEvent[]>>;
```

- [ ] **Step 2: Implement the strict loader**

Create `packages/runner/src/trace-file.ts`:

```ts
import { readFile } from 'node:fs/promises';
import { parseTraceEvent, type Result, type TraceEvent } from '@cutscene/trace';

export async function readTraceFile(path: string): Promise<Result<TraceEvent[]>> {
  let source: string;
  try { source = await readFile(path, 'utf8'); }
  catch (cause: unknown) { return { ok: false, error: `cannot read trace: ${cause instanceof Error ? cause.message : String(cause)}` }; }
  const events: TraceEvent[] = [];
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let input: unknown;
    try { input = JSON.parse(line); }
    catch { return { ok: false, error: `trace line ${index + 1} is invalid JSON` }; }
    const event = parseTraceEvent(input);
    if (!event.ok) return { ok: false, error: `trace line ${index + 1}: ${event.error}` };
    events.push(event.value);
  }
  return events.length > 0 ? { ok: true, value: events } : { ok: false, error: 'trace has no events' };
}
```

- [ ] **Step 3: Write failing browser-resolution tests**

Launch Chromium once in `replay.test.ts`, use `page.setContent`, and prove:

1. `testId` at index 0 is matched and clicked.
2. Missing testId followed by role is drifted and clicked.
3. Two visible matches do not resolve.
4. No matching locator is orphaned and stops later steps.
5. A fill action uses its in-memory value but the returned result omits it.

- [ ] **Step 4: Implement locator mapping and replay**

Create `packages/runner/src/replay.ts` with this contract:

```ts
import type { Locator, ReplayAction, ReplayPlan, ActionResult, DriftStep } from '@cutscene/trace';
import type { Locator as PlaywrightLocator, Page } from '@playwright/test';

function candidate(page: Page, locator: Locator): PlaywrightLocator {
  switch (locator.type) {
    case 'testId': return page.getByTestId(locator.value);
    case 'role': return page.getByRole(locator.role as Parameters<Page['getByRole']>[0], { name: locator.name });
    case 'label': return page.getByLabel(locator.value);
    case 'text': return page.getByText(locator.value);
    case 'css': return page.locator(locator.value);
  }
}

async function execute(page: Page, action: ReplayAction): Promise<ActionResult> {
  if (!action.target) return { eventId: action.eventId, kind: action.kind, status: 'orphaned',
    locatorType: null, locatorIndex: null, reason: 'no target captured' };
  for (const [index, locator] of action.target.locators.entries()) {
    const match = candidate(page, locator);
    if (await match.count() !== 1 || !(await match.isVisible())) continue;
    try {
      if (action.kind === 'click') await match.click();
      else await match.fill(action.value);
      return { eventId: action.eventId, kind: action.kind, status: index === 0 ? 'matched' : 'drifted',
        locatorType: locator.type, locatorIndex: index, reason: null };
    } catch (cause: unknown) {
      return { eventId: action.eventId, kind: action.kind, status: 'orphaned', locatorType: locator.type,
        locatorIndex: index, reason: cause instanceof Error ? cause.message : String(cause) };
    }
  }
  return { eventId: action.eventId, kind: action.kind, status: 'orphaned', locatorType: null,
    locatorIndex: null, reason: 'no locator resolved' };
}

export type ReplayRun = { steps: readonly DriftStep[]; abortedAfterStepId: string | null };

export async function replay(page: Page, plan: ReplayPlan): Promise<ReplayRun> {
  const steps: DriftStep[] = [];
  for (const step of plan.steps) {
    const actions: ActionResult[] = [];
    for (const action of step.actions) {
      const result = await execute(page, action);
      actions.push(result);
      if (result.status === 'orphaned') {
        steps.push({ stepId: step.stepId, label: step.label, actions });
        return { steps, abortedAfterStepId: step.stepId };
      }
    }
    steps.push({ stepId: step.stepId, label: step.label, actions });
  }
  return { steps, abortedAfterStepId: null };
}
```

- [ ] **Step 5: Run focused and package tests**

```powershell
pnpm --filter @cutscene/runner test -- trace-file.test.ts replay.test.ts
pnpm --filter @cutscene/runner typecheck
```

Expected: loader and browser-resolution tests pass with no network access.

- [ ] **Step 6: Commit**

```powershell
git add packages/runner/src/trace-file.ts packages/runner/src/trace-file.test.ts packages/runner/src/replay.ts packages/runner/src/replay.test.ts
git commit -m "feat(runner): replay ranked locators"
```

### Task 5: Add seed execution and authoritative report files

**Files:**
- Create: `packages/runner/src/process.test.ts`
- Create: `packages/runner/src/process.ts`
- Create: `packages/runner/src/report-files.test.ts`
- Create: `packages/runner/src/report-files.ts`

- [ ] **Step 1: Write failing process and report tests**

Test a successful seed, a non-zero seed, JSON-last report writes, stale temporary-file cleanup, deterministic JSON indentation, and absence of an injected secret in both files.

- [ ] **Step 2: Implement the seed boundary**

Create `packages/runner/src/process.ts`:

```ts
import { spawn } from 'node:child_process';
import type { Result } from '@cutscene/trace';

export function runSeed(command: string | null, cwd: string): Promise<Result<undefined>> {
  if (!command) return Promise.resolve({ ok: true, value: undefined });
  return new Promise((resolve) => {
    const child = spawn(command, { cwd, shell: true, stdio: 'inherit' });
    child.once('error', (cause) => resolve({ ok: false, error: `seed failed: ${cause.message}` }));
    child.once('exit', (code) => resolve(code === 0 ? { ok: true, value: undefined }
      : { ok: false, error: `seed failed with exit code ${code ?? 'unknown'}` }));
  });
}
```

- [ ] **Step 3: Implement report writes**

Create `packages/runner/src/report-files.ts`:

```ts
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { formatDriftReport, type DriftReport, type Result } from '@cutscene/trace';

async function replace(path: string, contents: string): Promise<void> {
  const temporary = `${path}.${process.pid}.tmp`;
  try { await writeFile(temporary, contents, 'utf8'); await rename(temporary, path); }
  finally { await rm(temporary, { force: true }); }
}

export async function writeReports(configDir: string, report: DriftReport): Promise<Result<string>> {
  const directory = join(configDir, '.cutscene', 'reports', report.demoId);
  try {
    await mkdir(directory, { recursive: true });
    await replace(join(directory, 'drift-report.txt'), formatDriftReport(report));
    await replace(join(directory, 'drift-report.json'), `${JSON.stringify(report, null, 2)}\n`);
    return { ok: true, value: directory };
  } catch (cause: unknown) {
    return { ok: false, error: `cannot write drift report: ${cause instanceof Error ? cause.message : String(cause)}` };
  }
}
```

- [ ] **Step 4: Run focused tests**

```powershell
pnpm --filter @cutscene/runner test -- process.test.ts report-files.test.ts
pnpm --filter @cutscene/runner typecheck
```

Expected: seed and report tests pass.

- [ ] **Step 5: Commit**

```powershell
git add packages/runner/src/process.ts packages/runner/src/process.test.ts packages/runner/src/report-files.ts packages/runner/src/report-files.test.ts
git commit -m "feat(runner): run seeds and write drift reports"
```

### Task 6: Add the CLI orchestration

**Files:**
- Create: `packages/runner/src/cli.test.ts`
- Create: `packages/runner/src/cli.ts`
- Create: `packages/runner/src/run.ts`

- [ ] **Step 1: Write failing argument and exit-code tests**

Test only these accepted forms:

```text
cutscene-regenerate --config demo.yml --dry-run
cutscene-regenerate --config demo.yml --dry-run --demo todo-flow
```

Assert missing `--dry-run`, unknown flags, missing config values, and unmatched demo IDs return exit code 2. Assert aggregate demo exits use the maximum code: `0`, then `1`, then `2`.

- [ ] **Step 2: Implement per-demo orchestration**

Create `packages/runner/src/run.ts`. It must execute these operations in order and return `0 | 1 | 2` rather than calling `process.exit`:

```ts
import { chromium } from '@playwright/test';
import { buildDriftReport, planReplay, reportExitCode } from '@cutscene/trace';
import type { DemoConfig } from './config.ts';
import { readTraceFile } from './trace-file.ts';
import { replay } from './replay.ts';
import { runSeed } from './process.ts';
import { writeReports } from './report-files.ts';

export async function runDemo(demo: DemoConfig, configDir: string): Promise<0 | 1 | 2> {
  const trace = await readTraceFile(demo.tracePath);
  if (!trace.ok) { console.error(`${demo.id}: ${trace.error}`); return 2; }
  const plan = planReplay(trace.value, demo.inputs);
  if (!plan.ok) { console.error(`${demo.id}: ${plan.error}`); return 2; }
  const seeded = await runSeed(demo.seed, configDir);
  if (!seeded.ok) { console.error(`${demo.id}: ${seeded.error}`); return 2; }

  try {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(demo.baseUrl, { waitUntil: 'domcontentloaded' });
      const run = await replay(page, plan.value);
      const report = buildDriftReport({ demoId: demo.id, trace: demo.tracePath, baseUrl: demo.baseUrl,
        plannedSteps: plan.value.steps.length, abortedAfterStepId: run.abortedAfterStepId, steps: run.steps });
      const written = await writeReports(configDir, report);
      if (!written.ok) { console.error(`${demo.id}: ${written.error}`); return 2; }
      console.log(`${demo.id}: ${written.value}`);
      return reportExitCode(report);
    } finally { await browser.close(); }
  } catch (cause: unknown) {
    console.error(`${demo.id}: browser failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    return 2;
  }
}
```

- [ ] **Step 3: Implement the CLI boundary**

Create `packages/runner/src/cli.ts` with an exported `main(args, env)` for tests. Read the config with `readFile`, call `parseRunnerConfig`, filter by `--demo`, run demos sequentially, and return the maximum exit code. The executable tail must be:

```ts
import { pathToFileURL } from 'node:url';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2), process.env);
}
```

The only usage line is:

```text
Usage: cutscene-regenerate --config <demo.yml> --dry-run [--demo <id>]
```

- [ ] **Step 4: Run runner tests and typecheck**

```powershell
pnpm --filter @cutscene/runner test
pnpm --filter @cutscene/runner typecheck
```

Expected: all runner unit tests pass.

- [ ] **Step 5: Commit**

```powershell
git add packages/runner/src/cli.ts packages/runner/src/cli.test.ts packages/runner/src/run.ts
git commit -m "feat(runner): add local regeneration CLI"
```

### Task 7: Prove the real CLI in Chromium and document the slice

**Files:**
- Create: `packages/runner/e2e/regeneration.spec.ts`
- Create: `packages/runner/playwright.config.ts`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `STATUS.md`
- Modify: `docs/superpowers/specs/2026-07-16-phase-7-local-regeneration-design.md`

- [ ] **Step 1: Add a local end-to-end fixture**

Create a built-in HTTP server in `regeneration.spec.ts` that serves one page with:

```html
<button data-testid="primary">Primary</button>
<button aria-label="Recovered">Recovered</button>
<input aria-label="Private value">
```

The test writes a temporary `demo.yml` and valid JSONL trace with four ordered steps:

1. Primary testId resolves at index 0.
2. Missing testId falls back to the `Recovered` role locator at index 1.
3. Masked input fills from `DEMO_VALUE` and resolves at index 0.
4. Removed button has no match and aborts.

Spawn the real CLI with `DEMO_VALUE=local-e2e-secret`. Assert exit code `1`, counts `matched: 2`, `drifted: 1`, `orphaned: 1`, `abortedAfterStepId` equals step 4, and neither report contains `local-e2e-secret`.

- [ ] **Step 2: Add Playwright configuration and root wiring**

Create `packages/runner/playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: 'e2e', workers: 1, retries: 0, timeout: 30_000 });
```

Change the root E2E script to:

```json
"e2e": "pnpm --filter @cutscene/runner e2e && pnpm --filter @cutscene/extension e2e"
```

- [ ] **Step 3: Run the red E2E test before final fixes**

```powershell
pnpm --filter @cutscene/runner e2e
```

Expected: the first run exposes any CLI/path/runtime integration gap. Fix only the observed gap without widening scope, then rerun until 1/1 passes.

- [ ] **Step 4: Run a live TodoMVC dry-run**

Generate an untracked config under `artifacts/phase7-todomvc-dry-run` pointing to the corrected trace and `https://todomvc.com/examples/react/dist/`. Supply `step_0000` through an environment variable. Run:

```powershell
pnpm --filter @cutscene/runner regenerate -- --config F:\Cutscene\artifacts\phase7-todomvc-dry-run\demo.yml --dry-run
```

Expected: exit `1` or `2` with an honest, measured reason if the omitted keyboard submissions prevent full replay. Do not change the runner to fake Enter or claim the flow matched.

- [ ] **Step 5: Document exact usage and measured evidence**

Add the local command, input override syntax, exit codes, report paths, and keyboard limitation to `README.md`. Add Phase 7 progress and exact unit/E2E/live dry-run numbers to `STATUS.md`. Keep `Phase: 7`; the PRD exit criterion is not met without an automatically opened and merged external PR.

Update the design sentence about keypress behavior if implementation evidence requires more precise wording, without changing the no-invention rule.

- [ ] **Step 6: Run all gates sequentially**

```powershell
pnpm test
pnpm typecheck
pnpm build
pnpm e2e
git diff --check
```

Expected: every workspace unit test, all five package typechecks, editor and extension production builds, runner E2E, and existing extension E2E pass.

- [ ] **Step 7: Commit**

```powershell
git add package.json README.md STATUS.md docs/superpowers/specs/2026-07-16-phase-7-local-regeneration-design.md packages/runner/e2e packages/runner/playwright.config.ts
git commit -m "test(runner): prove local regeneration dry run"
```

### Task 8: Completion audit and direct integration

**Files:**
- Modify only if evidence is stale: `STATUS.md`

- [ ] **Step 1: Audit every design requirement**

Verify strict YAML parsing, environment-only masked inputs, seed ordering, direct ranked locator replay, all three drift classifications, abort metadata, deterministic reports, secret non-disclosure, exit codes, local Chromium proof, and the deferred no-PR boundary against current files and command output.

- [ ] **Step 2: Verify branch cleanliness and scope**

```powershell
git status --short
git diff main...HEAD --stat
git log --oneline main..HEAD
```

Expected: only the files in this plan changed; no artifacts, credentials, browser profiles, or report outputs are tracked.

- [ ] **Step 3: Fast-forward main and push directly**

From `F:\Cutscene`:

```powershell
git merge --ff-only feat/phase7-local-regeneration
git push origin main
git rev-parse HEAD
git ls-remote origin refs/heads/main
```

Expected: local and remote `main` hashes match. Do not create a pull request.
