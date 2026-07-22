#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseRunnerConfig } from './config.ts';
import { runDemo } from './run.ts';

const USAGE = 'Usage: cutscene-regenerate --config <demo.yml> [--dry-run] [--heal] [--demo <id>]';

type Arguments = { configPath: string; demoId: string | null; dryRun: boolean; heal: boolean };

function parseArguments(args: readonly string[]): Arguments | null {
  if (args[0] !== '--config') return null;
  const configPath = args[1];
  if (!configPath || configPath.startsWith('--')) return null;
  let index = 2;
  let dryRun = false;
  if (args[index] === '--dry-run') {
    dryRun = true;
    index += 1;
  }
  let heal = false;
  if (args[index] === '--heal') {
    heal = true;
    index += 1;
  }
  let demoId: string | null = null;
  if (args[index] === '--demo') {
    const value = args[index + 1];
    if (!value || value.startsWith('--')) return null;
    demoId = value;
    index += 2;
  }
  return index === args.length ? { configPath, demoId, dryRun, heal } : null;
}

export async function main(
  args: readonly string[],
  environment: Readonly<Record<string, string | undefined>>,
): Promise<0 | 1 | 2> {
  const parsedArguments = parseArguments(args);
  if (parsedArguments === null) {
    console.error(USAGE);
    return 2;
  }

  const configPath = resolve(parsedArguments.configPath);
  let source: string;
  try {
    source = await readFile(configPath, 'utf8');
  } catch (cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    console.error(`cannot read config: ${detail}`);
    return 2;
  }
  const config = parseRunnerConfig(source, configPath, environment);
  if (!config.ok) {
    console.error(config.error);
    return 2;
  }

  const demos = parsedArguments.demoId === null
    ? config.value.demos
    : config.value.demos.filter((demo) => demo.id === parsedArguments.demoId);
  if (demos.length === 0) {
    console.error(`demo "${parsedArguments.demoId}" is not configured`);
    return 2;
  }

  let exitCode: 0 | 1 | 2 = 0;
  for (const demo of demos) {
    const result = await runDemo(demo, config.value.configDir,
      { dryRun: parsedArguments.dryRun, heal: parsedArguments.heal });
    if (result > exitCode) {
      exitCode = result;
    }
  }
  return exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2), process.env);
}
