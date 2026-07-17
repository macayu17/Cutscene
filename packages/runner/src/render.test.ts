import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { FreshBundle } from './bundle-files.ts';
import type { DemoOutput } from './config.ts';

const launch = vi.hoisted(() => vi.fn());
vi.mock('@playwright/test', () => ({ chromium: { launch } }));

import { renderOutputs, startRenderServer } from './render.ts';

const roots: string[] = [];

afterEach(async () => {
  launch.mockReset();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(): Promise<{ root: string; editorDist: string; bundle: FreshBundle }> {
  const root = await mkdtemp(join(tmpdir(), 'cutscene-render-'));
  roots.push(root);
  const editorDist = join(root, 'editor');
  const directory = join(root, '.cutscene', 'runs', 'demo');
  await mkdir(join(editorDist, 'assets'), { recursive: true });
  await mkdir(directory, { recursive: true });
  await writeFile(join(editorDist, 'automation.html'), '<script src="/assets/app.js"></script>');
  await writeFile(join(editorDist, 'assets', 'app.js'), 'window.cutscene = {}');
  await writeFile(join(directory, 'media.webm'), new Uint8Array([1, 2, 3]));
  await writeFile(join(directory, 'trace.jsonl'), '{"v":1}\n');
  await writeFile(join(directory, 'meta.json'), '{"schemaVersion":1}\n');
  return {
    root,
    editorDist,
    bundle: {
      directory,
      mediaPath: join(directory, 'media.webm'),
      tracePath: join(directory, 'trace.jsonl'),
      metaPath: join(directory, 'meta.json'),
    },
  };
}

function rawStatus(port: number, path: string): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const call = request({ host: '127.0.0.1', port, path }, (response) => {
      response.resume();
      response.once('end', () => resolve(response.statusCode));
    });
    call.once('error', reject);
    call.end();
  });
}

it('serves editor assets and only the three fixed bundle files from 127.0.0.1', async () => {
  const { root, editorDist, bundle } = await fixture();
  await writeFile(join(root, 'secret.txt'), 'secret');
  await writeFile(join(bundle.directory, 'private.txt'), 'private');
  const server = await startRenderServer({ editorDist, bundle });
  try {
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    await expect(fetch(`${server.url}/automation.html`).then((response) => response.text()))
      .resolves.toContain('/assets/app.js');
    await expect(fetch(`${server.url}/assets/app.js`).then((response) => response.text()))
      .resolves.toContain('window.cutscene');
    await expect(fetch(`${server.url}/bundle/media.webm`).then((response) => response.arrayBuffer()))
      .resolves.toEqual(Uint8Array.from([1, 2, 3]).buffer);
    expect(await rawStatus(server.port, '/bundle/private.txt')).toBe(404);
    expect(await rawStatus(server.port, '/assets/%2e%2e/%2e%2e/secret.txt')).toBe(400);
  } finally {
    await server.close();
  }
});

function fakeBrowser(downloadBytes: readonly Uint8Array[], docs: unknown, failExportAt = -1) {
  let downloadIndex = 0;
  let exportIndex = 0;
  const exportCalls: unknown[] = [];
  const page = {
    goto: vi.fn(async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`page returned ${response.status}`);
    }),
    waitForFunction: vi.fn(async () => undefined),
    waitForEvent: vi.fn(() => {
      const index = downloadIndex++;
      return Promise.resolve({
        suggestedFilename: () => `rec.${index === 0 ? 'gif' : 'mp4'}`,
        failure: async () => null,
        saveAs: async (path: string) => writeFile(path, downloadBytes[index] ?? new Uint8Array()),
      });
    }),
    evaluate: vi.fn(async (_callback: unknown, argument?: unknown) => {
      if (argument !== undefined) {
        exportCalls.push(argument);
        if (exportIndex++ === failExportAt) throw new Error('render failed');
        return undefined;
      }
      return docs;
    }),
  };
  const close = vi.fn(async () => undefined);
  launch.mockImplementation(async () => ({ newPage: async () => page, close }));
  return { page, close, exportCalls };
}

it('renders videos and docs into staging before replacing every declared destination', async () => {
  const { root, editorDist, bundle } = await fixture();
  const gifPath = join(root, 'docs', 'demo.gif');
  const mp4Path = join(root, 'docs', 'demo.mp4');
  const docsPath = join(root, 'docs', 'guide.md');
  const outputs: DemoOutput[] = [
    { type: 'gif', path: gifPath, width: 640 },
    { type: 'mp4', path: mp4Path },
    { type: 'docs', path: docsPath },
  ];
  for (const output of outputs) {
    await mkdir(dirname(output.path), { recursive: true });
    await writeFile(output.path, 'sentinel');
  }
  const browser = fakeBrowser([new Uint8Array([7]), new Uint8Array([8])], {
    markdown: '# Guide\n',
    shots: [{ name: 'screenshots/step-01.png', bytes: [9, 10] }],
  });

  const result = await renderOutputs({ configDir: root, editorDist, bundle, outputs });

  expect(result).toEqual({ ok: true, value: [
    gifPath,
    mp4Path,
    docsPath,
    join(root, 'docs', 'screenshots', 'step-01.png'),
  ] });
  await expect(readFile(gifPath)).resolves.toEqual(Buffer.from([7]));
  await expect(readFile(mp4Path)).resolves.toEqual(Buffer.from([8]));
  await expect(readFile(docsPath, 'utf8')).resolves.toBe('# Guide\n');
  await expect(readFile(join(root, 'docs', 'screenshots', 'step-01.png')))
    .resolves.toEqual(Buffer.from([9, 10]));
  expect(browser.exportCalls).toEqual([{ type: 'gif', width: 640 }, { type: 'mp4' }]);
  expect(browser.page.waitForFunction).toHaveBeenCalledOnce();
  expect(browser.close).toHaveBeenCalledOnce();
});

it('keeps all existing outputs unchanged when any browser render fails', async () => {
  const { root, editorDist, bundle } = await fixture();
  const gifPath = join(root, 'demo.gif');
  const mp4Path = join(root, 'demo.mp4');
  const outputs: DemoOutput[] = [
    { type: 'gif', path: gifPath },
    { type: 'mp4', path: mp4Path },
  ];
  for (const output of outputs) await writeFile(output.path, 'sentinel');
  fakeBrowser([new Uint8Array([7]), new Uint8Array([8])], null, 1);

  const result = await renderOutputs({ configDir: root, editorDist, bundle, outputs });

  expect(result).toEqual({ ok: false, error: 'cannot render outputs: render failed' });
  await expect(readFile(gifPath, 'utf8')).resolves.toBe('sentinel');
  await expect(readFile(mp4Path, 'utf8')).resolves.toBe('sentinel');
});

it('rejects documentation screenshots that escape the declared Markdown directory', async () => {
  const { root, editorDist, bundle } = await fixture();
  const output = { type: 'docs' as const, path: join(root, 'docs', 'guide.md') };
  await mkdir(dirname(output.path), { recursive: true });
  await writeFile(output.path, 'sentinel');
  const secret = join(root, 'escape.png');
  fakeBrowser([], { markdown: '# Guide\n', shots: [{ name: '../../escape.png', bytes: [9] }] });

  const result = await renderOutputs({ configDir: root, editorDist, bundle, outputs: [output] });

  expect(result).toEqual({ ok: false, error: 'cannot render outputs: invalid screenshot path "../../escape.png"' });
  await expect(readFile(output.path, 'utf8')).resolves.toBe('sentinel');
  await expect(readFile(secret)).rejects.toMatchObject({ code: 'ENOENT' });
});
