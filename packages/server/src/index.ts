import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { handle } from './server.ts';

const root = resolve(process.env.CUTSCENE_DATA ?? 'data');
const port = Number(process.env.PORT ?? 4180);

await mkdir(root, { recursive: true });

createServer((req, res) => {
  handle(req, res, root).catch(() => {
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'internal error' }));
  });
}).listen(port, () => console.log(`cutscene share server on http://localhost:${port} (data: ${root})`));
