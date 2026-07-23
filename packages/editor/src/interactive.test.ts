import { expect, it } from 'vitest';
import type { MediaClockFit, RecordingMeta, TraceEvent } from '@cutscene/trace';
import type { EditableSegment } from './segments';
import { deriveInteractiveManifest, interactiveArchive, renderInteractivePlayer, type InteractiveManifest } from './interactive';

const meta: RecordingMeta = {
  schemaVersion: 1,
  recordingId: 'rec_interactive',
  createdAt: '2026-07-18T00:00:00.000Z',
  sessionEpoch: 0,
  url: 'https://example.com/',
  origin: 'https://example.com',
  viewport: { width: 1_280, height: 720, dpr: 1 },
  capture: { width: 1_920, height: 1_080, fps: 60 },
  media: { mimeType: 'video/webm', hasAudio: false, durationMs: 10_000 },
  privacy: { maskInputValues: true, captureNetwork: false, maskedSelectors: [] },
  app: { commit: null, version: null, environment: null },
};

const clock: MediaClockFit = {
  slope: 1,
  intercept: 100,
  toMediaTime: (traceTimeMs) => traceTimeMs + 100,
};

function event(id: string, type: 'interaction.click' | 'interaction.input', t: number,
  name: string, value?: string): TraceEvent {
  return {
    v: 1,
    id,
    t,
    type,
    stepId: `step_${id}`,
    route: '/',
    viewport: meta.viewport,
    scroll: { x: 0, y: 0 },
    target: {
      role: type === 'interaction.click' ? 'button' : 'textbox',
      accessibleName: name,
      text: name,
      tagName: type === 'interaction.click' ? 'BUTTON' : 'INPUT',
      boundingBox: { x: 100, y: 50, width: 200, height: 100 },
      locators: [{ type: 'css', value: '.secret-selector', confidence: 0.4 }],
      ...(value === undefined ? {} : { value }),
    },
  } as TraceEvent;
}

const zoom: EditableSegment = {
  id: 'zoom_1',
  eventId: 'click-1',
  startMs: 500,
  clickMs: 1_100,
  endMs: 3_000,
  focus: { x: 100, y: 50, width: 200, height: 100 },
  scale: 2,
  viewport: meta.viewport,
};

function manifest(overrides: Partial<InteractiveManifest> = {}): InteractiveManifest {
  return {
    v: 1,
    recordingId: 'rec_interactive',
    width: 1_920,
    height: 1_080,
    steps: [{ eventId: 'click-1', timeMs: 2_600, label: 'Save',
      box: { x: 300, y: 150, width: 600, height: 300 } }],
    ...overrides,
  };
}

it('derives ordered click hotspots in rendered camera coordinates', () => {
  const result = deriveInteractiveManifest(meta, [
    event('input-1', 'interaction.input', 500, 'Private', 'raw-secret'),
    event('click-1', 'interaction.click', 1_000, 'Save'),
  ], clock, [zoom], 1_500);

  expect(result).toEqual({ ok: true, value: manifest() });
});

it('uses a structural label for masked targets and rejects an empty flow', () => {
  const masked = event('click-1', 'interaction.click', 1_000, '[MASKED]');
  if (masked.target) {
    masked.target.text = '[MASKED]';
    masked.target.role = 'checkbox';
  }
  const result = deriveInteractiveManifest(meta, [masked], clock, [], 0);
  expect(result.ok && result.value.steps[0]?.label).toBe('checkbox');
  expect(deriveInteractiveManifest(meta, [event('input-1', 'interaction.input', 500, 'Input')], clock, [], 0))
    .toEqual({ ok: false, error: 'No clickable trace events captured.' });
});

it('refuses a pixel-only recording that carries no clickable events', () => {
  const systemOnly: TraceEvent[] = [
    { v: 1, id: 'start', t: 0, type: 'system.recordingStart', stepId: 'step_start', route: '/', viewport: meta.viewport, scroll: { x: 0, y: 0 } },
    { v: 1, id: 'nav', t: 100, type: 'navigation', stepId: 'step_nav', route: '/', viewport: meta.viewport, scroll: { x: 0, y: 0 } },
  ];
  expect(deriveInteractiveManifest(meta, systemOnly, clock, [], 0))
    .toEqual({ ok: false, error: 'No clickable trace events captured.' });
});

it('escapes embedded manifest text and includes the complete native player', () => {
  const html = renderInteractivePlayer(manifest({ steps: [{ ...manifest().steps[0]!, label: '</script><img src=x>' }] }));
  expect(html).not.toContain('</script><img src=x>');
  expect(html).toContain('\\u003c/script>');
  expect(html).toContain('Start demo');
  expect(html).toContain('Restart');
  expect(html).toContain('Replay');
  expect(html).toContain('requestVideoFrameCallback');
  expect(html).toContain('prefers-reduced-motion');
});

it('stores only the player and rendered media in the archive', async () => {
  const media = new Uint8Array([1, 2, 3, 4]);
  const archive = await interactiveArchive(new Blob([media], { type: 'video/mp4' }), manifest());
  const text = new TextDecoder().decode(archive);
  expect(text).toContain('index.html');
  expect(text).toContain('demo.mp4');
  expect(archive).toContain(1);
  expect(archive).toContain(4);
});
