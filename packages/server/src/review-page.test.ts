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
