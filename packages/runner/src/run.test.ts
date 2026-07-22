import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { editorDistPath, MISSING_EDITOR } from './run.ts';

// Rendering resolves the editor as an installed package first and as the sibling
// workspace package second. Getting this wrong only shows up once published.
it('resolves the editor build that carries the render pipeline', () => {
  const dist = editorDistPath();
  expect(dist.replace(/\\/g, '/')).toMatch(/editor\/dist$/);
  expect(existsSync(join(dist, 'automation.html'))).toBe(true);
});

it('names the fix when the editor build is absent', () => {
  expect(MISSING_EDITOR).toContain('@cutscene/editor');
  expect(MISSING_EDITOR).toContain('--dry-run');
});
