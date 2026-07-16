import type { IncomingMessage, ServerResponse } from 'node:http';
import { BUNDLE_FILES, createId, ensureRecording, isBundleFile, isValidId, readBundleFile,
  recordingExists, recordingReady, saveBundleFile, validateBundleFile, type BundleFile } from './store.ts';

const MAX_BYTES = 250 * 1024 * 1024; // one bundle cannot exhaust disk

const CONTENT_TYPE: Record<BundleFile, string> = {
  'media.webm': 'video/webm',
  'trace.jsonl': 'application/x-ndjson',
  'meta.json': 'application/json',
};

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': payload.length });
  res.end(payload);
}

function html(res: ServerResponse, status: number, body: string): void {
  const payload = Buffer.from(body);
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'content-length': payload.length });
  res.end(payload);
}

function sharePage(id: string): string {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>Cutscene demo</title>` +
    `<style>html,body{margin:0;height:100%;background:#16181C;display:grid;place-items:center}` +
    `video{max-width:100%;max-height:100%}</style>` +
    `<video controls autoplay playsinline src="/api/recordings/${id}/media.webm"></video>`;
}

function readBody(req: IncomingMessage): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BYTES) { resolve(null); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => resolve(null));
  });
}

export async function handle(req: IncomingMessage, res: ServerResponse, root: string): Promise<void> {
  res.setHeader('access-control-allow-origin', '*');
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
      'access-control-allow-headers': 'content-type',
    });
    res.end();
    return;
  }
  const parts = (req.url ?? '/').split('?')[0]!.split('/').filter(Boolean);

  if (req.method === 'POST' && parts.length === 2 && parts[0] === 'api' && parts[1] === 'recordings') {
    const id = createId();
    await ensureRecording(root, id);
    return json(res, 201, { id });
  }

  if (parts.length === 4 && parts[0] === 'api' && parts[1] === 'recordings') {
    const id = parts[2]!;
    const file = parts[3]!;
    if (!isValidId(id)) return json(res, 400, { error: 'invalid recording id' });
    if (!isBundleFile(file)) return json(res, 400, { error: `file must be one of ${BUNDLE_FILES.join(', ')}` });

    if (req.method === 'PUT') {
      if (!(await recordingExists(root, id))) return json(res, 404, { error: 'recording not found' });
      const body = await readBody(req);
      if (!body) return json(res, 413, { error: 'bundle file too large or unreadable' });
      const valid = validateBundleFile(file, body);
      if (!valid.ok) return json(res, 400, { error: valid.error });
      await saveBundleFile(root, id, file, body);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET') {
      const data = await readBundleFile(root, id, file);
      if (!data) return json(res, 404, { error: 'not found' });
      res.writeHead(200, { 'content-type': CONTENT_TYPE[file], 'content-length': data.length });
      res.end(data);
      return;
    }
    return json(res, 405, { error: 'method not allowed' });
  }

  if (req.method === 'GET' && parts.length === 2 && parts[0] === 'r') {
    const id = parts[1]!;
    if (!isValidId(id) || !(await recordingReady(root, id))) return html(res, 404, '<!doctype html><title>Not found</title><h1>Demo not found</h1>');
    return html(res, 200, sharePage(id));
  }

  return json(res, 404, { error: 'not found' });
}
