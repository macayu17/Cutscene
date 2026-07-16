import { afterEach, expect, it } from 'vitest';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handle } from './server.ts';

const servers: Server[] = [];
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve()))));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function startServer(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cutscene-server-http-'));
  roots.push(root);
  const server = createServer((req, res) => { void handle(req, res, root); });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test server did not bind to TCP');
  return `http://127.0.0.1:${address.port}`;
}

it('permits editor POST and PUT requests across origins', async () => {
  const base = await startServer();
  const preflight = await fetch(`${base}/api/recordings`, {
    method: 'OPTIONS',
    headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'POST' },
  });

  expect(preflight.status).toBe(204);
  expect(preflight.headers.get('access-control-allow-origin')).toBe('*');
  expect(preflight.headers.get('access-control-allow-methods')).toContain('POST');
  expect(preflight.headers.get('access-control-allow-methods')).toContain('PUT');

  const create = await fetch(`${base}/api/recordings`, {
    method: 'POST', headers: { origin: 'http://localhost:5173' },
  });
  expect(create.status).toBe(201);
  expect(create.headers.get('access-control-allow-origin')).toBe('*');
});
