import {
  FEED_SCORE,
  diversityPenalty,
  explorationNoise,
  feedScore,
  rankFeed,
  type FeedScoreInput,
} from './feed-score.util';

/**
 * The ranking as arithmetic. Every case here is a claim about the SQL in
 * `MediaService.feed`, which computes the same expression from the same
 * constants; a change to a weight that breaks one of these is a change to
 * what readers see.
 */

const DAY = 24 * 60 * 60;

/** A brand-new account looking at a clip it has no history with. */
function clip(overrides: Partial<FeedScoreInput> & { mediaId: string }): FeedScoreInput {
  return {
    ageSeconds: 30 * DAY,
    likes: 0,
    views: 0,
    likesRecent: 0,
    viewsRecent: 0,
    globalWeight: 0,
    followers: 0,
    following: false,
    affinity: 0,
    seenSecondsAgo: null,
    likedByViewer: false,
    seed: 'seed-a',
    ...overrides,
  };
}

/** The score with the session noise taken out, so comparisons are about the terms. */
const deterministic = (input: FeedScoreInput) =>
  feedScore(input) - FEED_SCORE.EXPLORE_TERM * explorationNoise(input.mediaId, input.seed);

describe('a new account with no history', () => {
  it('sees a fresh, well-liked clip above an old one that merely has views', () => {
    const oldPopular = clip({
      mediaId: 'old',
      ageSeconds: 200 * DAY,
      views: 5000,
      likes: 60,
      likesRecent: 0,
      viewsRecent: 3,
    });
    const freshEngaged = clip({
      mediaId: 'fresh',
      ageSeconds: 1 * DAY,
      views: 80,
      likes: 12,
      likesRecent: 12,
      viewsRecent: 80,
    });
    expect(deterministic(freshEngaged)).toBeGreaterThan(deterministic(oldPopular));
  });

  it('is not pinned to an old clip by scout-earned weight alone', () => {
    // A well-backed player's stale clip against an unknown player's new one
    // that people are actually liking this week.
    const backedOld = clip({
      mediaId: 'backed',
      ageSeconds: 120 * DAY,
      globalWeight: 20,
      likes: 30,
      views: 3000,
    });
    const unknownFresh = clip({
      mediaId: 'unknown',
      ageSeconds: 2 * DAY,
      likes: 9,
      likesRecent: 9,
      views: 40,
      viewsRecent: 40,
    });
    expect(deterministic(unknownFresh)).toBeGreaterThan(deterministic(backedOld));
  });

  it('raw lifetime views on their own move nothing upward', () => {
    const quiet = clip({ mediaId: 'a', views: 10 });
    const viewed = clip({ mediaId: 'a', views: 10000 });
    // Views only enter as a denominator and as the under-exposure decay, so
    // more views without likes can only lower the score.
    expect(deterministic(viewed)).toBeLessThanOrEqual(deterministic(quiet));
  });

  it('exploration lifts a clip almost nobody has seen', () => {
    const unseenByAll = clip({ mediaId: 'a', views: 0 });
    const wellExposed = clip({ mediaId: 'a', views: 400 });
    expect(deterministic(unseenByAll) - deterministic(wellExposed)).toBeCloseTo(
      FEED_SCORE.UNDER_EXPOSED_TERM * (1 - Math.exp(-400 / FEED_SCORE.UNDER_EXPOSED_VIEWS)),
      6,
    );
  });
});

describe('recency', () => {
  it('is worth the most on upload and is spent within two weeks', () => {
    const today = deterministic(clip({ mediaId: 'a', ageSeconds: 0 }));
    const threeDays = deterministic(clip({ mediaId: 'a', ageSeconds: 3 * DAY }));
    const twoWeeks = deterministic(clip({ mediaId: 'a', ageSeconds: 14 * DAY }));
    const baseline = deterministic(clip({ mediaId: 'a', ageSeconds: 365 * DAY }));
    expect(today - baseline).toBeCloseTo(FEED_SCORE.FRESH_TERM, 3);
    expect(today).toBeGreaterThan(threeDays);
    expect(threeDays).toBeGreaterThan(twoWeeks);
    expect(twoWeeks - baseline).toBeLessThan(0.1);
  });

  it('a future-dated clip is treated as brand new, not as negative age', () => {
    expect(deterministic(clip({ mediaId: 'a', ageSeconds: -3600 }))).toBeCloseTo(
      deterministic(clip({ mediaId: 'a', ageSeconds: 0 })),
      9,
    );
  });
});

describe('engagement', () => {
  it('rate counts more than volume: 20 likes on 100 views beats 20 likes on 10,000', () => {
    const tight = clip({ mediaId: 'a', likes: 20, views: 100 });
    const diluted = clip({ mediaId: 'a', likes: 20, views: 10000 });
    expect(deterministic(tight)).toBeGreaterThan(deterministic(diluted));
  });

  it('the rate is smoothed: a few likes on no views is not a perfect score', () => {
    const rate = (likes: number, views: number) =>
      deterministic(clip({ mediaId: 'a', likes, views })) -
      deterministic(clip({ mediaId: 'a', likes: 0, views }));
    // Three likes on zero views: 3 / (0 + prior) of the rate term, plus the damped lifetime term.
    const expected =
      FEED_SCORE.RATE_TERM * (3 / FEED_SCORE.RATE_PRIOR_VIEWS) +
      FEED_SCORE.LIFETIME_LIKES_TERM * Math.log(4);
    expect(rate(3, 0)).toBeCloseTo(expected, 6);
    expect(rate(3, 0)).toBeLessThan(
      FEED_SCORE.RATE_TERM + FEED_SCORE.LIFETIME_LIKES_TERM * Math.log(4),
    );
  });

  it('recent engagement outweighs the same engagement long ago', () => {
    const lastWeek = clip({ mediaId: 'a', likes: 10, likesRecent: 10, views: 50, viewsRecent: 50 });
    const lastYear = clip({ mediaId: 'a', likes: 10, likesRecent: 0, views: 50, viewsRecent: 0 });
    expect(deterministic(lastWeek) - deterministic(lastYear)).toBeCloseTo(
      FEED_SCORE.VELOCITY_TERM * Math.log(1 + 10 + FEED_SCORE.VIEW_AS_LIKE * 50),
      6,
    );
  });

  it('lifetime likes are a weak signal: a thousand likes is worth less than a follow', () => {
    const famous = clip({ mediaId: 'a', likes: 1000, views: 100000 });
    const plain = clip({ mediaId: 'a' });
    expect(deterministic(famous) - deterministic(plain)).toBeLessThan(FEED_SCORE.FOLLOW_TERM * 2);
  });
});

describe('following', () => {
  it('a followed player’s unseen clip is the strongest positive lift', () => {
    const stranger = clip({ mediaId: 'a' });
    const followed = clip({ mediaId: 'a', following: true });
    expect(deterministic(followed) - deterministic(stranger)).toBeCloseTo(
      FEED_SCORE.FOLLOW_TERM + FEED_SCORE.FOLLOWED_UNSEEN_TERM,
      9,
    );
    // Bigger than anything a fresh, popular stranger's clip can earn from freshness alone.
    expect(FEED_SCORE.FOLLOW_TERM + FEED_SCORE.FOLLOWED_UNSEEN_TERM).toBeGreaterThan(
      FEED_SCORE.FRESH_TERM,
    );
  });

  it('once watched, the followed clip keeps only the flat follow bonus', () => {
    const unseen = clip({ mediaId: 'a', following: true });
    const seenLastWeek = clip({ mediaId: 'a', following: true, seenSecondsAgo: 8 * DAY });
    const strangerSeenLastWeek = clip({ mediaId: 'a', seenSecondsAgo: 8 * DAY });
    expect(deterministic(unseen)).toBeGreaterThan(deterministic(seenLastWeek));
    expect(deterministic(seenLastWeek) - deterministic(strangerSeenLastWeek)).toBeCloseTo(
      FEED_SCORE.FOLLOW_TERM,
      9,
    );
  });

  it('player popularity counts, damped', () => {
    const nobody = clip({ mediaId: 'a', followers: 0 });
    const known = clip({ mediaId: 'a', followers: 50 });
    expect(deterministic(known) - deterministic(nobody)).toBeCloseTo(
      FEED_SCORE.POPULARITY_TERM * Math.log(51),
      9,
    );
  });
});

describe('what the viewer has already done', () => {
  it('a clip watched within the hour is pushed below everything positive', () => {
    // A strong clip by every measure at once: uploaded today, liked forty
    // times this week, from a followed, well-backed, well-followed player in
    // the viewer's favourite category.
    const best = clip({
      mediaId: 'a',
      ageSeconds: 0,
      likes: 40,
      views: 300,
      likesRecent: 40,
      viewsRecent: 300,
      globalWeight: 20,
      followers: 100,
      following: true,
      affinity: 0.5,
    });
    const justWatched = { ...best, seenSecondsAgo: 60 };
    expect(feedScore(justWatched)).toBeLessThan(feedScore(clip({ mediaId: 'a' })));
  });

  it('a liked clip stays down, whatever else it has', () => {
    const liked = clip({
      mediaId: 'a',
      likedByViewer: true,
      likes: 300,
      following: true,
      ageSeconds: 0,
    });
    expect(feedScore(liked)).toBeLessThan(feedScore(clip({ mediaId: 'a' })));
  });

  it('affinity colours the order without overriding freshness', () => {
    const inCategory = clip({ mediaId: 'a', affinity: 1 });
    const outOfCategory = clip({ mediaId: 'a', affinity: 0 });
    expect(deterministic(inCategory) - deterministic(outOfCategory)).toBeCloseTo(
      FEED_SCORE.AFFINITY_TERM,
      9,
    );
    expect(FEED_SCORE.AFFINITY_TERM).toBeLessThan(FEED_SCORE.FRESH_TERM);
  });
});

describe('controlled exploration', () => {
  it('noise is in [0, 1), stable for a session, and different across sessions', () => {
    const a = explorationNoise('clip-1', 'seed-a');
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
    expect(explorationNoise('clip-1', 'seed-a')).toBe(a);
    expect(explorationNoise('clip-1', 'seed-b')).not.toBe(a);
    expect(explorationNoise('clip-2', 'seed-a')).not.toBe(a);
  });

  it('matches what Postgres computes from md5', () => {
    // psql: SELECT (('x' || substr(md5('clip-1seed-a'), 1, 8))::bit(32)::int) / 4294967296.0 + 0.5
    //   md5 = becee746…, 0xbecee746 as int32 = -1093736634 → 0.24534459551796317
    expect(explorationNoise('clip-1', 'seed-a')).toBeCloseTo(-1093736634 / 4294967296 + 0.5, 12);
  });

  it('is bounded: noise alone never outranks a follow or a fresh upload', () => {
    expect(FEED_SCORE.EXPLORE_TERM).toBeLessThan(FEED_SCORE.FOLLOW_TERM);
    expect(FEED_SCORE.EXPLORE_TERM).toBeLessThan(FEED_SCORE.FRESH_TERM);
  });

  it('two sessions get different orders among otherwise equal clips', () => {
    const equal = (seed: string) =>
      ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].map((id) => ({
        ...clip({ mediaId: id, seed }),
        playerId: id,
      }));
    const orderA = rankFeed(equal('seed-a')).map((c) => c.mediaId);
    const orderB = rankFeed(equal('seed-b')).map((c) => c.mediaId);
    expect(orderA).not.toEqual(orderB);
    expect([...orderA].sort()).toEqual([...orderB].sort());
  });
});

describe('diversification', () => {
  it('a player’s second and third clips step down, capped', () => {
    expect(diversityPenalty(1)).toBe(0);
    expect(diversityPenalty(2)).toBe(FEED_SCORE.DIVERSITY_PENALTY);
    expect(diversityPenalty(3)).toBe(2 * FEED_SCORE.DIVERSITY_PENALTY);
    expect(diversityPenalty(9)).toBe(FEED_SCORE.DIVERSITY_MAX_STEPS * FEED_SCORE.DIVERSITY_PENALTY);
  });

  it('one player’s four near-identical clips do not fill the top four', () => {
    const seed = 'seed-a';
    const dominant = [1, 2, 3, 4].map((n) => ({
      ...clip({
        mediaId: `dom-${n}`,
        seed,
        likes: 20,
        views: 100,
        likesRecent: 5,
        viewsRecent: 30,
      }),
      playerId: 'dominant',
    }));
    const others = [1, 2, 3].map((n) => ({
      ...clip({
        mediaId: `oth-${n}`,
        seed,
        likes: 12,
        views: 100,
        likesRecent: 3,
        viewsRecent: 20,
      }),
      playerId: `other-${n}`,
    }));
    const order = rankFeed([...dominant, ...others]).map((c) => c.playerId);
    expect(new Set(order.slice(0, 4)).size).toBeGreaterThan(1);
  });
});
