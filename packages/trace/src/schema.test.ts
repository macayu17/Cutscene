import { describe, expect, expectTypeOf, it } from 'vitest';
import { parseRecordingMeta, parseTraceEvent, type TraceEvent } from './schema';

const envelope = {
  v: 1,
  id: 'evt_1',
  t: 42,
  stepId: 'step_1',
  route: '/projects',
  viewport: { width: 1280, height: 800, dpr: 1.5 },
  scroll: { x: 0, y: 240 },
};

describe('parseTraceEvent', () => {
  it.each([
    'system.recordingStart',
    'system.recordingStop',
    'system.clockSync',
    'navigation',
    'interaction.click',
    'interaction.input',
    'interaction.scroll',
    'viewport.resize',
  ])('parses %s', (type) => {
    const event = type === 'system.clockSync'
      ? { ...envelope, type, contentClockMs: 40, workerClockMs: 43, mediaTimeMs: 41 }
      : { ...envelope, type };

    expect(parseTraceEvent(event)).toEqual({ ok: true, value: event });
  });

  it('rejects an event without v: 1', () => {
    expect(parseTraceEvent({ ...envelope, v: 2, type: 'interaction.click' })).toEqual({
      ok: false,
      error: 'trace event must have v: 1',
    });
  });

  it('requires finite pointer coordinates on hover samples', () => {
    const hover = { ...envelope, type: 'interaction.hover', pointer: { x: 12, y: 34 } };
    expect(parseTraceEvent(hover)).toEqual({ ok: true, value: hover });
    expect(parseTraceEvent({ ...envelope, type: 'interaction.hover' })).toEqual({
      ok: false,
      error: 'pointer sample is invalid',
    });
    expect(parseTraceEvent({ ...hover, pointer: { x: Infinity, y: 34 } })).toEqual({
      ok: false,
      error: 'pointer sample is invalid',
    });
  });

  it('rejects target data on hover samples', () => {
    type HoverEvent = Extract<TraceEvent, { type: 'interaction.hover' }>;
    expectTypeOf<HoverEvent['target']>().toEqualTypeOf<undefined>();
    expect(parseTraceEvent({ ...envelope, type: 'interaction.hover', pointer: { x: 12, y: 34 }, target: {} }))
      .toEqual({ ok: false, error: 'hover sample is invalid' });
  });

  it('keeps click pointer data optional and validates it when present', () => {
    const oldClick = { ...envelope, type: 'interaction.click' };
    const click = { ...oldClick, pointer: { x: 12, y: 34 } };
    expect(parseTraceEvent(oldClick)).toEqual({ ok: true, value: oldClick });
    expect(parseTraceEvent(click)).toEqual({ ok: true, value: click });
    expect(parseTraceEvent({ ...click, pointer: { x: Number.NaN, y: 2 } })).toEqual({
      ok: false,
      error: 'pointer sample is invalid',
    });
  });

  it('parses privacy-safe redaction geometry and rejects malformed samples', () => {
    const visible = { ...envelope, type: 'annotation.redaction', selector: '.customer-email', instanceId: 'redaction_1',
      visible: true, box: { x: 20, y: 30, width: 180, height: 24 } };
    const hidden = { ...visible, visible: false };
    delete (hidden as { box?: unknown }).box;
    expect(parseTraceEvent(visible)).toEqual({ ok: true, value: visible });
    expect(parseTraceEvent(hidden)).toEqual({ ok: true, value: hidden });
    expect(parseTraceEvent({ ...visible, selector: '' })).toEqual({ ok: false, error: 'redaction sample is invalid' });
    expect(parseTraceEvent({ ...visible, visible: 'yes' })).toEqual({ ok: false, error: 'redaction sample is invalid' });
    expect(parseTraceEvent({ ...visible, box: { x: 1 } })).toEqual({ ok: false, error: 'redaction sample is invalid' });
    expect(parseTraceEvent({ ...visible, target: {} })).toEqual({ ok: false, error: 'redaction sample is invalid' });
    expect(parseTraceEvent({ ...visible, text: 'secret' })).toEqual({ ok: false, error: 'redaction sample is invalid' });
    expect(parseTraceEvent({ ...visible, value: 'secret' })).toEqual({ ok: false, error: 'redaction sample is invalid' });
  });
});

describe('parseRecordingMeta', () => {
  it('round-trips the complete metadata contract', () => {
    const meta = {
      schemaVersion: 1,
      recordingId: 'rec_1',
      createdAt: '2026-07-14T09:00:00.000Z',
      sessionEpoch: 1_752_483_600_000,
      url: 'https://app.example.com/dashboard',
      origin: 'https://app.example.com',
      viewport: { width: 1280, height: 800, dpr: 1.5 },
      capture: { width: 1920, height: 1080, fps: 30 },
      media: { mimeType: 'video/webm;codecs=vp9', hasAudio: false, durationMs: 61_340 },
      privacy: {
        maskInputValues: true,
        captureNetwork: false,
        maskedSelectors: ['[data-sensitive]', 'input[type=password]'],
        visualRedactionSelectors: ['.customer-email'],
      },
      app: { commit: null, version: null, environment: null },
    };

    const parsed = parseRecordingMeta(JSON.parse(JSON.stringify(meta)));
    expect(parsed).toEqual({ ok: true, value: meta });
  });

  it('accepts old metadata and rejects malformed visual redaction selectors', () => {
    const base = {
      schemaVersion: 1, recordingId: 'rec_1', createdAt: '2026-07-14T09:00:00.000Z', sessionEpoch: 1,
      url: 'https://example.com', origin: 'https://example.com', viewport: envelope.viewport,
      capture: { width: 1920, height: 1080, fps: 30 }, media: { mimeType: 'video/webm', hasAudio: false, durationMs: 1 },
      privacy: { maskInputValues: true, captureNetwork: false, maskedSelectors: [] },
      app: { commit: null, version: null, environment: null },
    };
    expect(parseRecordingMeta(base).ok).toBe(true);
    expect(parseRecordingMeta({ ...base, privacy: { ...base.privacy, visualRedactionSelectors: ['.safe', 2] } }))
      .toEqual({ ok: false, error: 'metadata privacy is invalid' });
  });
});
