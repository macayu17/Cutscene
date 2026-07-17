import { chromium } from '@playwright/test';
import type { Result } from '@cutscene/trace';
import { copyFile, mkdir, mkdtemp, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { ServerResponse } from 'node:http';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { FreshBundle } from './bundle-files.ts';
import type { DemoOutput } from './config.ts';

type RenderServerInput = { editorDist: string; bundle: FreshBundle };

export type RenderServer = {
  url: string;
  port: number;
  close: () => Promise<void>;
};

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.webm': 'video/webm',
};

function fail(response: ServerResponse, status: number): void {
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(status === 400 ? 'Bad request' : status === 405 ? 'Method not allowed' : 'Not found');
}

function inside(root: string, path: string): boolean {
  const pathFromRoot = relative(resolve(root), resolve(path));
  return pathFromRoot !== '..' && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot);
}

async function sendFile(response: ServerResponse, path: string, head: boolean): Promise<void> {
  const info = await stat(path);
  if (!info.isFile()) throw new Error('not a file');
  const contents = await readFile(path);
  response.writeHead(200, {
    'content-length': String(contents.byteLength),
    'content-type': CONTENT_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream',
  });
  response.end(head ? undefined : contents);
}

export async function startRenderServer(input: RenderServerInput): Promise<RenderServer> {
  const editorRoot = await realpath(input.editorDist);
  const bundlePaths: Readonly<Record<string, string>> = {
    '/bundle/media.webm': input.bundle.mediaPath,
    '/bundle/trace.jsonl': input.bundle.tracePath,
    '/bundle/meta.json': input.bundle.metaPath,
  };
  const server = createServer((request, response) => {
    void (async () => {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        fail(response, 405);
        return;
      }
      const rawPath = (request.url ?? '/').split('?', 1)[0] ?? '/';
      let path: string;
      try {
        path = decodeURIComponent(rawPath);
      } catch {
        fail(response, 400);
        return;
      }
      if (path.includes('\\') || path.split('/').includes('..')) {
        fail(response, 400);
        return;
      }
      const bundlePath = bundlePaths[path];
      if (bundlePath !== undefined) {
        await sendFile(response, bundlePath, request.method === 'HEAD');
        return;
      }
      if (path.startsWith('/bundle/')) {
        fail(response, 404);
        return;
      }
      const candidate = resolve(editorRoot, path.slice(1));
      if (!path.startsWith('/') || !inside(editorRoot, candidate)) {
        fail(response, 400);
        return;
      }
      const target = await realpath(candidate);
      if (!inside(editorRoot, target)) {
        fail(response, 400);
        return;
      }
      await sendFile(response, target, request.method === 'HEAD');
    })().catch(() => fail(response, 404));
  });

  await new Promise<void>((resolveStart, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolveStart();
    });
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    throw new Error('render server did not bind a TCP port');
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    port: address.port,
    close: () => new Promise<void>((resolveClose, reject) => {
      server.close((cause) => cause ? reject(cause) : resolveClose());
    }),
  };
}

type AutomationApi = {
  exportVideo: (type: 'gif' | 'mp4', width?: number) => Promise<void>;
  exportDocs: () => Promise<unknown>;
};

type DocShot = { name: string; bytes: number[] };
type RenderedDocs = { markdown: string; shots: DocShot[] };
type StagedOutput = { stagedPath: string; destinationPath: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function renderedDocs(value: unknown): RenderedDocs {
  if (!isRecord(value) || typeof value.markdown !== 'string' || !Array.isArray(value.shots)) {
    throw new Error('documentation export returned invalid data');
  }
  const shots: DocShot[] = value.shots.map((shot) => {
    if (!isRecord(shot) || typeof shot.name !== 'string' || !Array.isArray(shot.bytes)
      || !shot.bytes.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
      throw new Error('documentation export returned an invalid screenshot');
    }
    return { name: shot.name, bytes: shot.bytes as number[] };
  });
  return { markdown: value.markdown, shots };
}

function screenshotDestination(markdownPath: string, name: string): string {
  const root = dirname(markdownPath);
  const destination = resolve(root, name);
  if (name.length === 0 || isAbsolute(name) || !inside(root, destination)) {
    throw new Error(`invalid screenshot path "${name}"`);
  }
  return destination;
}

async function replace(stagedPath: string, destinationPath: string): Promise<void> {
  await mkdir(dirname(destinationPath), { recursive: true });
  const temporary = `${destinationPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await copyFile(stagedPath, temporary);
    await rename(temporary, destinationPath);
  } finally {
    await rm(temporary, { force: true });
  }
}

export type RenderOutputsInput = {
  configDir: string;
  editorDist: string;
  bundle: FreshBundle;
  outputs: readonly DemoOutput[];
};

export async function renderOutputs(input: RenderOutputsInput): Promise<Result<readonly string[]>> {
  let staging: string | null = null;
  let server: RenderServer | null = null;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    for (const output of input.outputs) {
      if (!inside(input.configDir, output.path)) {
        throw new Error(`output path must stay within config directory: ${output.path}`);
      }
    }
    await mkdir(input.bundle.directory, { recursive: true });
    staging = await mkdtemp(resolve(input.bundle.directory, '.render-'));
    server = await startRenderServer({ editorDist: input.editorDist, bundle: input.bundle });
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ acceptDownloads: true });
    await page.goto(`${server.url}/automation.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => 'cutscene' in globalThis);

    const staged: StagedOutput[] = [];
    const destinations = new Set<string>();
    const addStaged = (item: StagedOutput) => {
      const destination = resolve(item.destinationPath);
      if (destinations.has(destination)) throw new Error(`duplicate output path: ${destination}`);
      destinations.add(destination);
      staged.push({ ...item, destinationPath: destination });
    };

    for (const [index, output] of input.outputs.entries()) {
      if (output.type === 'docs') {
        const rawDocs: unknown = await page.evaluate(async () => {
          const api = (globalThis as typeof globalThis & { cutscene?: AutomationApi }).cutscene;
          if (!api) throw new Error('window.cutscene is unavailable');
          return api.exportDocs();
        });
        const docs = renderedDocs(rawDocs);
        const markdownStage = resolve(staging, `${index}.md`);
        await writeFile(markdownStage, docs.markdown, 'utf8');
        addStaged({ stagedPath: markdownStage, destinationPath: output.path });
        for (const shot of docs.shots) {
          const destinationPath = screenshotDestination(output.path, shot.name);
          const stagedPath = resolve(staging, `${index}-shots`, shot.name);
          if (!inside(staging, stagedPath)) throw new Error(`invalid screenshot path "${shot.name}"`);
          await mkdir(dirname(stagedPath), { recursive: true });
          await writeFile(stagedPath, new Uint8Array(shot.bytes));
          addStaged({ stagedPath, destinationPath });
        }
        continue;
      }

      const argument = output.width === undefined
        ? { type: output.type }
        : { type: output.type, width: output.width };
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.evaluate(async (options) => {
          const api = (globalThis as typeof globalThis & { cutscene?: AutomationApi }).cutscene;
          if (!api) throw new Error('window.cutscene is unavailable');
          await api.exportVideo(options.type, options.width);
        }, argument),
      ]);
      const failure = await download.failure();
      if (failure !== null) throw new Error(`download failed: ${failure}`);
      if (!download.suggestedFilename().toLowerCase().endsWith(`.${output.type}`)) {
        throw new Error(`unexpected download name: ${download.suggestedFilename()}`);
      }
      const stagedPath = resolve(staging, `${index}.${output.type}`);
      await download.saveAs(stagedPath);
      addStaged({ stagedPath, destinationPath: output.path });
    }

    for (const item of staged) await replace(item.stagedPath, item.destinationPath);
    return { ok: true, value: staged.map(({ destinationPath }) => destinationPath) };
  } catch (cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, error: `cannot render outputs: ${detail}` };
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (server) await server.close().catch(() => undefined);
    if (staging) await rm(staging, { recursive: true, force: true });
  }
}
