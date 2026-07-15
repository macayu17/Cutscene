import { afterEach, expect, it, vi } from 'vitest';
import { buildExportPlan } from './export';
import { renderBrandCard, renderBrandWatermark } from './brand-render';

afterEach(() => vi.unstubAllGlobals());

const meta = { capture: { width: 1920, height: 1080, fps: 30 }, media: { durationMs: 5_000, hasAudio: true } };
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
const redaction = { x: 100, y: 200, width: 300, height: 40, blurRadius: 10, startSeconds: 1, endSeconds: 2 };

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

it.each(['gif', 'mp4'] as const)('blurs source pixels before zoom and keeps callouts after zoom for %s', (format) => {
  const command = buildExportPlan(format, segments, meta, [overlay], [redaction]).args.join(' ');
  expect(command).toContain("crop=300:40:100:200,boxblur=10[redact_patch_0]");
  expect(command).toContain("overlay=100:200:enable='between(t,1,2)'[redacted_0]");
  expect(command.indexOf('boxblur=')).toBeLessThan(command.indexOf('zoompan='));
  expect(command.indexOf('zoompan=')).toBeLessThan(command.indexOf('[base][1:v]overlay='));
  if (format === 'gif') {
    expect(command.indexOf('[base][1:v]overlay=')).toBeLessThan(command.indexOf('palettegen='));
    expect(command.match(/palettegen/g)).toHaveLength(1);
  }
});

it('builds an undistorted 1080x1920 crop and pan after redaction and before callouts', () => {
  const plan = buildExportPlan('vertical', segments, meta, [overlay], [redaction]);
  const command = plan.args.join(' ');
  expect(plan).toMatchObject({ output: 'output.mp4', mimeType: 'video/mp4' });
  expect(command).toContain('crop=594:1056');
  expect(command).toContain('scale=1080:1920:flags=lanczos,setsar=1');
  expect(command).not.toContain('zoompan=');
  expect(command.indexOf('boxblur=')).toBeLessThan(command.indexOf('crop=594:1056'));
  expect(command.indexOf('scale=1080:1920')).toBeLessThan(command.indexOf('[base][1:v]overlay='));
  expect(plan.args).toEqual(expect.arrayContaining(['-map', '[out]', '-map', '0:a?', '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p']));
});

const cards = { introFilename: 'intro.png', outroFilename: 'outro.png', introSeconds: 1.5, outroSeconds: 1.5 };

it('concatenates branded GIF cards after overlays and before one global palette', () => {
  const plan = buildExportPlan('gif', segments, meta, [overlay], [redaction], cards);
  const command = plan.args.join(' ');
  expect(command).toContain('-i callout_0.png -loop 1 -t 1.5 -i intro.png -loop 1 -t 1.5 -i outro.png');
  expect(command).toContain('[base][1:v]overlay=120:80');
  expect(command).toContain('[2:v]fps=15,scale=800:450:flags=lanczos,setsar=1[intro]');
  expect(command).toContain('[3:v]fps=15,scale=800:450:flags=lanczos,setsar=1[outro]');
  expect(command).toContain('[intro][overlay_0][outro]concat=n=3:v=1:a=0[branded]');
  expect(command.indexOf('boxblur=')).toBeLessThan(command.indexOf('zoompan='));
  expect(command.indexOf('[base][1:v]overlay=')).toBeLessThan(command.indexOf('concat=n=3'));
  expect(command.indexOf('concat=n=3')).toBeLessThan(command.indexOf('palettegen='));
  expect(command.match(/palettegen/g)).toHaveLength(1);
});

it('delays source audio for an intro and pads it for an outro in branded MP4', () => {
  const plan = buildExportPlan('mp4', segments, meta, [overlay], [], cards);
  const command = plan.args.join(' ');
  expect(command).toContain('[2:v]fps=60,scale=1920:1080:flags=lanczos,setsar=1[intro]');
  expect(command).toContain('[3:v]fps=60,scale=1920:1080:flags=lanczos,setsar=1[outro]');
  expect(command).toContain('[intro][overlay_0][outro]concat=n=3:v=1:a=0[branded]');
  expect(command).toContain('[0:a]adelay=1500:all=1,apad=pad_dur=1.5[audio]');
  expect(plan.args).toEqual(expect.arrayContaining(['-map', '[branded]', '-map', '[audio]']));
});

it('builds intro-only vertical cards at the target geometry without padding audio', () => {
  const intro = buildExportPlan('vertical', segments, meta, [], [], {
    introFilename: 'intro.png', introSeconds: 1.5, outroSeconds: 0,
  });
  const command = intro.args.join(' ');
  expect(command).toContain('-loop 1 -t 1.5 -i intro.png');
  expect(command).toContain('[1:v]fps=60,scale=1080:1920:flags=lanczos,setsar=1[intro]');
  expect(command).toContain('[intro][base]concat=n=2:v=1:a=0[branded]');
  expect(command).toContain('[0:a]adelay=1500:all=1[audio]');
  expect(command).not.toContain('apad=');
});

it('builds outro-only MP4 cards and pads audio without delaying it', () => {
  const outro = buildExportPlan('mp4', segments, meta, [], [], {
    outroFilename: 'outro.png', introSeconds: 0, outroSeconds: 1.5,
  });
  const command = outro.args.join(' ');
  expect(command).toContain('-loop 1 -t 1.5 -i outro.png');
  expect(command).toContain('[1:v]fps=60,scale=1920:1080:flags=lanczos,setsar=1[outro]');
  expect(command).toContain('[base][outro]concat=n=2:v=1:a=0[branded]');
  expect(command).toContain('[0:a]apad=pad_dur=1.5[audio]');
  expect(command).not.toContain('adelay=');
});

it('does not reference source audio when branded media has no audio', () => {
  const plan = buildExportPlan('mp4', segments, { ...meta, media: { ...meta.media, hasAudio: false } }, [], [], cards);
  expect(plan.args.join(' ')).not.toContain('0:a');
  expect(plan.args).not.toContain('[audio]');
});

it.each(['gif', 'mp4', 'vertical'] as const)('keeps the existing unbranded %s plan byte-for-byte', (format) => {
  const existing = buildExportPlan(format, segments, meta, [overlay], [redaction]);
  expect(buildExportPlan(format, segments, meta, [overlay], [redaction], {
    introSeconds: 0, outroSeconds: 0,
  })).toEqual(existing);
});

it('renders a centered, contrasting brand card as PNG bytes', async () => {
  const { canvas, context } = fakeCanvas();
  vi.stubGlobal('document', { createElement: () => canvas });
  const bytes = await renderBrandCard('Launch', {
    id: 'brand', name: 'Brand', color: '#FFFFFF', font: 'sans', intro: '', outro: '', watermark: '',
  }, { width: 800, height: 450 });
  expect(bytes).toEqual(new Uint8Array([1, 2]));
  expect(canvas).toMatchObject({ width: 800, height: 450 });
  expect(context.fillStyle).toBe('#16181C');
  expect(context.font).toContain('"IBM Plex Sans", sans-serif');
  expect(context.textAlign).toBe('center');
  expect(context.fillText).toHaveBeenCalledWith('Launch', 400, 225, 720);
});

it('renders a transparent, right-aligned watermark in preset colour', async () => {
  const { canvas, context } = fakeCanvas();
  vi.stubGlobal('document', { createElement: () => canvas });
  await renderBrandWatermark('ACME', {
    id: 'brand', name: 'Brand', color: '#336699', font: 'mono', intro: '', outro: '', watermark: '',
  }, { width: 460, height: 68 });
  expect(canvas).toMatchObject({ width: 460, height: 68 });
  expect(context.fillRect).not.toHaveBeenCalled();
  expect(context.fillStyle).toBe('#336699');
  expect(context.font).toContain('"IBM Plex Mono", monospace');
  expect(context.textAlign).toBe('right');
  expect(context.fillText).toHaveBeenCalledWith('ACME', 452, 34, 444);
});

function fakeCanvas() {
  const context = {
    fillStyle: '', font: '', textAlign: 'start', textBaseline: 'alphabetic',
    fillRect: vi.fn(), fillText: vi.fn(),
  };
  const canvas = {
    width: 0, height: 0,
    getContext: () => context,
    toBlob: (callback: BlobCallback) => callback(new Blob([new Uint8Array([1, 2])], { type: 'image/png' })),
  };
  return { canvas: canvas as unknown as HTMLCanvasElement,
    context: context as typeof context & { textAlign: string; textBaseline: string } };
}
