import { expect, it } from 'vitest';
import { parseCaptions, serializeSrt, serializeVtt, type CaptionCue } from './captions';

const cues: CaptionCue[] = [
  { startMs: 1_000, endMs: 4_000, text: 'Hello world' },
  { startMs: 4_000, endMs: 6_500, text: 'Second line\nwrapped' },
];

it('serializes SRT with comma millisecond delimiter and 1-based indices', () => {
  expect(serializeSrt(cues)).toBe(
    '1\n00:00:01,000 --> 00:00:04,000\nHello world\n\n' +
    '2\n00:00:04,000 --> 00:00:06,500\nSecond line\nwrapped\n');
});

it('serializes VTT with a header and dot millisecond delimiter', () => {
  expect(serializeVtt(cues)).toBe(
    'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHello world\n\n' +
    '00:00:04.000 --> 00:00:06.500\nSecond line\nwrapped\n');
});

it('round-trips SRT through parse and serialize', () => {
  const parsed = parseCaptions(serializeSrt(cues));
  expect(parsed.ok && parsed.value).toEqual(cues);
});

it('round-trips VTT through parse and serialize', () => {
  const parsed = parseCaptions(serializeVtt(cues));
  expect(parsed.ok && parsed.value).toEqual(cues);
});

it('parses VTT with a header, notes, and cue identifiers', () => {
  const parsed = parseCaptions('WEBVTT\n\nNOTE speaker A\n\nintro\n00:00:01.000 --> 00:00:02.000\nHi\n');
  expect(parsed.ok && parsed.value).toEqual([{ startMs: 1_000, endMs: 2_000, text: 'Hi' }]);
});

it('accepts VTT timestamps without an hours field', () => {
  const parsed = parseCaptions('WEBVTT\n\n00:05.000 --> 00:07.000\nNo hours\n');
  expect(parsed.ok && parsed.value).toEqual([{ startMs: 5_000, endMs: 7_000, text: 'No hours' }]);
});

it('tolerates CRLF and a BOM', () => {
  const parsed = parseCaptions('﻿1\r\n00:00:01,000 --> 00:00:02,000\r\nHi\r\n');
  expect(parsed.ok && parsed.value).toEqual([{ startMs: 1_000, endMs: 2_000, text: 'Hi' }]);
});

it('rejects an empty or cue-less transcript', () => {
  expect(parseCaptions('   ').ok).toBe(false);
  expect(parseCaptions('WEBVTT\n\njust text, no timing').ok).toBe(false);
});

it('rejects a cue that ends before it starts', () => {
  expect(parseCaptions('00:00:05,000 --> 00:00:02,000\nBackwards').ok).toBe(false);
});
