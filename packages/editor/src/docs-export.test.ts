import { afterEach, expect, it, vi } from 'vitest';
import type { TraceEvent } from '@cutscene/trace';
import { renderStepShots } from './docs-export';

afterEach(() => vi.unstubAllGlobals());

it('paints active trace redaction regions opaquely over documentation screenshots', async () => {
  const context = { drawImage: vi.fn(), fillRect: vi.fn(), fillStyle: '' };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toBlob: (callback: BlobCallback) => callback(new Blob([new Uint8Array([1])], { type: 'image/png' })),
  };
  vi.stubGlobal('document', { createElement: () => canvas });
  const viewport = { width: 1_000, height: 500, dpr: 1 };
  const envelope = { v: 1 as const, route: '/', viewport, scroll: { x: 0, y: 0 } };
  const events = [
    { ...envelope, id: 'redaction', t: 0, stepId: 'redaction', type: 'annotation.redaction', selector: '.secret',
      instanceId: 'one', visible: true, box: { x: 110, y: 110, width: 20, height: 10 } },
    { ...envelope, id: 'click', t: 0, stepId: 'step_1', type: 'interaction.click', target: {
      role: 'button', accessibleName: 'Save', text: 'Save', tagName: 'BUTTON', locators: [],
      boundingBox: { x: 100, y: 100, width: 100, height: 50 },
    } },
  ] as TraceEvent[];
  const video = { currentTime: 0, videoWidth: 1_000, videoHeight: 500 } as HTMLVideoElement;

  await renderStepShots(video, events, { viewport }, (time) => time);

  expect(context.fillStyle).toBe('#16181C');
  expect(context.fillRect).toHaveBeenCalledWith(68, 68, 40, 20);
});
