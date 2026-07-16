import type { Result } from './schema.ts';

// Transcript and captions. Phase 4 does not transcribe audio: word-level timing
// comes from an imported SRT or VTT (or a manually entered cue list), and the
// editor exports both formats. An ASR engine is deliberately not bundled; that
// is Phase 8 territory. The cue model is anchored to media time so a later ASR
// pass can populate the same structure without a schema change.

export type CaptionCue = { startMs: number; endMs: number; text: string };

function pad(value: number, width: number): string {
  return String(Math.floor(value)).padStart(width, '0');
}

function formatTimestamp(ms: number, msDelimiter: ',' | '.'): string {
  const clamped = Math.max(0, Math.round(ms));
  const hours = Math.floor(clamped / 3_600_000);
  const minutes = Math.floor((clamped % 3_600_000) / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1_000);
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}${msDelimiter}${pad(clamped % 1_000, 3)}`;
}

const CUE_TIME = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})\s*-->\s*(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;

function toMs(hours: string | undefined, minutes: string, seconds: string, fraction: string): number {
  return (Number(hours ?? 0) * 3_600 + Number(minutes) * 60 + Number(seconds)) * 1_000 +
    Number(fraction.padEnd(3, '0'));
}

export function parseCaptions(input: string): Result<CaptionCue[]> {
  const normalized = input.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const cues: CaptionCue[] = [];
  for (const block of normalized.split(/\n{2,}/)) {
    const trimmed = block.trim();
    if (!trimmed || /^WEBVTT/.test(trimmed) || /^NOTE(\s|$)/.test(trimmed)) continue;
    const lines = trimmed.split('\n');
    const timeIndex = lines.findIndex((line) => CUE_TIME.test(line));
    if (timeIndex === -1) continue;
    const match = CUE_TIME.exec(lines[timeIndex]!)!;
    const startMs = toMs(match[1], match[2]!, match[3]!, match[4]!);
    const endMs = toMs(match[5], match[6]!, match[7]!, match[8]!);
    if (endMs < startMs) return { ok: false, error: 'caption cue ends before it starts' };
    const text = lines.slice(timeIndex + 1).join('\n').trim();
    if (text) cues.push({ startMs, endMs, text });
  }
  if (cues.length === 0) return { ok: false, error: 'no caption cues found' };
  return { ok: true, value: cues };
}

export function serializeSrt(cues: readonly CaptionCue[]): string {
  return cues.map((cue, index) =>
    `${index + 1}\n${formatTimestamp(cue.startMs, ',')} --> ${formatTimestamp(cue.endMs, ',')}\n${cue.text}`,
  ).join('\n\n') + '\n';
}

export function serializeVtt(cues: readonly CaptionCue[]): string {
  const body = cues.map((cue) =>
    `${formatTimestamp(cue.startMs, '.')} --> ${formatTimestamp(cue.endMs, '.')}\n${cue.text}`,
  ).join('\n\n');
  return `WEBVTT\n\n${body}${body ? '\n' : ''}`;
}
