import { expect, it } from 'vitest';
import { buildExportPlan } from './export';

const meta = { capture: { width: 1920, height: 1080, fps: 30 } };
const segments = [{ id: 'z1', eventId: 'e1', startMs: 100, clickMs: 500, endMs: 1_400,
  focus: { x: 100, y: 100, width: 640, height: 360 }, scale: 2 }];

it('builds one global-palette 800px README GIF', () => {
  const plan = buildExportPlan('gif', segments, meta);
  expect(plan.output).toBe('output.gif');
  expect(plan.args.join(' ')).toContain('zoompan=');
  expect(plan.args.join(' ')).toContain('[0:v]fps=15,zoompan=');
  expect(plan.args.join(' ')).toContain('in_time');
  expect(plan.args.join(' ')).toContain('s=800x450');
  expect(plan.args.join(' ')).toContain('fps=15');
  expect(plan.args.join(' ')).toContain('palettegen=stats_mode=diff');
  expect(plan.args.join(' ')).toContain('paletteuse=dither=bayer');
  expect(plan.args.join(' ').match(/palettegen/g)).toHaveLength(1);
});

it('builds a 1080p H.264 yuv420p MP4', () => {
  expect(buildExportPlan('mp4', segments, meta).args.join(' ')).toContain('s=1920x1080');
  expect(buildExportPlan('mp4', segments, meta).args).toEqual(expect.arrayContaining(['libx264', 'yuv420p']));
});
