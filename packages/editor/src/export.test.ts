import { expect, it } from 'vitest';
import { buildExportPlan } from './export';

const meta = { capture: { width: 1920, height: 1080, fps: 30 } };
const segments = [{ id: 'z1', eventId: 'e1', startMs: 350, clickMs: 1_000, endMs: 2_650,
  focus: { x: 100, y: 100, width: 640, height: 360 }, scale: 1.8, viewport: { width: 1_200, height: 760 } }];

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
  const plan = buildExportPlan('mp4', segments, meta);
  expect(plan.args.join(' ')).toContain('fps=60,zoompan=');
  expect(plan.args.join(' ')).toContain('s=1920x1080:fps=60');
  expect(plan.args).toEqual(expect.arrayContaining(['libx264', 'yuv420p', 'ultrafast']));
  expect(plan.args.join(' ')).toContain('max(iw/(2*zoom)');
});

const overlay = { filename: 'callout_0.png', x: 120, y: 80, startSeconds: 1, endSeconds: 2 };

it('composites callouts before the GIF global palette', () => {
  const plan = buildExportPlan('gif', segments, meta, [overlay]);
  const command = plan.args.join(' ');
  expect(command).toContain('-i callout_0.png');
  expect(command).toContain("overlay=120:80:enable='between(t,1,2)':eof_action=repeat");
  expect(command.indexOf('overlay=')).toBeLessThan(command.indexOf('palettegen='));
  expect(command.match(/palettegen/g)).toHaveLength(1);
});

it('maps filtered callout video and optional source audio for MP4', () => {
  const plan = buildExportPlan('mp4', segments, meta, [overlay]);
  expect(plan.args.join(' ')).toContain("overlay=120:80:enable='between(t,1,2)':eof_action=repeat");
  expect(plan.args).toEqual(expect.arrayContaining(['-map', '[out]', '-map', '0:a?']));
});
