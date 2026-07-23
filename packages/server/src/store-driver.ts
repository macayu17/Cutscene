import { bundleFileExists, deleteRecording, readBundleFile, recordingBytes, saveBundleFile,
  type BundleFile } from './store.ts';

// The bundle byte I/O is the only part of the store that a hosted deployment moves off
// the local disk: media.webm is large and the whole reason to reach for object storage
// (Cloudflare R2, zero egress). Everything else — the expiry file, review.json, the Yjs
// timeline — is small, mutable metadata that stays on a persistent volume beside the
// process. This interface is the seam: the filesystem driver below is the default, and a
// hosted deployment implements the same four methods against R2 and passes it to handle().
//
// ponytail: no R2 driver ships yet — the server runs on a filesystem, which a Fly.io
// persistent volume makes production-ready without it. Add s3Store() here, implementing
// this interface with @aws-sdk/client-s3, when video volume makes egress cost bite.
export interface BundleStore {
  save(id: string, file: BundleFile, data: Buffer): Promise<void>;
  /** Bytes, or null when the file is absent or its recording has expired. */
  read(id: string, file: BundleFile): Promise<Buffer | null>;
  /** Raw presence, without the liveness check read applies. */
  has(id: string, file: BundleFile): Promise<boolean>;
  /** Total bytes of a recording's bundle, for the store cap. */
  bytes(id: string): Promise<number>;
  /** Remove a recording's bundle bytes. */
  remove(id: string): Promise<void>;
}

export function filesystemStore(root: string): BundleStore {
  return {
    save: (id, file, data) => saveBundleFile(root, id, file, data),
    read: (id, file) => readBundleFile(root, id, file),
    has: (id, file) => bundleFileExists(root, id, file),
    bytes: (id) => recordingBytes(root, id),
    remove: (id) => deleteRecording(root, id),
  };
}
