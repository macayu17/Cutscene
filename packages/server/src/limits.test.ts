import { expect, it } from 'vitest';
import { clientKey, createRateLimiter, expiryFrom, isExpired } from './limits.ts';

const now = new Date('2026-07-22T12:00:00.000Z');

it('dates an expiry the configured number of days out', () => {
  expect(expiryFrom(now, 30)).toBe('2026-08-21T12:00:00.000Z');
});

it('treats a passed deadline and an unreadable one as expired', () => {
  expect(isExpired('2026-08-21T12:00:00.000Z', now)).toBe(false);
  expect(isExpired('2026-07-22T11:59:59.000Z', now)).toBe(true);
  expect(isExpired('not a date', now)).toBe(true);
});

it('spends a burst, refuses, then refills over time', () => {
  const limiter = createRateLimiter(2, 60);
  expect(limiter.take('a', 0)).toBe(true);
  expect(limiter.take('a', 0)).toBe(true);
  expect(limiter.take('a', 0)).toBe(false);
  expect(limiter.take('b', 0)).toBe(true); // one client's burst is not another's
  expect(limiter.take('a', 1_000)).toBe(true);
});

it('trusts a forwarding header only where the deployment says to', () => {
  const headers = { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' };
  expect(clientKey(headers, '10.0.0.1', false)).toBe('10.0.0.1');
  expect(clientKey(headers, '10.0.0.1', true)).toBe('203.0.113.7');
  expect(clientKey({}, undefined, true)).toBe('unknown');
});
