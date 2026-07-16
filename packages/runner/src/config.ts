import { dirname, resolve } from 'node:path';
import type { Result } from '@cutscene/trace';
import { parse } from 'yaml';

export type DemoOutput = {
  type: 'gif' | 'mp4' | 'docs';
  path: string;
  width?: number;
};

export type DemoConfig = {
  id: string;
  tracePath: string;
  baseUrl: string;
  seed: string | null;
  inputs: Readonly<Record<string, string>>;
  outputs: readonly DemoOutput[];
};

export type RunnerConfig = {
  version: 1;
  configDir: string;
  demos: readonly DemoConfig[];
};

const TOP_KEYS = new Set(['version', 'demos']);
const DEMO_KEYS = new Set(['id', 'trace', 'baseUrl', 'seed', 'inputs', 'outputs']);
const OUTPUT_KEYS = new Set(['type', 'path', 'width']);
const ENV_REFERENCE = /^\$\{\{\s*env\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function findUnknownKey(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): string | null {
  return Object.keys(value).find((key) => !allowed.has(key)) ?? null;
}

function resolveScalar(
  value: unknown,
  environment: Readonly<Record<string, string | undefined>>,
  field: string,
): Result<string> {
  if (typeof value !== 'string') {
    return { ok: false, error: `${field} must be a string` };
  }

  const match = ENV_REFERENCE.exec(value);
  if (!match) {
    return value.includes('${{')
      ? { ok: false, error: `${field} environment reference must occupy the whole value` }
      : { ok: true, value };
  }

  const name = match[1];
  if (name === undefined) {
    return { ok: false, error: `${field} has an invalid environment reference` };
  }
  const resolved = environment[name];
  return resolved === undefined
    ? { ok: false, error: `${field} requires environment variable ${name}` }
    : { ok: true, value: resolved };
}

function validateHttpUrl(value: string, field: string): Result<string> {
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return { ok: true, value };
    }
  } catch {
    // The same field-level error covers malformed and unsupported URLs.
  }
  return { ok: false, error: `${field} must use HTTP or HTTPS` };
}

function parseOutputs(value: unknown, field: string): Result<readonly DemoOutput[]> {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, error: `${field} must be a non-empty array` };
  }

  const outputs: DemoOutput[] = [];
  for (const [index, rawOutput] of value.entries()) {
    const outputField = `${field}[${index}]`;
    if (!isRecord(rawOutput)) {
      return { ok: false, error: `${outputField} must be an object` };
    }
    const unknownKey = findUnknownKey(rawOutput, OUTPUT_KEYS);
    if (unknownKey !== null) {
      return { ok: false, error: `${outputField} has unknown key "${unknownKey}"` };
    }
    if (rawOutput.type !== 'gif' && rawOutput.type !== 'mp4' && rawOutput.type !== 'docs') {
      return { ok: false, error: `${outputField}.type is invalid` };
    }
    if (typeof rawOutput.path !== 'string' || rawOutput.path.length === 0) {
      return { ok: false, error: `${outputField}.path must be a path` };
    }
    if (rawOutput.width !== undefined
      && (!Number.isInteger(rawOutput.width) || (rawOutput.width as number) <= 0)) {
      return { ok: false, error: `${outputField}.width must be a positive integer` };
    }

    outputs.push(rawOutput.width === undefined
      ? { type: rawOutput.type, path: rawOutput.path }
      : { type: rawOutput.type, path: rawOutput.path, width: rawOutput.width as number });
  }
  return { ok: true, value: outputs };
}

export function parseRunnerConfig(
  source: string,
  configPath: string,
  environment: Readonly<Record<string, string | undefined>>,
): Result<RunnerConfig> {
  let input: unknown;
  try {
    input = parse(source, { maxAliasCount: 0, uniqueKeys: true });
  } catch (cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, error: `demo.yml is invalid: ${detail}` };
  }

  if (!isRecord(input) || input.version !== 1) {
    return { ok: false, error: 'config must have version: 1' };
  }
  const topUnknown = findUnknownKey(input, TOP_KEYS);
  if (topUnknown !== null) {
    return { ok: false, error: `config has unknown key "${topUnknown}"` };
  }
  if (!Array.isArray(input.demos) || input.demos.length === 0) {
    return { ok: false, error: 'config demos must be a non-empty array' };
  }

  const configDir = dirname(resolve(configPath));
  const ids = new Set<string>();
  const demos: DemoConfig[] = [];

  for (const [index, rawDemo] of input.demos.entries()) {
    const field = `demos[${index}]`;
    if (!isRecord(rawDemo)) {
      return { ok: false, error: `${field} must be an object` };
    }
    const unknownKey = findUnknownKey(rawDemo, DEMO_KEYS);
    if (unknownKey !== null) {
      return { ok: false, error: `${field} has unknown key "${unknownKey}"` };
    }
    if (typeof rawDemo.id !== 'string' || !ID.test(rawDemo.id)) {
      return { ok: false, error: `${field}.id is invalid` };
    }
    if (ids.has(rawDemo.id)) {
      return { ok: false, error: `duplicate demo id "${rawDemo.id}"` };
    }
    ids.add(rawDemo.id);
    if (typeof rawDemo.trace !== 'string' || rawDemo.trace.length === 0) {
      return { ok: false, error: `${field}.trace must be a path` };
    }

    const resolvedBaseUrl = resolveScalar(rawDemo.baseUrl, environment, `${field}.baseUrl`);
    if (!resolvedBaseUrl.ok) {
      return resolvedBaseUrl;
    }
    const baseUrl = validateHttpUrl(resolvedBaseUrl.value, `${field}.baseUrl`);
    if (!baseUrl.ok) {
      return baseUrl;
    }

    if (rawDemo.seed !== undefined && typeof rawDemo.seed !== 'string') {
      return { ok: false, error: `${field}.seed must be a string` };
    }

    const inputs: Record<string, string> = {};
    if (rawDemo.inputs !== undefined) {
      if (!isRecord(rawDemo.inputs)) {
        return { ok: false, error: `${field}.inputs must be an object` };
      }
      for (const [stepId, rawValue] of Object.entries(rawDemo.inputs)) {
        if (!ID.test(stepId)) {
          return { ok: false, error: `${field}.inputs has invalid step id "${stepId}"` };
        }
        const resolvedInput = resolveScalar(rawValue, environment, `${field}.inputs.${stepId}`);
        if (!resolvedInput.ok) {
          return resolvedInput;
        }
        inputs[stepId] = resolvedInput.value;
      }
    }

    const outputs = parseOutputs(rawDemo.outputs, `${field}.outputs`);
    if (!outputs.ok) {
      return outputs;
    }
    demos.push({
      id: rawDemo.id,
      tracePath: resolve(configDir, rawDemo.trace),
      baseUrl: baseUrl.value,
      seed: typeof rawDemo.seed === 'string' && rawDemo.seed.length > 0 ? rawDemo.seed : null,
      inputs,
      outputs: outputs.value,
    });
  }

  return { ok: true, value: { version: 1, configDir, demos } };
}
