/**
 * Run with `npx tsx --test lib/player-card.spec.ts`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { Media } from './api/types';
import { attributeHistory, claimDate, countsTowardsRating, currentClaim } from './player-card';

const clip = (overrides: Partial<Media>): Media =>
  ({
    id: Math.random().toString(36).slice(2),
    playerId: 'player-1',
    type: 'VIDEO',
    category: 'DRIBBLING',
    status: 'ACTIVE',
    moderationStatus: 'VERIFIED',
    rating: 70,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }) as Media;

test('a verified clip still being optimised moves the bar — it plays as the original', () => {
  assert.equal(countsTowardsRating(clip({ status: 'PROCESSING' })), true);
  assert.equal(currentClaim([clip({ status: 'PROCESSING', rating: 80 })], 'dribbling')?.rating, 80);
});

test('an unverified or blocked clip never moves the bar, whatever its status', () => {
  assert.equal(countsTowardsRating(clip({ moderationStatus: 'UNVERIFIED' })), false);
  assert.equal(
    countsTowardsRating(clip({ status: 'PROCESSING', moderationStatus: 'UNVERIFIED' })),
    false,
  );
  assert.equal(countsTowardsRating(clip({ moderationStatus: 'BLOCKED' })), false);
});

test('a failed, flagged or removed clip does not count', () => {
  for (const status of ['FAILED', 'FLAGGED', 'REMOVED'] as const) {
    assert.equal(countsTowardsRating(clip({ status })), false, status);
  }
});

test('a clip with no rating is not a claim', () => {
  assert.equal(countsTowardsRating(clip({ rating: null })), false);
});

test('the history is ordered by the day the clip was filmed, not the upload', () => {
  const filmedInMay = clip({
    id: 'may',
    rating: 60,
    recordedAt: '2026-05-10T00:00:00.000Z',
    createdAt: '2026-09-20T00:00:00.000Z',
  });
  const filmedInSeptember = clip({
    id: 'sep',
    rating: 80,
    recordedAt: '2026-09-05T00:00:00.000Z',
    createdAt: '2026-09-06T00:00:00.000Z',
  });

  const history = attributeHistory([filmedInSeptember, filmedInMay], 'dribbling');

  assert.deepEqual(
    history.map((row) => row.id),
    ['may', 'sep'],
  );
  assert.equal(currentClaim(history, 'dribbling')?.rating, 80);
  assert.equal(claimDate(filmedInMay), '2026-05-10T00:00:00.000Z');
});

test('a clip that does not say when it was filmed is dated by its upload', () => {
  assert.equal(
    claimDate(clip({ createdAt: '2026-09-01T00:00:00.000Z' })),
    '2026-09-01T00:00:00.000Z',
  );
});
