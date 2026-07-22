import { defineConfig } from 'vitest/config';

// The suite drives the real HTTP surface from one address, so the public write limit
// would throttle it. limits.test.ts covers the limiter itself.
export default defineConfig({
  test: { env: { CUTSCENE_WRITE_BURST: '10000', CUTSCENE_WRITE_PER_MINUTE: '10000' } },
});
