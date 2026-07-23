import { expect, it } from 'vitest';
import { reviewPage } from './review-page.ts';

it('renders the dependency-free semantic review client', () => {
  const html = reviewPage('12345678-1234-4123-8123-123456789abc');

  expect(html).toContain('id="review-video"');
  expect(html).toContain('id="semantic-box"');
  expect(html).toContain('id="event-list"');
  expect(html).toContain('id="comment-form"');
  expect(html).toContain('id="join-form"');
  expect(html).toContain('id="invitation-form"');
  expect(html).toContain('id="member-list"');
  expect(html).toContain('id="member-link"');
  expect(html).toContain('data-state="approved"');
  expect(html).toContain('location.hash');
  expect(html).toContain('sessionStorage');
  expect(html).not.toContain('location.search');
  expect(html).toContain('/join');
  expect(html).toContain('/comments');
  expect(html).toContain('/presence');
  expect(html).toContain('/state');
  expect(html).toContain('/invitations');
  expect(html).toContain('textContent');
  expect(html).toContain('--signal:#F2A63B');
  expect(html).toContain('prefers-reduced-motion');
  expect(html).not.toContain('border-radius');
});

it('shows view count, expiry, and an owner-gated delete control', () => {
  const html = reviewPage('12345678-1234-4123-8123-123456789abc', {
    views: 1, expiresAt: '2026-08-22T09:00:00.000Z',
  });
  expect(html).toContain('1 view'); // singular
  expect(html).not.toContain('1 views');
  expect(html).toContain('expires 2026-08-22');
  expect(html).toContain('id="delete-recording"');
  expect(html).toContain('id="report-recording"');
  expect(html).toContain('/report');
  // Delete is shown only for the owner and calls the owner-only DELETE endpoint.
  expect(html).toContain("byId('delete-recording').hidden=current?.role!=='owner'");
  expect(html).toContain("method:'DELETE'");

  expect(reviewPage('12345678-1234-4123-8123-123456789abc', { views: 2, expiresAt: null }))
    .toContain('2 views'); // plural
});
