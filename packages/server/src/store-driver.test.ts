import { expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createId, ensureRecording } from './store.ts';
import { filesystemStore } from './store-driver.ts';

// The contract a hosted R2 driver must also satisfy. Exercised here through the
// filesystem default, which is what proves the seam is real and not decorative.
it('round-trips bundle bytes through the store interface', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cutscene-driver-'));
  const store = filesystemStore(root);
  const id = createId();
  try {
    await ensureRecording(root, id); // writes the expiry file, so reads count as live
    expect(await store.has(id, 'media.webm')).toBe(false);
    await store.save(id, 'media.webm', Buffer.alloc(1_000));
    expect(await store.has(id, 'media.webm')).toBe(true);
    expect((await store.read(id, 'media.webm'))?.length).toBe(1_000);
    expect(await store.bytes(id)).toBeGreaterThanOrEqual(1_000);
    await store.remove(id);
    expect(await store.has(id, 'media.webm')).toBe(false);
    expect(await store.read(id, 'media.webm')).toBeNull();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
