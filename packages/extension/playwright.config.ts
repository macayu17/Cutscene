import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  workers: 1,
  // ponytail: retries absorb live-capture timing flake (service-worker cold
  // start, stop-message latency); the underlying guarantees are covered
  // deterministically by the extension unit tests.
  retries: 2,
  use: { trace: 'retain-on-failure' },
});
