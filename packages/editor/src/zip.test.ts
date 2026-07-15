import { expect, it } from 'vitest';
import { crc32, zipStore } from './zip';

const bytes = (text: string) => new TextEncoder().encode(text);
const u32 = (data: Uint8Array, offset: number) =>
  new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(offset, true);
const u16 = (data: Uint8Array, offset: number) =>
  new DataView(data.buffer, data.byteOffset, data.byteLength).getUint16(offset, true);

it('computes the standard CRC-32 of a known input', () => {
  expect(crc32(bytes('hello'))).toBe(0x3610a686);
  expect(crc32(new Uint8Array())).toBe(0);
});

it('writes a store-method archive with matching signatures and counts', () => {
  const archive = zipStore([{ name: 'a.txt', data: bytes('one') }, { name: 'b.txt', data: bytes('two!') }]);
  expect(u32(archive, 0)).toBe(0x04034b50); // first local file header
  // End-of-central-directory record is the last 22 bytes.
  const eocd = archive.subarray(archive.length - 22);
  expect(u32(eocd, 0)).toBe(0x06054b50);
  expect(u16(eocd, 8)).toBe(2); // entries on this disk
  expect(u16(eocd, 10)).toBe(2); // total entries
});

it('stores payloads uncompressed with the correct crc and size', () => {
  const data = bytes('payload');
  const archive = zipStore([{ name: 'p.bin', data }]);
  expect(u16(archive, 8)).toBe(0); // method 0 = store
  expect(u32(archive, 14)).toBe(crc32(data)); // crc field
  expect(u32(archive, 18)).toBe(data.length); // compressed size
  expect(u32(archive, 22)).toBe(data.length); // uncompressed size
  // The stored bytes follow the 30-byte header plus the name.
  const start = 30 + 'p.bin'.length;
  expect(archive.subarray(start, start + data.length)).toEqual(data);
});

it('produces an empty but valid archive for no entries', () => {
  const archive = zipStore([]);
  expect(archive.length).toBe(22);
  expect(u32(archive, 0)).toBe(0x06054b50);
});
