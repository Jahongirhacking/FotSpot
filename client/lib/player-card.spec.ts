/**
 * Run with `npx tsx --test lib/player-card.spec.ts`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { Media, PlayerProfile } from './api/types';
import {
  attributeHistory,
  cardEvidence,
  claimDate,
  countsTowardsRating,
  currentClaim,
  deriveAttributes,
  sortClipsNewestFilmed,
} from './player-card';

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

const PROCESSING_STATES = ['PROCESSING', 'ACTIVE', 'FAILED'] as const;

test('a verified clip moves the bar at every stage of processing — it plays as the file it has', () => {
  for (const status of PROCESSING_STATES) {
    assert.equal(countsTowardsRating(clip({ status })), true, status);
    assert.equal(currentClaim([clip({ status, rating: 80 })], 'dribbling')?.rating, 80, status);
  }
});

test('an unverified or blocked clip never moves the bar, whatever the worker says', () => {
  for (const moderationStatus of ['UNVERIFIED', 'BLOCKED'] as const) {
    for (const status of PROCESSING_STATES) {
      assert.equal(
        countsTowardsRating(clip({ status, moderationStatus })),
        false,
        `${moderationStatus} ${status}`,
      );
    }
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

const at = (day: string) => `2026-${day}T00:00:00.000Z`;
const rated = (
  category: Media['category'],
  rating: number,
  reportedBy: 'VERIFIED' | 'RELATIVE',
  recordedAt: string,
  createdAt = recordedAt,
) => clip({ id: `${category}-${rating}`, category, rating, reportedBy, recordedAt, createdAt });

// The brief's example, newest filmed first.
const BOARD = [
  rated('DRIBBLING', 40, 'RELATIVE', at('05-05')),
  rated('PACE', 70, 'VERIFIED', at('05-04')),
  rated('DRIBBLING', 30, 'VERIFIED', at('05-03')),
  rated('FINISHING', 60, 'RELATIVE', at('05-02')),
  rated('PACE', 80, 'VERIFIED', at('05-01')),
];
const player = { media: [] } as unknown as PlayerProfile;

test('a bar shows the newest verified clip, and the newest of any kind only when no coach rated the skill', () => {
  assert.deepEqual(
    ['dribbling', 'finishing', 'pace', 'passing'].map(
      (key) => currentClaim(BOARD, key as 'dribbling')?.rating ?? null,
    ),
    [30, 60, 70, null],
  );
  const bars = Object.fromEntries(
    deriveAttributes(player, [], BOARD).map((bar) => [bar.key, [bar.value, bar.provenance]]),
  );
  assert.deepEqual(bars.dribbling, [30, 'coach']);
  assert.deepEqual(bars.finishing, [60, 'relative']);
  assert.deepEqual(bars.pace, [70, 'coach']);
  assert.deepEqual(bars.passing, [null, 'none']);
});

test('"newest" is the day filmed, upload breaking a tie', () => {
  const clips = [
    rated('PACE', 90, 'VERIFIED', at('01-01'), at('09-01')),
    rated('PACE', 50, 'VERIFIED', at('06-01')),
    rated('PACE', 55, 'VERIFIED', at('06-01'), '2026-06-01T12:00:00.000Z'),
  ];
  assert.equal(currentClaim(clips, 'pace')?.rating, 55);
});

test('every tab lists clips by the day filmed, newest first', () => {
  const ids = sortClipsNewestFilmed([
    clip({ id: 'uploaded-last', recordedAt: at('03-01'), createdAt: at('09-01') }),
    clip({ id: 'filmed-last', recordedAt: at('08-01'), createdAt: at('08-02') }),
    clip({
      id: 'highlight',
      category: 'MATCH_HIGHLIGHTS',
      recordedAt: at('05-01'),
      createdAt: at('05-01'),
    }),
  ]).map((row) => row.id);
  assert.deepEqual(ids, ['filmed-last', 'highlight', 'uploaded-last']);
});

test('stars: a verified rating counts in full, a relative one for half, from the clips the board shows', () => {
  const verified = cardEvidence(player, [], [rated('PACE', 100, 'VERIFIED', at('01-01'))]).stars;
  const relative = cardEvidence(player, [], [rated('PACE', 100, 'RELATIVE', at('01-01'))]).stars;
  assert.equal(verified, Math.round((100 / 600) * 5));
  assert.equal(relative, Math.round((50 / 600) * 5));

  // Dribbling: the verified 30 counts, not half of the newer relative 40.
  const board = cardEvidence(player, [], BOARD);
  const same = cardEvidence(
    player,
    [],
    [
      rated('DRIBBLING', 30, 'VERIFIED', at('05-03')),
      rated('PACE', 70, 'VERIFIED', at('05-04')),
      rated('FINISHING', 60, 'RELATIVE', at('05-02')),
    ],
  );
  assert.equal(board.stars, same.stars);
});

test('a formal assessment stands in for a relative number, not for a verified one', () => {
  const assessed = [{ id: 'a1', playerId: 'player-1', speed: 10, createdAt: at('05-01') }] as never;
  const relative = cardEvidence(player, assessed, [rated('PACE', 40, 'RELATIVE', at('01-01'))]);
  const verified = cardEvidence(player, assessed, [rated('PACE', 40, 'VERIFIED', at('01-01'))]);
  assert.ok(relative.stars >= verified.stars);
});
