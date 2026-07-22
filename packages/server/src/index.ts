import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { handle } from './server.ts';
import { sweepExpired } from './store.ts';
import { RETENTION_DAYS } from './limits.ts';

const root = resolve(process.env.CUTSCENE_DATA ?? 'data');
const port = Number(process.env.PORT ?? 4180);

await mkdir(root, { recursive: true });

async function sweep(): Promise<void> {
  const removed = await sweepExpired(root).catch(() => []);
  if (removed.length) console.log(`swept ${removed.length} expired recording(s)`);
}

await sweep();
setInterval(() => void sweep(), 60 * 60 * 1_000).unref();

createServer((req, res) => {
  handle(req, res, root).catch(() => {
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'internal error' }));
  });
}).listen(port, () => console.log(
  `cutscene share server on http://localhost:${port} (data: ${root}, retention: ${RETENTION_DAYS} days)`));
