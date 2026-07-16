import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseRunnerConfig } from './config.ts';
import { runDemo } from './run.ts';

const USAGE = 'Usage: cutscene-regenerate --config <demo.yml> --dry-run [--demo <id>]';

type Arguments = { configPath: string; demoId: string | null };

function parseArguments(args: readonly string[]): Arguments | null {
  if (args.length !== 3 && args.length !== 5) {
    return null;
  }
  if (args[0] !== '--config' || args[2] !== '--dry-run') {
    return null;
  }
  const configPath = args[1];
  if (!configPath || configPath.startsWith('--')) {
    return null;
  }
  if (args.length === 3) {
    return { configPath, demoId: null };
  }
  const demoId = args[4];
  return args[3] === '--demo' && demoId && !demoId.startsWith('--')
    ? { configPath, demoId }
    : null;
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
    const result = await runDemo(demo, config.value.configDir);
    if (result > exitCode) {
      exitCode = result;
    }
  }
  return exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2), process.env);
}
